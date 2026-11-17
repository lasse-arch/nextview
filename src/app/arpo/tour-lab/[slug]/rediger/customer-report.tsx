import type { TourStats } from "@/lib/tour-stats";
import { shown, type ReportShare } from "@/lib/tour-share";

/*
 * The customer's report: exactly the numbers chosen to be shared - the same
 * component in the editor's preview and on the customer's link, so what we
 * see is what they get.
 */

export type ReportLang = "da" | "en";

/** The words - Danish, or English for the customer portal in English. */
const T = {
  da: {
    sec: "sek",
    phone: "Ringede",
    email: "Skrev en mail",
    direct: "Direkte (link/QR)",
    visits: "besøg",
    engaged: "gik på opdagelse i touren",
    typical: "typisk besøg",
    period: (days: number) => `Jeres virtuelle tour · seneste ${days} dage`,
    leads: "besøgende gik videre til booking eller kontakt fra touren",
    ofVisits: (p: string) => ` - ${p} af besøgene`,
    perDay: "Besøg pr. dag",
    went: "Det, besøgende gik videre til",
    free: "Ledige i touren",
    openedFree: "åbnede listen over ledige",
    bookedFree: "gik videre til booking af en bestemt",
    and: "og",
    places: "Det, de valgte i menuen",
    sources: "Hvor besøgene kom fra",
    rooms: "Hvor de gik rundt",
    roomsHint: "Rum, de besøgende kom ind i - uanset om de gik derhen selv eller via menuen",
    roomTime: "Hvor de blev længst",
    roomTimeHint: "Typisk tid i rummet",
    looks: "Hvor de kigger længst rundt",
    looksHint: "Steder, hvor de besøgende selv har stået og kigget rundt",
    looksVisits: "besøg",
    used: "Det, de brugte i touren",
    usedNames: { find: "Find vej", video: "Videoer", images: "Billeder", people: "Personer", boxes: "Infobokse", lineday: "En dag på linjen", day: "Dagsplan og skema", classes: "Holdplan", commute: "Vej hertil", links: "Links ud af touren" },
    found: (started: number, arrived: number) => `${started} fandt vej, ${arrived} nåede frem`,
    watched: "set i alt",
    most: "Mest",
    opened: "Det, de åbnede i touren",
  },
  en: {
    sec: "sec",
    phone: "Called",
    email: "Sent an e-mail",
    direct: "Direct (link/QR)",
    visits: "visits",
    engaged: "explored the tour",
    typical: "typical visit",
    period: (days: number) => `Your virtual tour · last ${days} days`,
    leads: "visitors went on to booking or contact from the tour",
    ofVisits: (p: string) => ` - ${p} of the visits`,
    perDay: "Visits per day",
    went: "What visitors went on to",
    free: "Available in the tour",
    openedFree: "opened the list of available units",
    bookedFree: "went on to book a particular one",
    and: "and",
    places: "What they picked in the menu",
    sources: "Where the visits came from",
    rooms: "Where they went",
    roomsHint: "Rooms visitors came to - whether they walked there or used the menu",
    roomTime: "Where they stayed longest",
    roomTimeHint: "Typical time in the room",
    looks: "Where they look around longest",
    looksHint: "Places where visitors stood and looked around themselves",
    looksVisits: "visits",
    used: "What they used in the tour",
    usedNames: { find: "Find your way", video: "Videos", images: "Pictures", people: "People", boxes: "Info boxes", lineday: "A day on the line", day: "Day plan and timetable", classes: "Class schedule", commute: "Getting here", links: "Links out of the tour" },
    found: (started: number, arrived: number) => `${started} found a way, ${arrived} got there`,
    watched: "watched in all",
    most: "Most",
    opened: "What they opened in the tour",
  },
};

const pct = (n: number) => `${Math.round(n * 100)} %`;

