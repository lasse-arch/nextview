/*
 * Prognose og budget (Virksomheden → Prognose / Budget): next year worked out
 * from the bottom up - meetings → sales → customers → money - with Arpo's own
 * history as the starting point (lib/forecast-data.ts reads it). Pure maths
 * here, no database: what the pages show and the tests check.
 *
 * Every amount is without moms (as the prices on the deals are): moms is the
 * state's money, collected and paid on - see the note on the Budget page.
 */

/** What the year is worked out from - each one from Arpo's history unless an admin set it by hand. */
export type Assumptions = {
  /** Sellers booking meetings. */
  sellers: number;
  /** Meetings held per seller per week. */
  meetingsPerSellerWeek: number;
  /** Weeks a year with selling (holidays and the like left out). */
  salesWeeks: number;
  /** Of the meetings held, how many become a signed customer (%). */
  closeRate: number;
  /** A new customer's monthly price (kr.). */
  avgMonthly: number;
  /** A new customer's establishment fee (kr.). */
  avgEstablishment: number;
  /** Of the customers, how many stop in a year (%). */
  churnPerYear: number;
  /** Days from the meeting to the signature. */
  daysToSign: number;
  /** Days from the signature until the customer is live (and billing starts). */
  daysToLive: number;
  /** Most tours we can film and deliver in a month - 0 = no limit. */
  capacityPerMonth: number;
  /** Months a new customer is bound - nobody stops before that. */
  bindingMonths: number;
  /** Bigger deals from this month of the year (1-12) - 0 = the same prices all year. */
  priceStepMonth: number;
  /** The monthly price from then (kr.) - 0 = unchanged. */
  priceStepMonthly: number;
  /** The establishment fee from then (kr.) - 0 = unchanged. */
  priceStepEstablishment: number;
};

export const ASSUMPTION_KEYS = [
  "sellers",
  "meetingsPerSellerWeek",
  "salesWeeks",
  "closeRate",
  "avgMonthly",
  "avgEstablishment",
  "churnPerYear",
  "daysToSign",
  "daysToLive",
  "capacityPerMonth",
  "bindingMonths",
  "priceStepMonth",
  "priceStepMonthly",
  "priceStepEstablishment",
] as const satisfies readonly (keyof Assumptions)[];

export const ASSUMPTION_LIMITS: Record<keyof Assumptions, [number, number]> = {
  sellers: [0, 50],
  meetingsPerSellerWeek: [0, 100],
  salesWeeks: [1, 52],
  closeRate: [0, 100],
  avgMonthly: [0, 1_000_000],
  avgEstablishment: [0, 10_000_000],
  churnPerYear: [0, 100],
  daysToSign: [0, 365],
  daysToLive: [0, 365],
  capacityPerMonth: [0, 1000],
  bindingMonths: [0, 120],
  priceStepMonth: [0, 12],
  priceStepMonthly: [0, 1_000_000],
  priceStepEstablishment: [0, 10_000_000],
};

/** A new customer's whole contract: establishment plus the monthly price over the binding. */
export const contractValue = (monthly: number, establishment: number, bindingMonths: number) => establishment + monthly * Math.max(1, bindingMonths);

export type ScenarioKey = "forsigtig" | "realistisk" | "ambitios";
/** The three takes on the same assumptions: what changes in each. */
export const SCENARIOS: Record<ScenarioKey, { label: string; meetings: number; close: number; churn: number; note: string }> = {
  forsigtig: { label: "Forsigtig", meetings: 0.8, close: 0.85, churn: 1.25, note: "20 % færre møder, 15 % lavere lukkerate og 25 % flere opsigelser" },
  realistisk: { label: "Realistisk", meetings: 1, close: 1, churn: 1, note: "Tallene, som de står" },
  ambitios: { label: "Ambitiøs", meetings: 1.15, close: 1.1, churn: 0.85, note: "15 % flere møder, 10 % højere lukkerate og 15 % færre opsigelser" },
};
export const SCENARIO_KEYS = Object.keys(SCENARIOS) as ScenarioKey[];

