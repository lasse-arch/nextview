import "server-only";
import { prisma } from "@/lib/db";
import { getSettingValue } from "@/lib/integration-settings";
import {
  ASSUMPTION_KEYS,
  FLAT_SEASON,
  SCENARIO_KEYS,
  cleanAssumptions,
  cleanCostLines,
  forecastYear,
  type ActualMonth,
  type Assumptions,
  type CostLine,
  type MonthResult,
  type OpenDeal,
  type ScenarioKey,
  type StartCustomer,
} from "@/lib/forecast";

/*
 * Prognose and Budget's data (admin only - the pages and actions check): the
 * history the assumptions come from, today's customers and open deals, the
 * real months to hold the forecast up against, and the plan an admin saved
 * for a year (assumptions set by hand, cost lines, a locked forecast).
 * The plan is kept as one JSON value per year in IntegrationSetting ("PLAN_2027").
 */

const DAY = 86_400_000;
const SOLD_STAGES = new Set(["CONTRACT_SIGNED", "FILMED", "REVIEW", "LIVE"]);
const PIPELINE = new Set(["CONTRACT_SIGNED", "FILMED", "REVIEW"]);
const OPEN = new Set(["MEETING_BOOKED", "FOLLOW_UP", "CONTRACT_SENT"]);
/** Weeks a year with selling when nothing else is set: 52 less holidays and slow weeks. */
const DEFAULT_SALES_WEEKS = 44;

export type Basis = Record<keyof Assumptions, string>;
export type { ActualMonth } from "@/lib/forecast";

export type ForecastHistory = {
  assumptions: Assumptions;
  basis: Basis;
  season: number[];
  seasonFromData: boolean;
  start: StartCustomer[];
  open: OpenDeal[];
  /** The last 24 months and this year's months so far, as they really were. */
  actual: ActualMonth[];
  hoursPerTour: number | null;
  /** Customers billing today, and their monthly total. */
  today: { customers: number; mrr: number; pipeline: number; open: number };
  /** The months the assumptions are read from. */
  window: number;
  /** How many months Arpo has real data for (meetings or sales). */
  monthsOfData: number;
};