function Ranked({ rows, label, show = String }: { rows: { label: string; count: number }[]; label: (l: string) => string; /** How the number reads (e.g. as a time). */ show?: (n: number) => string }) {
  const max = rows[0]?.count ?? 1;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex justify-between gap-3 text-[13px]">
            <span className="truncate">{label(r.label)}</span>
            <span className="tabular-nums text-[#6e6e73]">{show(r.count)}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-[#f2f2f7]">
            <div className="h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: "var(--report-accent, #0071e3)" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A place visitors looked around at (lib/tour-looks.ts) - the room, never the exact view. */
export type ReportLook = { room: string; seconds: number; visits: number; image: string | null };

export function CustomerReport({ stats, share, brand, lang = "da", title, looks = [] }: { stats: TourStats; share: ReportShare; brand: string; lang?: ReportLang; title?: string; looks?: ReportLook[] }) {
  const t = T[lang];
  const duration = (s: number) => (s < 60 ? `${s} ${t.sec}` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} ${t.sec}` : ""}`);
  const label = (l: string) => (l === "phone" ? t.phone : l === "email" ? t.email : l === "direkte" ? t.direct : l);
  const leads = shown(share.leads, stats.leads);
  const actions = shown(share.actions, stats.leads) && stats.actions.length > 0;
  const tiles = [
    share.visits && [String(stats.visits), t.visits],
    share.engaged && [pct(stats.visits ? stats.engaged / stats.visits : 0), t.engaged],
    share.duration && stats.medianSeconds >= 5 && [duration(stats.medianSeconds), t.typical],
  ].filter(Boolean) as [string, string][];
  const card = "rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,.04)] ring-1 ring-black/[.05]";
  return (
    <div className="space-y-3">
      <div className="px-1">
        <div className="text-[13px] text-[#6e6e73]">{title ?? t.period(stats.days)}</div>
        <div className="text-[20px] font-semibold tracking-tight">{brand}</div>
      </div>
      {leads && (
        <div className={card}>
          <div className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">{stats.leads}</div>
          <p className="mt-1 text-[14px] leading-snug">
            {t.leads}
            {stats.visits ? <span className="text-[#6e6e73]">{t.ofVisits(pct(stats.leads / stats.visits))}</span> : null}.
          </p>
        </div>
      )}
      {tiles.length > 0 && (
        <div className={`grid gap-2 ${tiles.length === 3 ? "grid-cols-3" : tiles.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
          {tiles.map(([v, t]) => (
            <div key={t} className="rounded-xl bg-white px-3 py-2.5 ring-1 ring-black/[.05]">
              <div className="text-[19px] font-semibold tabular-nums tracking-tight">{v}</div>
              <div className="text-[12px] leading-snug text-[#6e6e73]">{t}</div>
            </div>
          ))}
        </div>
      )}
      {share.perDay && (
        <div className={card}>
          <div className="mb-2 text-[13px] font-medium text-[#6e6e73]">{t.perDay}</div>
          <DayBars days={stats.perDay} lang={lang} visitsWord={t.visits} />
        </div>
      )}
      {actions && (
        <div className={card}>
          <div className="mb-2 text-[13px] font-medium text-[#6e6e73]">{t.went}</div>
          <Ranked rows={stats.actions} label={label} />
        </div>
      )}
      {share.live && stats.live.opened > 0 && (
        <div className={card}>
          <div className="mb-2 text-[13px] font-medium text-[#6e6e73]">{t.free}</div>
          <p className="text-[14px] leading-snug">
            <b>{stats.live.opened}</b> {t.openedFree}
            {stats.live.booked ? (
              <>
                , {t.and} <b>{stats.live.booked}</b> {t.bookedFree}
              </>
            ) : null}
            .
          </p>
          {stats.live.units.length > 0 && (
            <div className="mt-3">
              <Ranked rows={stats.live.units} label={label} />
            </div>
          )}
        </div>
      )}
      {share.places && stats.places.length > 0 && (
        <div className={card}>
          <div className="mb-2 text-[13px] font-medium text-[#6e6e73]">{t.places}</div>
          <Ranked rows={stats.places} label={label} />
        </div>
      )}
      {share.rooms && stats.rooms.length > 0 && (
        <div className={card}>
          <div className="text-[13px] font-medium text-[#6e6e73]">{t.rooms}</div>
          <p className="mb-2 text-[11.5px] text-[#8e8e93]">{t.roomsHint}</p>
          <Ranked rows={stats.rooms} label={label} />
        </div>
      )}
      {share.roomTime && stats.roomTime.length > 0 && (
        <div className={card}>
          <div className="text-[13px] font-medium text-[#6e6e73]">{t.roomTime}</div>
          <p className="mb-2 text-[11.5px] text-[#8e8e93]">{t.roomTimeHint}</p>
          <Ranked rows={stats.roomTime.map((r) => ({ label: r.label, count: r.seconds }))} label={label} show={duration} />
        </div>
      )}
      {share.looks && looks.length > 0 && (
        <div className={card}>
          <div className="text-[13px] font-medium text-[#6e6e73]">{t.looks}</div>
          <p className="mb-3 text-[11.5px] text-[#8e8e93]">{t.looksHint}</p>
          <ul className="space-y-2.5">
            {looks.slice(0, 6).map((l) => (
              <li key={l.room} className="flex items-center gap-3">
                {l.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.image} alt="" loading="lazy" className="h-12 w-16 flex-none rounded-lg object-cover ring-1 ring-black/[.06]" />
                ) : (
                  <span className="h-12 w-16 flex-none rounded-lg bg-[#f2f2f7]" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2 text-[14px]">
                    <span className="truncate font-medium">{l.room}</span>
                    <span className="flex-none tabular-nums text-[#6e6e73]">{duration(l.seconds)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-[#f2f2f7]">
                    <div className="h-full rounded-full" style={{ width: `${(l.seconds / looks[0].seconds) * 100}%`, background: "var(--report-accent, #0071e3)" }} />
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-[#8e8e93]">
                    {l.visits} {t.looksVisits}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {share.used && (stats.used?.length ?? 0) > 0 && (
        <div className={card}>
          <div className="mb-2 text-[13px] font-medium text-[#6e6e73]">{t.used}</div>
          <UsedList used={stats.used!} lang={lang} />
        </div>
      )}
      {share.opened && stats.opened.length > 0 && (
        <div className={card}>
          <div className="mb-2 text-[13px] font-medium text-[#6e6e73]">{t.opened}</div>
          <Ranked rows={stats.opened} label={label} />
        </div>
      )}
      {share.sources && stats.sources.length > 0 && (
        <div className={card}>
          <div className="mb-2 text-[13px] font-medium text-[#6e6e73]">{t.sources}</div>
          <Ranked rows={stats.sources} label={label} />
        </div>
      )}
    </div>
  );
}

/** A day as it reads under its bar: "Tirs 10" / "Tue 10". */
function dayName(day: string, lang: ReportLang): string {
  const d = new Date(`${day}T12:00:00`);
  const wd = lang === "en" ? d.toLocaleDateString("en-GB", { weekday: "short" }) : ["Søn", "Man", "Tirs", "Ons", "Tors", "Fre", "Lør"][d.getDay()];
  return `${wd} ${d.getDate()}`;
}

/**
 * Visits per day as bars - the number over each bar and the day under it.
 * A long period (a month or more) names only some of the days, evenly
 * spread, so they never run into each other; the number is then shown on
 * hover only.
 */
function DayBars({ days, lang, visitsWord }: { days: TourStats["perDay"]; lang: ReportLang; visitsWord: string }) {
  const max = Math.max(1, ...days.map((d) => d.visits));
  const few = days.length <= 14;
  // Every n-th day named - at most ~8 names - and always the last.
  const step = Math.max(1, Math.ceil(days.length / 8));
  return (
    <div>
      <div className={`flex items-end gap-[2px] ${few ? "h-24" : "h-20"}`}>
        {days.map((d) => (
          <div key={d.day} title={`${dayName(d.day, lang)}: ${d.visits} ${visitsWord}`} className="flex h-full flex-1 flex-col items-center justify-end">
            {few && d.visits > 0 && <span className="mb-0.5 text-[11px] font-medium tabular-nums text-[#1d1d1f]">{d.visits}</span>}
            <div className="w-full rounded-t-[3px]" style={{ height: d.visits ? `${Math.max(4, (d.visits / max) * (few ? 80 : 100))}%` : 2, background: d.visits ? "var(--report-accent, #0071e3)" : "rgba(0,0,0,.06)" }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[2px] border-t border-black/[.06] pt-1.5">
        {days.map((d, i) => (
          <span key={d.day} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-[11px] text-[#8e8e93]">
            {(i % step === 0 && days.length - 1 - i >= step / 2) || i === days.length - 1 ? (few ? dayName(d.day, lang) : `${new Date(`${d.day}T12:00:00`).getDate()}/${new Date(`${d.day}T12:00:00`).getMonth() + 1}`) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/** "Det, de brugte i touren": each feature used, how many visits used it, and what in it - e.g. where Find vej took them. */
export function UsedList({ used, lang = "da" }: { used: NonNullable<TourStats["used"]>; lang?: ReportLang }) {
  const t = T[lang];
  const time = (s: number) => (s < 60 ? `${s} ${t.sec}` : s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1).replace(".", lang === "da" ? "," : ".")} t`);
  return (
    <ul className="divide-y divide-black/[.05]">
      {used.map((u) => {
        const bits = [
          u.key === "find" && u.started != null ? t.found(u.started, u.arrived ?? 0) : null,
          u.key === "video" && u.watchSeconds ? `${time(u.watchSeconds)} ${t.watched}` : null,
          u.top.length ? `${t.most}: ${u.top.slice(0, 3).map((x) => x.label).join(", ")}` : null,
        ].filter(Boolean);
        return (
          <li key={u.key} className="py-2 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3 text-[14px]">
              <span className="font-medium">{t.usedNames[u.key]}</span>
              <span className="flex-none tabular-nums text-[#6e6e73]">
                {u.visits} {t.looksVisits}
              </span>
            </div>
            {bits.length > 0 && <p className="mt-0.5 text-[12.5px] leading-snug text-[#6e6e73]">{bits.join(". ")}</p>}
          </li>
        );
      })}
    </ul>
  );
}