/** Today's customers: billing now, or signed and on their way to live. */
export type StartCustomer = {
  monthly: number;
  /** First day it bills (its live day - expected, when not live yet). */
  liveFrom: string;
  /** Its known last day (notice given, or a fixed term) - null = runs on. */
  endsAt: string | null;
  /** When its binding runs out - it can't stop before (null = it can). */
  boundUntil?: string | null;
};
/** An open deal (a meeting held, follow-up, contract out) - weighted by how likely it is to be signed. */
export type OpenDeal = { monthly: number; establishment: number; chance: number };

export type MonthResult = {
  /** "2027-01". */
  ym: string;
  meetings: number;
  newCustomers: number;
  newMonthly: number;
  establishment: number;
  /** "Solgt for": the new contracts' whole value (establishment + the monthly price over the binding). */
  soldValue: number;
  /** Customers billing at the month's end. */
  customers: number;
  /** Monthly revenue from subscriptions at the month's end. */
  mrr: number;
  /** Booked in the month: subscriptions + establishment. */
  revenue: number;
  /** Money in the bank in the month: subscriptions are billed a quarter ahead, establishment at once. */
  cashIn: number;
};

export type ForecastInput = {
  assumptions: Assumptions;
  /** Share of a year's meetings in each calendar month (12 numbers summing to 1). */
  season: number[];
  start: StartCustomer[];
  open: OpenDeal[];
  /** Today - the simulation runs from this month. */
  now: Date;
  year: number;
  scenario: ScenarioKey;
};