export type LockedForecast = { at: string; by: string; scenario: ScenarioKey; assumptions: Assumptions; months: MonthResult[] };
export type Plan = {
  year: number;
  overrides: Partial<Assumptions>;
  costs: CostLine[];
  startCash: number;
  /** What the budget is held against: a scenario, or the locked forecast ("laast"). */
  budgetScenario: ScenarioKey | "laast";
  locked: LockedForecast | null;
  /** "Tallene bygger på": months back the assumptions are read from - null = Arpo picks. */
  window: number | null;
  /** The sales goal: sold for (contract value) a month, in kr. - 0 = none. */
  salesGoal: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const ymKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

/** How many months back the assumptions are read from ("Tallene bygger på"). */
export const HISTORY_WINDOWS = [2, 3, 6, 12] as const;

/**
 * The history the assumptions come from - read from the last `windowMonths`
 * months (default: a year, or all there is when it's less than half a year).
 */
export async function forecastHistory(now = new Date(), windowMonths?: number): Promise<ForecastHistory> {
  const [deals, invoices, time] = await Promise.all([
    prisma.deal.findMany({
      select: {
        id: true,
        ownerId: true,
        stage: true,
        inLeadInbox: true,
        meetingDate: true,
        soldAt: true,
        liveAt: true,
        churnedAt: true,
        contractSentAt: true,
        contractSignedAt: true,
        saleAmount: true,
        establishmentFee: true,
        billingStartDate: true,
        contractEndDate: true,
        bindingMonths: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.invoice.findMany({
      where: { scheduledDate: { gte: new Date(now.getFullYear() - 2, 0, 1) }, status: { in: ["DRAFT_CREATED", "SENT_MANUALLY", "IMPORTED"] } },
      select: { scheduledDate: true, amount: true, creditedAmount: true, creditedFull: true },
    }),
    prisma.timeEntry.groupBy({ by: ["dealId"], where: { source: "MANUAL", deal: { liveAt: { gte: new Date(now.getTime() - 365 * DAY) } } }, _sum: { minutes: true } }),
  ]);

  // How long Arpo has had real data: from the first meeting or sale.
  const firstData = deals.reduce<number>((min, d) => Math.min(min, d.meetingDate?.getTime() ?? Infinity, d.soldAt?.getTime() ?? Infinity), Infinity);
  const monthsOfData = Number.isFinite(firstData) ? Math.max(0, Math.floor((now.getTime() - firstData) / (30.44 * DAY))) : 0;
  const win = HISTORY_WINDOWS.includes(windowMonths as (typeof HISTORY_WINDOWS)[number]) ? windowMonths! : monthsOfData < 6 ? Math.max(2, Math.min(6, monthsOfData || 2)) : 12;
  const yearAgo = new Date(now.getFullYear(), now.getMonth() - win, now.getDate());
  const winWeeks = (now.getTime() - yearAgo.getTime()) / (7 * DAY);
  const period = win === 12 ? "det seneste år" : `de seneste ${win} måneder`;
  const isSold = (d: (typeof deals)[number]) => Boolean(d.soldAt) || SOLD_STAGES.has(d.stage) || Boolean(d.churnedAt && d.contractSignedAt);

  // Meetings held: how many, by whom, over how long.
  const held = deals.filter((d) => d.meetingDate && d.meetingDate <= now);
  const heldYear = held.filter((d) => d.meetingDate! >= yearAgo);
  const firstMeeting = held.reduce<Date | null>((min, d) => (!min || d.meetingDate! < min ? d.meetingDate! : min), null);
  const spanWeeks = firstMeeting ? Math.max(4, Math.min(winWeeks, (now.getTime() - Math.max(firstMeeting.getTime(), yearAgo.getTime())) / (7 * DAY))) : winWeeks;
  const halfYear = new Date(now.getFullYear(), now.getMonth() - Math.min(6, win), now.getDate());
  const byOwner = new Map<string, number>();
  for (const d of held.filter((d) => d.meetingDate! >= halfYear)) byOwner.set(d.ownerId, (byOwner.get(d.ownerId) ?? 0) + 1);
  const sellers = Math.max(1, [...byOwner.values()].filter((n) => n >= Math.min(3, win)).length || byOwner.size || 1);
  const yearlyMeetings = (heldYear.length / spanWeeks) * 52;
  const meetingsPerSellerWeek = yearlyMeetings / sellers / DEFAULT_SALES_WEEKS;

  // Close rate: meetings in the period that have had time to be decided (two weeks; a month when reading a year).
  const settle = (win >= 6 ? 30 : 14) * DAY;
  const decided = held.filter((d) => d.meetingDate! <= new Date(now.getTime() - settle) && d.meetingDate! >= new Date(yearAgo.getTime() - (win >= 6 ? 90 * DAY : settle)));
  const won = decided.filter(isSold);
  const closeRate = decided.length ? (won.length / decided.length) * 100 : 25;

  // Contracts sent → signed (open contracts are weighted with this).
  const sent = deals.filter((d) => d.contractSentAt && d.contractSentAt >= yearAgo && d.contractSentAt <= new Date(now.getTime() - 14 * DAY));
  const sentRate = sent.length >= 3 ? sent.filter(isSold).length / sent.length : 0.6;

  // Prices of the last year's sales.
  const soldYear = deals.filter((d) => d.soldAt && d.soldAt >= yearAgo && d.soldAt <= now);
  const soldPool = soldYear.length >= 3 ? soldYear : deals.filter((d) => d.soldAt);
  const avgMonthly = avg(soldPool.filter((d) => (d.saleAmount ?? 0) > 0).map((d) => d.saleAmount!)) ?? 0;
  const avgEstablishment = avg(soldPool.map((d) => d.establishmentFee ?? 0)) ?? 0;
  const bindingMonths = avg(soldPool.filter((d) => (d.bindingMonths ?? 0) > 0).map((d) => d.bindingMonths!)) ?? 12;

  // Churn: customers who stopped in the last year, against everyone who billed in it.
  const liveNow = deals.filter((d) => d.stage === "LIVE" && !d.churnedAt && (d.saleAmount ?? 0) > 0);
  const churnedYear = deals.filter((d) => d.churnedAt && d.churnedAt >= yearAgo && d.churnedAt <= now);
  const churnBase = liveNow.length + churnedYear.length;
  const churnPerYear = churnBase ? Math.min(100, ((churnedYear.length * (12 / win)) / churnBase) * 100) : 5;

  // Time: meeting → signature, signature → live.
  const toSign = median(deals.filter((d) => d.meetingDate && d.soldAt && d.soldAt >= d.meetingDate && d.soldAt >= new Date(now.getTime() - 548 * DAY)).map((d) => (d.soldAt!.getTime() - d.meetingDate!.getTime()) / DAY));
  const toLive = median(deals.filter((d) => d.soldAt && d.liveAt && d.liveAt >= d.soldAt && d.liveAt >= new Date(now.getTime() - 548 * DAY)).map((d) => (d.liveAt!.getTime() - d.soldAt!.getTime()) / DAY));

  // Most customers gone live in one month (a hint for the capacity).
  const livesByMonth = new Map<string, number>();
  for (const d of deals.filter((d) => d.liveAt && d.liveAt >= yearAgo)) livesByMonth.set(ymKey(d.liveAt!), (livesByMonth.get(ymKey(d.liveAt!)) ?? 0) + 1);
  const maxLives = Math.max(0, ...livesByMonth.values());

  const assumptions: Assumptions = {
    sellers,
    meetingsPerSellerWeek: round(meetingsPerSellerWeek, 1),
    salesWeeks: DEFAULT_SALES_WEEKS,
    closeRate: round(closeRate),
    avgMonthly: Math.round(avgMonthly),
    avgEstablishment: Math.round(avgEstablishment),
    churnPerYear: round(churnPerYear),
    daysToSign: Math.round(toSign ?? 14),
    daysToLive: Math.round(toLive ?? 30),
    capacityPerMonth: 0,
    bindingMonths: Math.round(bindingMonths),
    priceStepMonth: 0,
    priceStepMonthly: 0,
    priceStepEstablishment: 0,
  };
  const basis: Basis = {
    sellers: byOwner.size ? `${byOwner.size} har holdt møder det seneste halve år` : "Ingen møder endnu",
    meetingsPerSellerWeek: heldYear.length ? `${heldYear.length} møder ${period}` : "Ingen møder endnu",
    salesWeeks: "52 uger minus ferier og stille uger",
    closeRate: decided.length ? `${won.length} af ${decided.length} møder blev til en kunde` : "For få møder - et gæt",
    avgMonthly: soldPool.length ? `Snit af ${soldPool.length} salg` : "Ingen salg endnu",
    avgEstablishment: soldPool.length ? `Snit af ${soldPool.length} salg` : "Ingen salg endnu",
    churnPerYear: churnBase ? `${churnedYear.length} af ${churnBase} kunder stoppede ${period}` : "Ingen kunder endnu - et gæt",
    daysToSign: toSign !== null ? "Midten af jeres salg" : "Et gæt - for få salg med mødedato",
    daysToLive: toLive !== null ? "Midten af jeres kunder" : "Et gæt - for få kunder gået live",
    capacityPerMonth: maxLives ? `Højest ${maxLives} gik live på én måned. 0 = ingen grænse` : "0 = ingen grænse",
    bindingMonths: soldPool.length ? `Snit af ${soldPool.length} salg. Ingen stopper før` : "Et gæt",
    priceStepMonth: "0 = samme priser hele året",
    priceStepMonthly: "0 = som nu",
    priceStepEstablishment: "0 = som nu",
  };

  // Season: meetings per calendar month over the last two years - only when there are enough of them.
  const window = held.filter((d) => d.meetingDate! >= new Date(now.getFullYear() - 2, now.getMonth(), 1));
  const counts = Array.from({ length: 12 }, () => 0);
  const seen = Array.from({ length: 12 }, () => new Set<string>());
  for (const d of window) {
    counts[d.meetingDate!.getMonth()] += 1;
  }
  const from = window.reduce<Date | null>((min, d) => (!min || d.meetingDate! < min ? d.meetingDate! : min), null);
  if (from) for (let c = new Date(from.getFullYear(), from.getMonth(), 1); c <= now; c = new Date(c.getFullYear(), c.getMonth() + 1, 1)) seen[c.getMonth()].add(ymKey(c));
  const coversYear = seen.every((s) => s.size > 0);
  let season = FLAT_SEASON;
  let seasonFromData = false;
  if (coversYear && window.length >= 40) {
    const rate = counts.map((n, m) => n / seen[m].size);
    const total = rate.reduce((s, x) => s + x, 0);
    if (total > 0) {
      // A little smoothing, so one odd month doesn't make or break the year.
      season = rate.map((r) => 0.7 * (r / total) + 0.3 / 12);
      seasonFromData = true;
    }
  }

  // Today's customers: billing, or signed and on their way.
  const start: StartCustomer[] = deals
    .filter((d) => !d.churnedAt && (d.saleAmount ?? 0) > 0 && (d.stage === "LIVE" || PIPELINE.has(d.stage)))
    .map((d) => {
      let liveFrom = d.billingStartDate ?? d.liveAt;
      if (!liveFrom || d.stage !== "LIVE") {
        const signedAt = d.contractSignedAt ?? d.soldAt ?? now;
        const expected = new Date(signedAt.getTime() + assumptions.daysToLive * DAY);
        liveFrom = expected < now ? new Date(now.getTime() + 14 * DAY) : expected;
      }
      const boundUntil = d.bindingMonths ? new Date(liveFrom.getFullYear(), liveFrom.getMonth() + d.bindingMonths, liveFrom.getDate()) : null;
      return { monthly: d.saleAmount!, liveFrom: liveFrom.toISOString(), endsAt: d.contractEndDate ? d.contractEndDate.toISOString() : null, boundUntil: boundUntil ? boundUntil.toISOString() : null };
    });

  // Open deals still in play: a meeting held, a follow-up, a contract out - recent ones only.
  const fresh = new Date(now.getTime() - 120 * DAY);
  const open: OpenDeal[] = deals
    .filter((d) => OPEN.has(d.stage) && !d.inLeadInbox && !d.churnedAt)
    .filter((d) => (d.stage === "MEETING_BOOKED" ? Boolean(d.meetingDate && d.meetingDate <= now && d.meetingDate >= fresh) : (d.contractSentAt ?? d.meetingDate ?? d.updatedAt) >= fresh))
    .map((d) => ({
      monthly: d.saleAmount ?? assumptions.avgMonthly,
      establishment: d.establishmentFee ?? assumptions.avgEstablishment,
      chance: d.stage === "CONTRACT_SENT" ? sentRate : assumptions.closeRate / 100,
    }));

  // The real months: the last 24, through this one.
  const actual: ActualMonth[] = [];
  for (let i = 23; i >= 0; i--) {
    const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const inMonth = (x: Date | null) => Boolean(x && x >= mStart && x < mEnd && x <= now);
    const sold = deals.filter((d) => inMonth(d.soldAt));
    const billing = deals.filter((d) => {
      const from = d.billingStartDate ?? d.liveAt;
      return from && from < mEnd && (!d.churnedAt || d.churnedAt >= mEnd) && (d.saleAmount ?? 0) > 0 && (d.stage === "LIVE" || d.churnedAt);
    });
    actual.push({
      ym: ymKey(mStart),
      meetings: deals.filter((d) => inMonth(d.meetingDate)).length,
      newCustomers: sold.length,
      newMonthly: sold.reduce((s, d) => s + (d.saleAmount ?? 0), 0),
      establishment: sold.reduce((s, d) => s + (d.establishmentFee ?? 0), 0),
      soldValue: sold.reduce((s, d) => s + (d.establishmentFee ?? 0) + (d.saleAmount ?? 0) * Math.max(1, d.bindingMonths ?? 1), 0),
      customers: billing.length,
      mrr: billing.reduce((s, d) => s + (d.saleAmount ?? 0), 0),
      invoiced: invoices
        .filter((v) => v.scheduledDate >= mStart && v.scheduledDate < mEnd)
        .reduce((s, v) => s + (v.creditedFull ? 0 : v.amount - (v.creditedAmount ?? 0)), 0),
    });
  }

  const hours = time.map((t) => (t._sum.minutes ?? 0) / 60).filter((h) => h > 0);
  return {
    assumptions,
    basis,
    season,
    seasonFromData,
    start,
    open,
    actual,
    hoursPerTour: hours.length >= 3 ? round(avg(hours)!, 1) : null,
    window: win,
    monthsOfData,
    today: {
      customers: liveNow.length,
      mrr: liveNow.reduce((s, d) => s + (d.saleAmount ?? 0), 0),
      pipeline: start.length - liveNow.length,
      open: open.length,
    },
  };
}

/* -------------------------------------------------------------------- plan */

const planKey = (year: number) => `PLAN_${year}`;

export function emptyPlan(year: number): Plan {
  return { year, overrides: {}, costs: [], startCash: 0, budgetScenario: "realistisk", locked: null, window: null, salesGoal: 0, updatedAt: null, updatedBy: null };
}

/** The plan saved for a year - checked again on the way out, whatever is in the database. */
export async function loadPlan(year: number): Promise<Plan> {
  const row = await prisma.integrationSetting.findUnique({ where: { key: planKey(year) } });
  if (!row?.value) return emptyPlan(year);
  try {
    const raw = JSON.parse(row.value) as Partial<Plan>;
    return {
      year,
      overrides: cleanAssumptions(raw.overrides),
      costs: cleanCostLines(raw.costs),
      startCash: typeof raw.startCash === "number" && Number.isFinite(raw.startCash) ? raw.startCash : 0,
      budgetScenario: raw.budgetScenario === "laast" || SCENARIO_KEYS.includes(raw.budgetScenario as ScenarioKey) ? (raw.budgetScenario as ScenarioKey | "laast") : "realistisk",
      locked: raw.locked && Array.isArray(raw.locked.months) ? (raw.locked as LockedForecast) : null,
      window: HISTORY_WINDOWS.includes(raw.window as (typeof HISTORY_WINDOWS)[number]) ? (raw.window as number) : null,
      salesGoal: typeof raw.salesGoal === "number" && Number.isFinite(raw.salesGoal) && raw.salesGoal > 0 ? Math.min(1e9, raw.salesGoal) : 0,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
      updatedBy: typeof raw.updatedBy === "string" ? raw.updatedBy : null,
    };
  } catch {
    return emptyPlan(year);
  }
}

export async function savePlan(plan: Plan): Promise<void> {
  const value = JSON.stringify(plan);
  await prisma.integrationSetting.upsert({ where: { key: planKey(plan.year) }, create: { key: planKey(plan.year), value }, update: { value } });
}

/** History's assumptions with the plan's own on top. */
export function mergedAssumptions(history: ForecastHistory, plan: Plan): Assumptions {
  const out = { ...history.assumptions };
  for (const k of ASSUMPTION_KEYS) if (plan.overrides[k] !== undefined) out[k] = plan.overrides[k]!;
  return out;
}

/** The three scenarios for a year, from the saved plan. */
export function scenariosFor(history: ForecastHistory, plan: Plan, now = new Date()): Record<ScenarioKey, MonthResult[]> {
  const assumptions = mergedAssumptions(history, plan);
  const base = { assumptions, season: history.season, start: history.start, open: history.open, now, year: plan.year };
  return {
    forsigtig: forecastYear({ ...base, scenario: "forsigtig" }),
    realistisk: forecastYear({ ...base, scenario: "realistisk" }),
    ambitios: forecastYear({ ...base, scenario: "ambitios" }),
  };
}

/** Which years the pages offer: this year and the next two. */
export function planYears(now = new Date()): number[] {
  const y = now.getFullYear();
  return [y, y + 1, y + 2];
}
/** The year a page opens on: next year from September, else this one. */
export function defaultPlanYear(now = new Date()): number {
  return now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear();
}

/** The suggested cost lines for an empty budget - the ones Arpo can guess are filled in. */
export async function suggestedCosts(): Promise<CostLine[]> {
  const [breakEven, commissions] = await Promise.all([
    getSettingValue("BREAKEVEN_MONTHLY_COST"),
    prisma.commission.findMany({ where: { createdAt: { gte: new Date(Date.now() - 365 * DAY) } }, select: { amount: true } }),
  ]);
  const perCustomer = Number(breakEven) || 0;
  const perSale = commissions.length ? Math.round(commissions.reduce((s, c) => s + c.amount, 0) / commissions.length) : 0;
  return [
    { id: "loen", name: "Lønninger", kind: "monthly", amount: 0, from: 1, to: 12 },
    { id: "husleje", name: "Husleje og kontor", kind: "monthly", amount: 0, from: 1, to: 12 },
    { id: "software", name: "Software og abonnementer", kind: "monthly", amount: 0, from: 1, to: 12 },
    { id: "biler", name: "Biler og kørsel", kind: "monthly", amount: 0, from: 1, to: 12 },
    { id: "marketing", name: "Markedsføring", kind: "monthly", amount: 0, from: 1, to: 12 },
    { id: "drift", name: "Drift pr. kunde (hosting, Matterport)", kind: "perCustomer", amount: perCustomer, from: 1, to: 12 },
    { id: "provision", name: "Provision pr. ny kunde", kind: "perSale", amount: perSale, from: 1, to: 12 },
  ];
}
