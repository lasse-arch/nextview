import Link from "next/link";
import { prisma } from "@/lib/db";
import { teamCan } from "@/lib/team-roles";
import type { getCurrentUser } from "@/lib/auth";
import { demoVisits, type DemoVisit } from "@/lib/demo-visits";
import { DemoVisitsHover } from "@/components/demo-visit";

/*
 * Generator → Mail → Sendt: the mails AND the SMS'es sent from Arpo, newest
 * first - whether a mail was opened (its tracking pixel: shown once the
 * recipient's mail shows pictures, so "ikke åbnet" can also mean pictures
 * were off) and whether a showcase link was clicked (visits on that link).
 * At the top the totals for what's filtered: sent, opened, links opened and
 * the minutes people spent in the tours. Filter by who sent it, mail or SMS,
 * and how far back. A seller sees their own, an admin everyone's (and may
 * pick a seller).
 */

const when = (d: Date) =>
  d.toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" });

export type SentFilter = { fra?: string; kanal?: string; dage?: string };
const PERIODS = [
  { key: "idag", label: "I dag" },
  { key: "7", label: "7 dage" },
  { key: "30", label: "30 dage" },
  { key: "90", label: "90 dage" },
  { key: "alt", label: "Alt" },
] as const;
const CHANNELS = [
  { key: "alle", label: "Mail og SMS" },
  { key: "mail", label: "Mail" },
  { key: "sms", label: "SMS" },
] as const;
/** Rows shown in the list (the numbers at the top count everything in the filter). */
const LIST_MAX = 60;