const ymOf = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}`;
const monthIndex = (d: Date) => d.getFullYear() * 12 + d.getMonth();
const DAYS_PER_MONTH = 30.44;

/** A flat year - when there isn't enough history to see a season. */
export const FLAT_SEASON = Array.from({ length: 12 }, () => 1 / 12);

/**
 * The year month by month for one scenario. Runs from the current month (so
 * what happens between now and the year's start is counted in) and returns
 * the target year's twelve months; months already over in the current year
 * are left out of the simulation's own numbers (the page shows the real ones).
 */
export function forecastYear(input: ForecastInput): MonthResult[] {
  const { assumptions: a, now, year } = input;
  const sc = SCENARIOS[input.scenario];
  const season = input.season.length === 12 ? input.season : FLAT_SEASON;
  const startIdx = monthIndex(now);
  const endIdx = year * 12 + 11;
  if (endIdx < startIdx) return [];

  const signLag = Math.max(0, Math.round(a.daysToSign / DAYS_PER_MONTH));
  const liveLag = Math.max(0, Math.round(a.daysToLive / DAYS_PER_MONTH));
  const yearlyMeetings = a.sellers * a.meetingsPerSellerWeek * a.salesWeeks * sc.meetings;
  const close = Math.min(1, (a.closeRate / 100) * sc.close);
  const monthlyChurn = 1 - Math.pow(1 - Math.min(0.99, (a.churnPerYear / 100) * sc.churn), 1 / 12);
  const binding = Math.max(0, Math.round(a.bindingMonths || 0));
  const span = endIdx - startIdx + 1;
  // The prices a deal signed in month `idx` gets: bigger from the step month of the year on.
  const stepIdx = a.priceStepMonth > 0 ? year * 12 + a.priceStepMonth - 1 : Infinity;
  const priceAt = (idx: number) =>
    idx >= stepIdx ? { monthly: a.priceStepMonthly || a.avgMonthly, est: a.priceStepEstablishment || a.avgEstablishment } : { monthly: a.avgMonthly, est: a.avgEstablishment };

  // What's left of the current month (the meetings already held are history).
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const leftOfMonth = Math.max(0, (daysInMonth - now.getDate() + 1) / daysInMonth);

  // Signatures per month: today's open deals over the coming months, then the new meetings after the lag.
  const signed = Array.from({ length: span + 1 }, () => ({ n: 0, monthly: 0, est: 0 }));
  const meetings = Array.from({ length: span }, () => 0);
  const openSpread = Math.max(1, signLag + 1);
  for (const d of input.open) {
    for (let k = 0; k < openSpread && k < span; k++) {
      signed[k].n += d.chance / openSpread;
      signed[k].monthly += (d.chance * d.monthly) / openSpread;
      signed[k].est += (d.chance * d.establishment) / openSpread;
    }
  }
  for (let t = 0; t < span; t++) {
    const month = (startIdx + t) % 12;
    meetings[t] = yearlyMeetings * season[month] * (t === 0 ? leftOfMonth : 1);
    const at = t + signLag;
    if (at < span) {
      const n = meetings[t] * close;
      const p = priceAt(startIdx + at);
      signed[at].n += n;
      signed[at].monthly += n * p.monthly;
      signed[at].est += n * p.est;
    }
  }

  // Go live after the lag - no more a month than we can deliver (the rest waits in line).
  const lives = Array.from({ length: span }, () => ({ n: 0, monthly: 0 }));
  let queue = { n: 0, monthly: 0 };
  for (let t = 0; t < span; t++) {
    const from = t - liveLag;
    if (from >= 0) {
      queue = { n: queue.n + signed[from].n, monthly: queue.monthly + signed[from].monthly };
    }
    const cap = a.capacityPerMonth > 0 ? a.capacityPerMonth : Infinity;
    const take = Math.min(queue.n, cap);
    const share = queue.n > 0 ? take / queue.n : 0;
    lives[t] = { n: take, monthly: queue.monthly * share };
    queue = { n: queue.n - take, monthly: queue.monthly * (1 - share) };
  }

  // Today's customers: known ends drop out; the rest wear down at the churn rate - but only once their binding has run out.
  const startAt = input.start.map((c) => ({
    monthly: c.monthly,
    from: monthIndex(new Date(c.liveFrom)),
    to: c.endsAt ? monthIndex(new Date(c.endsAt)) : Infinity,
    known: Boolean(c.endsAt),
    free: c.boundUntil ? monthIndex(new Date(c.boundUntil)) : startIdx,
  }));
  const wear = (months: number) => Math.pow(1 - monthlyChurn, Math.max(0, months));

  const out: MonthResult[] = [];
  for (let t = 0; t < span; t++) {
    const idx = startIdx + t;
    let customers = 0;
    let mrr = 0;
    let startingNow = 0;
    for (const c of startAt) {
      if (c.from > idx || c.to < idx) continue;
      const w = c.known ? 1 : wear(idx - Math.max(startIdx, c.free));
      customers += w;
      mrr += w * c.monthly;
      if (c.from === idx) startingNow += w * c.monthly;
    }
    // New customers, cohort by cohort: bound for `binding` months, then the churn rate.
    for (let k = 0; k <= t; k++) {
      if (!lives[k].n) continue;
      const w = wear(t - k - binding);
      customers += lives[k].n * w;
      mrr += lives[k].monthly * w;
      if (k === t) startingNow += lives[k].monthly;
    }

    // Money in: a quarter's subscriptions at its start; a customer starting mid-quarter pays the rest of it at once.
    const month = idx % 12;
    const quarterStart = month % 3 === 0;
    const monthsLeftInQuarter = 3 - (month % 3);
    const running = mrr - startingNow;
    const cashIn = (quarterStart ? running * 3 : 0) + startingNow * monthsLeftInQuarter + signed[t].est;

    if (Math.floor(idx / 12) === year) {
      out.push({
        ym: ymOf(year, month),
        meetings: meetings[t],
        newCustomers: signed[t].n,
        newMonthly: signed[t].monthly,
        establishment: signed[t].est,
        soldValue: signed[t].est + signed[t].monthly * Math.max(1, binding),
        customers,
        mrr,
        revenue: mrr + signed[t].est,
        cashIn,
      });
    }
  }
  return out;
}

/** A month as it really was (lib/forecast-data.ts). */
export type ActualMonth = { ym: string; meetings: number; newCustomers: number; newMonthly: number; establishment: number; soldValue: number; customers: number; mrr: number; invoiced: number };
export type YearRow = MonthResult & { kind: "actual" | "now" | "forecast" };

/**
 * The twelve months of a year as the pages show them: the real month when
 * it's over (revenue = its subscriptions + establishment; money in = what was
 * invoiced), the forecast when it's ahead - and the month we're in both: what
 * has happened so far plus the forecast for the rest of it.
 */
export function yearRows(year: number, nowYm: string, actual: ActualMonth[], forecast: MonthResult[]): YearRow[] {
  const byYm = new Map(forecast.map((m) => [m.ym, m]));
  const actualByYm = new Map(actual.map((a) => [a.ym, a]));
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`).flatMap((ym): YearRow[] => {
    const a = actualByYm.get(ym);
    const f = byYm.get(ym);
    const real = (x: ActualMonth) => ({ ym, meetings: x.meetings, newCustomers: x.newCustomers, newMonthly: x.newMonthly, establishment: x.establishment, soldValue: x.soldValue, customers: x.customers, mrr: x.mrr });
    if (ym < nowYm) return a ? [{ ...real(a), kind: "actual", revenue: a.mrr + a.establishment, cashIn: a.invoiced }] : [];
    if (!f) return [];
    if (ym === nowYm && a)
      return [
        {
          ym,
          kind: "now",
          meetings: a.meetings + f.meetings,
          newCustomers: a.newCustomers + f.newCustomers,
          newMonthly: a.newMonthly + f.newMonthly,
          establishment: a.establishment + f.establishment,
          soldValue: a.soldValue + f.soldValue,
          customers: f.customers,
          mrr: f.mrr,
          revenue: f.revenue + a.establishment,
          cashIn: f.cashIn + a.invoiced,
        },
      ];
    return [{ ...f, kind: "forecast" }];
  });
}

export type Totals = { meetings: number; newCustomers: number; newMonthly: number; establishment: number; soldValue: number; revenue: number; cashIn: number; endMrr: number; endCustomers: number };
export function totalsOf(months: MonthResult[]): Totals {
  const sum = (k: keyof MonthResult) => months.reduce((s, m) => s + (m[k] as number), 0);
  const last = months[months.length - 1];
  return {
    meetings: sum("meetings"),
    newCustomers: sum("newCustomers"),
    newMonthly: sum("newMonthly"),
    establishment: sum("establishment"),
    soldValue: sum("soldValue"),
    revenue: sum("revenue"),
    cashIn: sum("cashIn"),
    endMrr: last?.mrr ?? 0,
    endCustomers: last?.customers ?? 0,
  };
}

/* ------------------------------------------------------------------ budget */

export type CostKind = "monthly" | "once" | "perCustomer" | "perSale" | "percent";
export const COST_KINDS: Record<CostKind, { label: string; unit: string; help: string }> = {
  monthly: { label: "Fast pr. måned", unit: "kr./md.", help: "Løn, husleje, software, biler" },
  once: { label: "Én gang", unit: "kr.", help: "Et nyt kamera, en messe - i én bestemt måned" },
  perCustomer: { label: "Pr. kunde pr. måned", unit: "kr./kunde/md.", help: "Drift og hosting for hver kunde, der betaler" },
  perSale: { label: "Pr. ny kunde", unit: "kr./ny kunde", help: "Provision, rejse og filmning pr. salg" },
  percent: { label: "% af omsætningen", unit: "%", help: "Fx betalingsgebyrer" },
};
export const COST_KIND_KEYS = Object.keys(COST_KINDS) as CostKind[];

export type CostLine = {
  id: string;
  name: string;
  kind: CostKind;
  amount: number;
  /** First month (1-12) it applies - "monthly", "perCustomer", "perSale" and "percent". */
  from?: number;
  /** Last month (1-12). */
  to?: number;
  /** The month (1-12) of a "once". */
  month?: number;
};

/** One cost line's amount in a month (1-12), given that month's forecast. */
export function costInMonth(line: CostLine, month: number, m: Pick<MonthResult, "customers" | "newCustomers" | "revenue">): number {
  if (line.kind === "once") return (line.month ?? 1) === month ? line.amount : 0;
  if (month < (line.from ?? 1) || month > (line.to ?? 12)) return 0;
  switch (line.kind) {
    case "monthly":
      return line.amount;
    case "perCustomer":
      return line.amount * m.customers;
    case "perSale":
      return line.amount * m.newCustomers;
    case "percent":
      return (line.amount / 100) * m.revenue;
  }
}

export type BudgetMonth = { ym: string; revenue: number; costs: number; byLine: number[]; result: number; cumulative: number; cashIn: number; cash: number };