/** The start of the period (null = everything). */
const sinceOf = (dage: string) => (dage === "alt" ? null : dage === "idag" ? todayStart() : new Date(Date.now() - Number(dage) * 86_400_000));
/** Midnight today in Denmark (the server runs in UTC). */
function todayStart(): Date {
  const now = new Date();
  const dk = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Copenhagen" }));
  const offset = dk.getTime() - new Date(now.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen" }).format(now);
  return new Date(new Date(`${day}T00:00:00Z`).getTime() - offset);
}

type LinkInfo = { slug: string; name: string; visits: DemoVisit[] };
type Row = {
  id: string;
  kind: "mail" | "sms";
  at: Date;
  to: string;
  cc: string | null;
  subject: string;
  by: string;
  /** Mails only: null = sent before opens were counted. */
  opens: { count: number; last: Date | null } | null;
  tracked: boolean;
  links: LinkInfo[];
  hasLinks: boolean;
};

export async function SentMails({ user, filter }: { user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>; filter: SentFilter }) {
  const admin = teamCan(user, "admin");
  // A seller only ever sees their own; an admin may narrow to one seller.
  const who = admin ? (filter.fra && filter.fra !== "alle" ? filter.fra : null) : user.id;
  const kanal = CHANNELS.some((c) => c.key === filter.kanal) ? filter.kanal! : "alle";
  const dage = PERIODS.some((p) => p.key === filter.dage) ? filter.dage! : "30";
  const since = sinceOf(dage);

  const [mails, smses] = await Promise.all([
    kanal === "sms"
      ? []
      : prisma.salesMail.findMany({
          where: { finalHow: "sendt", ...(who ? { userId: who } : {}), ...(since ? { finalAt: { gte: since } } : {}) },
          orderBy: { finalAt: "desc" },
          take: 2000,
          select: { id: true, userName: true, finalSubject: true, finalAt: true, sentTo: true, sentCc: true, trackingId: true, openedAt: true, lastOpenedAt: true, openCount: true, demoTokens: true, input: true },
        }),
    kanal === "mail"
      ? []
      : prisma.tourDemoLink.findMany({
          where: { label: { endsWith: "(SMS)" }, ...(who ? { createdById: who } : {}), ...(since ? { createdAt: { gte: since } } : {}) },
          orderBy: { createdAt: "desc" },
          take: 2000,
          select: { id: true, token: true, label: true, smsTo: true, createdAt: true, createdById: true, tourSlug: true },
        }),
  ]);

  // The showcase links behind both: mails carry their tokens, an SMS is one link itself.
  const tokens = [...new Set([...mails.flatMap((m) => m.demoTokens), ...smses.map((s) => s.token)])];
  const links = tokens.length
    ? await prisma.tourDemoLink.findMany({
        where: { token: { in: tokens } },
        select: { token: true, tourSlug: true, events: { select: { session: true, name: true, label: true, device: true, city: true, country: true, referrer: true, createdAt: true } } },
      })
    : [];
  const tourNames = new Map((await prisma.tour.findMany({ where: { slug: { in: [...new Set(links.map((l) => l.tourSlug))] } }, select: { slug: true, name: true } })).map((t) => [t.slug, t.name]));
  const byToken = new Map<string, LinkInfo>(links.map((l) => [l.token, { slug: l.tourSlug, name: tourNames.get(l.tourSlug) ?? l.tourSlug, visits: demoVisits(l.events) }]));

  // Who can be picked: everyone who has sent something (admins only).
  const senders = admin
    ? await (async () => {
        const [m, s] = await Promise.all([
          prisma.salesMail.findMany({ where: { finalHow: "sendt" }, distinct: ["userId"], select: { userId: true } }),
          prisma.tourDemoLink.findMany({ where: { label: { endsWith: "(SMS)" } }, distinct: ["createdById"], select: { createdById: true } }),
        ]);
        const ids = [...new Set([...m.map((x) => x.userId), ...s.map((x) => x.createdById)])];
        return prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
      })()
    : [];
  const smsPeople = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(smses.map((s) => s.createdById))] } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]));

  const rows: Row[] = [
    ...mails.map((m): Row => ({
      id: m.id,
      kind: "mail",
      at: m.finalAt ?? new Date(0),
      to: m.sentTo || (m.input as { company?: string } | null)?.company || "",
      cc: m.sentCc,
      subject: m.finalSubject ?? "",
      by: m.userName,
      opens: m.openedAt ? { count: m.openCount, last: m.lastOpenedAt ?? m.openedAt } : null,
      tracked: Boolean(m.trackingId),
      links: m.demoTokens.map((t) => byToken.get(t)).filter((l): l is LinkInfo => Boolean(l)),
      hasLinks: m.demoTokens.length > 0,
    })),
    ...smses.map((s): Row => {
      const l = byToken.get(s.token);
      return {
        id: s.id,
        kind: "sms",
        at: s.createdAt,
        to: s.label.replace(/ \(SMS\)$/, "") + (s.smsTo ? ` (${s.smsTo.replace(/^\+45/, "")})` : ""),
        cc: null,
        subject: `SMS med ${l?.name ?? s.tourSlug}`,
        by: smsPeople.get(s.createdById) ?? "",
        opens: null,
        tracked: false,
        links: l ? [l] : [],
        hasLinks: true,
      };
    }),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  // The numbers at the top.
  const mailRows = rows.filter((r) => r.kind === "mail");
  const tracked = mailRows.filter((r) => r.tracked);
  const opened = tracked.filter((r) => r.opens);
  const opens = opened.reduce((n, r) => n + (r.opens?.count ?? 0), 0);
  const withLinks = rows.filter((r) => r.hasLinks);
  const clicked = withLinks.filter((r) => r.links.some((l) => l.visits.length));
  const visits = rows.flatMap((r) => r.links.flatMap((l) => l.visits));
  const minutes = Math.round(visits.reduce((n, v) => n + v.seconds, 0) / 60);
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : "–");

  const href = (o: Partial<SentFilter>) => {
    const q = new URLSearchParams();
    const next = { fra: who && admin ? who : undefined, kanal, dage, ...o };
    if (next.fra && next.fra !== "alle") q.set("fra", next.fra);
    if (next.kanal && next.kanal !== "alle") q.set("kanal", next.kanal);
    if (next.dage && next.dage !== "30") q.set("dage", next.dage);
    const s = q.toString();
    return `/arpo/generator${s ? `?${s}` : ""}#sendt`;
  };
  const chip = (on: boolean) => `rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition ${on ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`;

  return (
    <section id="sendt" className="mt-6 scroll-mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Sendt</h2>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {admin && senders.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-slate-400">Sendt af</span>
            <Link href={href({ fra: "alle" })} className={chip(!who)}>
              Alle
            </Link>
            {senders.map((s) => (
              <Link key={s.id} href={href({ fra: s.id })} className={chip(who === s.id)}>
                {s.name.split(" ")[0]}
              </Link>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {CHANNELS.map((c) => (
            <Link key={c.key} href={href({ kanal: c.key })} className={chip(kanal === c.key)}>
              {c.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {PERIODS.map((p) => (
            <Link key={p.key} href={href({ dage: p.key })} className={chip(dage === p.key)}>
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Sendt" value={String(rows.length)} sub={`${mailRows.length} mail, ${rows.length - mailRows.length} SMS`} />
        <Stat label="Mails åbnet" value={kanal === "sms" ? "–" : `${opened.length} af ${tracked.length}`} sub={kanal === "sms" ? "SMS kan ikke måles" : `${pct(opened.length, tracked.length)}, ${opens} åbninger i alt`} />
        <Stat label="Link åbnet" value={`${clicked.length} af ${withLinks.length}`} sub={`${pct(clicked.length, withLinks.length)}, ${visits.length} besøg i alt`} />
        <Stat label="Minutter i touren" value={minutes.toLocaleString("da-DK")} sub={visits.length ? `ca. ${Math.round(minutes / visits.length) || "<1"} min. pr. besøg` : "Ingen besøg endnu"} />
      </div>

      {rows.length ? (
        <ul className="mt-4 divide-y divide-slate-100">
          {rows.slice(0, LIST_MAX).map((r) => {
            const ev = r.links.flatMap((l) => l.visits);
            const lastClick = ev.reduce<Date | null>((a, v) => (!a || new Date(v.start) > a ? new Date(v.start) : a), null);
            return (
              <li key={`${r.kind}-${r.id}`} className="py-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${r.kind === "sms" ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-600"}`}>{r.kind === "sms" ? "SMS" : "Mail"}</span>
                    <b className="font-medium text-slate-900">{r.to}</b>
                    {r.cc && <span className="text-slate-400"> (CC: {r.cc})</span>}
                    <span className="text-slate-500">
                      {" "}
                      - {r.subject}, {when(r.at)}, {r.by}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {r.kind === "mail" &&
                      (!r.tracked ? (
                        <span className="text-xs text-slate-400">Sendt før åbninger blev talt</span>
                      ) : r.opens ? (
                        <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-600/15">
                          Åbnet {r.opens.count} gang{r.opens.count === 1 ? "" : "e"}, sidst {r.opens.last ? when(r.opens.last) : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Ikke åbnet endnu</span>
                      ))}
                    {r.hasLinks &&
                      (ev.length ? (
                        <DemoVisitsHover
                          links={r.links}
                          chip={
                            <>
                              Link åbnet {ev.length} gang{ev.length === 1 ? "" : "e"}
                              {lastClick ? `, sidst ${when(lastClick)}` : ""}
                            </>
                          }
                        />
                      ) : (
                        <span className="text-xs text-slate-400">Link ikke åbnet</span>
                      ))}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-slate-500">{dage === "idag" ? "Intet sendt i dag endnu." : "Intet sendt i den valgte periode."}</p>
      )}
      {rows.length > LIST_MAX && <p className="mt-2 text-xs text-slate-400">Viser de {LIST_MAX} nyeste af {rows.length}. Tallene øverst tæller dem alle.</p>}
      <p className="mt-3 text-xs text-slate-400">
        Åbnet tælles, når modtagerens mailprogram viser billeder - nogle viser dem aldrig, andre henter dem af sig selv. Link åbnet er fremvisningslinkene i mailen eller SMS&apos;en. Minutter i touren er tiden fra første til sidste klik i hvert besøg.
      </p>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{sub}</div>
    </div>
  );
}