/** The budget month by month: the forecast's revenue against the cost lines - and the bank account, from `startCash`. */
export function budgetYear(months: MonthResult[], lines: CostLine[], startCash: number): BudgetMonth[] {
  let cumulative = 0;
  let cash = startCash;
  return months.map((m, i) => {
    const byLine = lines.map((l) => costInMonth(l, i + 1, m));
    const costs = byLine.reduce((s, x) => s + x, 0);
    const result = m.revenue - costs;
    cumulative += result;
    cash += m.cashIn - costs;
    return { ym: m.ym, revenue: m.revenue, costs, byLine, result, cumulative, cashIn: m.cashIn, cash };
  });
}

/* --------------------------------------------------------------- validation */

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Assumptions as sent from the page: only known keys, numbers inside their limits - anything else dropped. */
export function cleanAssumptions(raw: unknown): Partial<Assumptions> {
  const out: Partial<Assumptions> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const k of ASSUMPTION_KEYS) {
    const v = num((raw as Record<string, unknown>)[k]);
    if (v === null) continue;
    const [lo, hi] = ASSUMPTION_LIMITS[k];
    out[k] = Math.min(hi, Math.max(lo, v));
  }
  return out;
}

/** Cost lines as sent from the page - at most 60, each checked. */
export function cleanCostLines(raw: unknown): CostLine[] {
  if (!Array.isArray(raw)) return [];
  const month = (v: unknown) => {
    const n = num(v);
    return n === null ? undefined : Math.min(12, Math.max(1, Math.round(n)));
  };
  return raw.slice(0, 60).flatMap((r): CostLine[] => {
    if (!r || typeof r !== "object") return [];
    const o = r as Record<string, unknown>;
    const kind = COST_KIND_KEYS.includes(o.kind as CostKind) ? (o.kind as CostKind) : null;
    const amount = num(o.amount);
    if (!kind || amount === null) return [];
    const id = typeof o.id === "string" && /^[\w-]{1,40}$/.test(o.id) ? o.id : Math.random().toString(36).slice(2, 10);
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 80) : "";
    return [
      {
        id,
        name: name || COST_KINDS[kind].label,
        kind,
        amount: Math.min(kind === "percent" ? 100 : 100_000_000, Math.max(0, amount)),
        ...(kind === "once" ? { month: month(o.month) ?? 1 } : { from: month(o.from) ?? 1, to: month(o.to) ?? 12 }),
      },
    ];
  });
}

/* ------------------------------------------------------------ one past month */

export type MonthCheck = { meetings: number; newCustomers: number; soldValue: number; establishment: number; revenue: number; mrr: number };

/**
 * A month that is over, seen from the model: what its meetings should have
 * given with today's assumptions (the meetings `daysToSign` before it, times
 * the close rate) - to hold up against what really happened.
 */
export function backcastMonth(ym: string, actual: ActualMonth[], a: Assumptions): MonthCheck | null {
  const byYm = new Map(actual.map((m) => [m.ym, m]));
  const [y, m] = ym.split("-").map(Number);
  const shift = (k: number) => {
    const d = new Date(y, m - 1 - k, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const here = byYm.get(ym);
  if (!here) return null;
  const lag = Math.max(0, Math.round(a.daysToSign / DAYS_PER_MONTH));
  const basis = byYm.get(shift(lag))?.meetings ?? 0;
  const before = byYm.get(shift(1))?.mrr ?? here.mrr;
  const n = basis * (a.closeRate / 100);
  return {
    meetings: basis,
    newCustomers: n,
    soldValue: n * contractValue(a.avgMonthly, a.avgEstablishment, a.bindingMonths),
    establishment: n * a.avgEstablishment,
    mrr: before,
    revenue: before + n * a.avgEstablishment,
  };
}

/** Meetings per seller per week needed to sell for `goalPerMonth` kr. (contract value) a month. */
export function meetingsForSales(goalPerMonth: number, a: Assumptions): number | null {
  const perDeal = contractValue(a.avgMonthly, a.avgEstablishment, a.bindingMonths);
  const perMeeting = (a.closeRate / 100) * perDeal;
  if (!(goalPerMonth > 0) || perMeeting <= 0 || a.sellers <= 0 || a.salesWeeks <= 0) return null;
  return (goalPerMonth * 12) / perMeeting / a.sellers / a.salesWeeks;
}
