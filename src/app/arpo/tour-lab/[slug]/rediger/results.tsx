"use client";

import { portalUrl } from "@/lib/public-urls";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setTourShare, tourShareLink } from "@/lib/actions/tours";
import { resetTourStats, tourStatsForPeriod } from "@/lib/actions/tour-period-stats";
import { DateRangePicker, periodText, presetName, type Period } from "@/components/date-range-picker";
import type { TourStats } from "@/lib/tour-stats";
import { shown, type ReportShare, type ShareWhen } from "@/lib/tour-share";
import { CustomerReport } from "./customer-report";
import { Choice, Field, Group, Toggle } from "./ui";

/*
 * "Resultater": what the tour brings the customer - the number to tell them
 * ("sent 34 visitors on to booking"), and what visitors look at on the way.
 */

const pct = (n: number) => `${Math.round(n * 100)} %`;
const duration = (s: number) => (s < 60 ? `${s} sek` : `${Math.floor(s / 60)} min ${s % 60 ? `${s % 60} sek` : ""}`.trim());
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "short" });

function Tile({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-[#f5f5f7] px-3 py-2.5">
      <div className="text-[20px] font-semibold tabular-nums tracking-tight">{value}</div>
      <div className="text-[12px] text-[#6e6e73]">{label}</div>
      {hint && <div className="text-[11px] text-[#8e8e93]">{hint}</div>}
    </div>
  );
}

/** A ranked list with a thin bar for each row's share of the top one. */
function Ranked({ rows, empty, show = String }: { rows: { label: string; count: number }[]; empty: string; /** How the number reads (e.g. as a time). */ show?: (n: number) => string }) {
  if (!rows.length) return <p className="text-[13px] text-[#8e8e93]">{empty}</p>;
  const max = rows[0].count;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex justify-between gap-3 text-[13px]">
            <span className="truncate">{r.label}</span>
            <span className="tabular-nums text-[#6e6e73]">{show(r.count)}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-[#f2f2f7]">
            <div className="h-full rounded-full bg-[#0071e3]" style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

type ShareProps = { slug: string; brand: string; share: ReportShare; shareStats: TourStats; token: string | null };

export function ResultsPanel({ stats, guideStops = [], guideNames = {}, ...shareProps }: { stats: TourStats; /** The guide's stops' titles, in order (to name the stop people left at). */ guideStops?: string[]; /** Each guided tour's name by its link ("#rundvisning…"). */ guideNames?: Record<string, string> } & ShareProps) {
  return (
    <>
      <OurNumbers slug={shareProps.slug} initial={stats} guideStops={guideStops} guideNames={guideNames} />
      <ShareSettings {...shareProps} />
    </>
  );
}

/**
 * Kundens rapport: which numbers the customer gets - each switched on or off,
 * booking/contact only when there are any (by default) - with exactly what
 * they'll see, and their own link.
 */
function ShareSettings({ slug, brand, share: initial, shareStats, token: initialToken }: ShareProps) {
  const router = useRouter();
  const [share, setShare] = useState(initial);
  const [token, setToken] = useState(initialToken);
  const [copied, setCopied] = useState(false);
  const [, start] = useTransition();
  const change = (patch: Partial<ReportShare>) => {
    const next = { ...share, ...patch };
    setShare(next);
    start(async () => {
      await setTourShare(slug, next);
      if (patch.days) router.refresh();
    });
  };
  const when = (key: "leads" | "actions", title: string) => (
    <div className="space-y-1.5">
      <div className="text-[15px]">{title}</div>
      <Choice
        value={share[key]}
        options={[
          ["auto", "Kun når der er nogen"],
          ["on", "Altid"],
          ["off", "Aldrig"],
        ]}
        onChange={(v: ShareWhen) => change({ [key]: v })}
      />
      {share[key] === "auto" && <p className="text-[11px] text-[#8e8e93]">{shown("auto", shareStats.leads) ? `Vises nu (${shareStats.leads} i perioden).` : "Skjult nu - ingen i perioden."}</p>}
    </div>
  );
  const url = token && typeof window !== "undefined" ? portalUrl(token, location.origin) : null;
  return (
    <>
      <Group title="Kundens rapport - det vi deler">
        <Field title="Periode">
          <Choice
            value={String(share.days) as "30" | "90"}
            options={[
              ["30", "30 dage"],
              ["90", "90 dage"],
            ]}
            onChange={(v) => change({ days: Number(v) as 30 | 90 })}
          />
        </Field>
        {when("leads", "Til booking eller kontakt")}
        {when("actions", "Hvad de gik videre til")}
        <Toggle on={share.visits} onChange={(on) => change({ visits: on })} title="Besøg" />
        <Toggle on={share.engaged} onChange={(on) => change({ engaged: on })} title="Gik på opdagelse" />
        <Toggle on={share.duration} onChange={(on) => change({ duration: on })} title="Typisk besøg (tid)" />
        <Toggle on={share.perDay} onChange={(on) => change({ perDay: on })} title="Besøg pr. dag" />
        <Toggle on={share.places} onChange={(on) => change({ places: on })} title="Det, de valgte i menuen" />
        <Toggle on={share.rooms} onChange={(on) => change({ rooms: on })} title="Hvor de gik rundt (rum)" />
        <Toggle on={share.roomTime} onChange={(on) => change({ roomTime: on })} title="Hvor de blev længst (tid i rum)" />
        <Toggle on={share.opened} onChange={(on) => change({ opened: on })} title="Det, de åbnede (punkter, infopunkter, stedkort, 360°)" />
        <Toggle on={share.sources} onChange={(on) => change({ sources: on })} title="Hvor besøgene kom fra" />
        <Toggle on={share.live} onChange={(on) => change({ live: on })} title="Ledige (live data)" />
        {url ? (
          <button
            type="button"
            className="w-full rounded-xl bg-white py-2 text-[14px] font-medium text-[#0071e3] ring-1 ring-black/[.06]"
            onClick={() => {
              navigator.clipboard?.writeText(url).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            }}
          >
            {copied ? "Kopieret ✓" : "Kopiér kundens link"}
          </button>
        ) : (
          <button
            type="button"
            className="w-full rounded-xl bg-[#0071e3] py-2 text-[14px] font-medium text-white"
            onClick={() =>
              start(async () => {
                const r = await tourShareLink(slug);
                if (r.ok) setToken(r.token);
              })
            }
          >
            Lav et link til kunden
          </button>
        )}
        <p className="text-[11px] leading-snug text-[#8e8e93]">Kunden ser præcis det, der står herunder - intet andet. Linket viser altid de nyeste tal.</p>
      </Group>
      <div className="rounded-2xl bg-[#e9e9eb]/60 p-3">
        <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-[#6e6e73]">Sådan ser kunden det</div>
        <CustomerReport stats={shareStats} share={share} brand={brand} />
      </div>
    </>
  );
}

function OurNumbers({ slug, initial, guideStops, guideNames }: { slug: string; initial: TourStats; guideStops: string[]; guideNames: Record<string, string> }) {
  const [hover, setHover] = useState<number | null>(null);
  // The period: the last 7 days to begin with (what the page loaded), any other picked above the numbers.
  const [stats, setStats] = useState(initial);
  const [period, setPeriod] = useState<Period>({ preset: "7", from: initial.from ?? initial.perDay[0]?.day ?? "", to: initial.to ?? initial.perDay.at(-1)?.day ?? "" });
  const [loading, startLoading] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const choose = (p: Period) => {
    setPeriod(p);
    setError(null);
    startLoading(async () => {
      const r = await tourStatsForPeriod(slug, p.from, p.to);
      if (r.ok) setStats(r.stats);
      else setError(r.error);
    });
  };
  const reset = () => {
    if (!confirm("Nulstil tallene? Touren tæller så besøg fra nu af - fx når den lige er gået live, og det kun er os, der har kigget på den. Intet slettes, men besøgene fra før tælles ikke med (heller ikke på kundesiden og i rapporterne).")) return;
    startLoading(async () => {
      const r = await resetTourStats(slug);
      if (!r.ok) return setError(r.error);
      const again = await tourStatsForPeriod(slug, period.from, period.to);
      if (again.ok) setStats(again.stats);
    });
  };
  const picker = (
    <div className="space-y-1">
      <DateRangePicker value={period} onChange={choose} disabled={loading} />
      <p className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11.5px] text-[#8e8e93]">
        <span>{stats.countedFrom ? `Tæller fra ${new Date(stats.countedFrom).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" })}` : "Tæller alle besøg"}</span>
        <button type="button" onClick={reset} disabled={loading} className="font-medium text-[#0071e3] hover:underline disabled:opacity-50">
          Nulstil tallene
        </button>
      </p>
      {error && <p className="px-1 text-[12px] text-[#ff3b30]">{error}</p>}
    </div>
  );
  const max = Math.max(1, ...stats.perDay.map((d) => d.visits));
  const conversion = stats.visits ? stats.leads / stats.visits : 0;
  const shown = hover != null ? stats.perDay[hover] : null;

  if (!stats.visits)
    return (
      <>
      {picker}
      <Group>
        <p className="text-[15px] font-medium">Ingen besøg endnu</p>
        <p className="text-[13px] leading-snug text-[#6e6e73]">
          {period.preset === "7" ? "" : `Ingen besøg i perioden (${periodText(period)}). `}Touren tæller selv besøg, klik på booking og kontakt, og hvad folk kigger på. Tallene kommer her, så snart touren bliver brugt (besøg fra forhåndsvisningen her tæller ikke med).
        </p>
      </Group>
      </>
    );

  return (
    <div className={`space-y-5 transition-opacity ${loading ? "opacity-50" : ""}`}>
      {picker}
      <Group>
        <div className="text-[13px] font-medium text-[#6e6e73]">
          {presetName(period.preset)} · {periodText(period)}
        </div>
        <div>
          <div className="text-[44px] font-semibold leading-none tracking-tight tabular-nums">{stats.leads}</div>
          <p className="mt-1 text-[15px] leading-snug">
            besøgende gik videre til booking eller kontakt
            <span className="text-[#6e6e73]"> - {pct(conversion)} af alle besøg.</span>
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Tile value={String(stats.visits)} label="Besøg" />
          <Tile value={pct(stats.visits ? stats.engaged / stats.visits : 0)} label="Gik på opdagelse" />
          <Tile value={duration(stats.medianSeconds)} label="Typisk besøg" />
        </div>
        <p className="text-[11px] leading-snug text-[#8e8e93]">
          Booking eller kontakt = et klik på en knap ud af touren (fx Book bord), et opkald eller en mail fra touren. Selve bookingen sker hos kunden og kan ikke ses herfra endnu. {pct(stats.mobileShare)} af besøgene er fra mobil.
        </p>
      </Group>

      <Group title="Besøg pr. dag">
        <div className="text-[12px] text-[#6e6e73]">{shown ? `${dayLabel(shown.day)}: ${shown.visits} besøg, ${shown.leads} til booking/kontakt` : "Hold musen over en dag"}</div>
        <div className="flex h-28 items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
          {stats.perDay.map((d, i) => (
            <div key={d.day} className="flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)}>
              <div
                className={`w-full rounded-t-[4px] transition-colors ${hover === i ? "bg-[#0058b0]" : "bg-[#0071e3]"}`}
                style={{ height: d.visits ? `${Math.max(4, (d.visits / max) * 100)}%` : 0 }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between border-t border-black/[.06] pt-1 text-[11px] text-[#8e8e93]">
          <span>{dayLabel(stats.perDay[0].day)}</span>
          <span>{stats.perDay.at(-1)?.day === new Date().toISOString().slice(0, 10) ? "I dag" : dayLabel(stats.perDay.at(-1)?.day ?? stats.perDay[0].day)}</span>
        </div>
      </Group>

      {stats.live.seen > 0 && (
        <Group title="Ledige (live data)">
          <div className="grid grid-cols-4 gap-2">
            <Tile value={String(stats.live.seen)} label="så de ledige" />
            <Tile value={String(stats.live.opened)} label="åbnede listen" />
            <Tile value={String(stats.live.viewed)} label="så et rum" />
            <Tile value={String(stats.live.booked)} label="trykkede book" />
          </div>
          <p className="text-[11px] text-[#8e8e93]">Besøg pr. trin. {stats.live.seen ? `${pct(stats.live.booked / stats.live.seen)} af dem, der så de ledige, trykkede book.` : ""}</p>
          {stats.live.units.length > 0 && <Ranked rows={stats.live.units} empty="" />}
        </Group>
      )}
      <Group title="Det, folk gik videre til">
        <Ranked rows={stats.actions.map((a) => ({ ...a, label: a.label === "phone" ? "Ringede" : a.label === "email" ? "Skrev en mail" : a.label }))} empty="Ingen klik på booking eller kontakt endnu." />
      </Group>
      <Group title="Mest valgte steder">
        <Ranked rows={stats.places} empty="Ingen har valgt steder i menuen endnu." />
      </Group>
      <Group title="Hvor de gik rundt">
        <Ranked rows={stats.rooms} empty="Ingen rumbesøg endnu." />
        <p className="text-[11px] text-[#8e8e93]">Besøg, der kom ind i hvert rum - også når de gik derhen selv.</p>
      </Group>
      <Group title="Hvor de blev længst">
        <Ranked
          rows={stats.roomTime.map((r) => ({ label: r.label, count: r.seconds }))}
          show={(s) => (s < 60 ? `${s} sek` : `${Math.floor(s / 60)} min ${s % 60 ? `${s % 60} sek` : ""}`.trim())}
          empty="Ingen tal endnu - tiden i hvert rum måles fra nu af (mindst 3 besøg pr. rum)."
        />
        <p className="text-[11px] text-[#8e8e93]">Typisk tid i rummet, hos rum med mindst 3 besøg.</p>
      </Group>
      <Group title="Det, de åbnede i touren">
        <Ranked rows={stats.opened} empty="Ingen har åbnet punkter, infopunkter, stedkort eller 360°-billeder endnu." />
      </Group>
      <Group title="Vis mig rundt">
        {stats.guide?.started ? (
          <>
            <p className="text-[13px] text-[#1d1d1f]">
              {stats.guide.started} {stats.guide.started === 1 ? "besøg startede" : "besøg startede"} rundvisningen, og {stats.guide.completed} så den til ende ({pct(stats.guide.completed / stats.guide.started)}).
            </p>
            {stats.guide.byGuide && (
              <>
                <div className="text-[12px] font-semibold text-[#6e6e73]">Hver rundvisning</div>
                <ul className="divide-y divide-black/[.05] text-[13px]">
                  {stats.guide.byGuide.map((g) => (
                    <li key={g.guide} className="flex justify-between gap-3 py-1.5">
                      <span className="truncate">{guideNames[g.guide] ?? (g.guide.replace(/^#rundvisning:?/, "") || "Vis mig rundt")}</span>
                      <span className="shrink-0 text-[#6e6e73]">
                        {g.started} startede · {g.completed} så den til ende{g.started ? ` (${pct(g.completed / g.started)})` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {stats.guide.stops && (
              <>
                <div className="text-[12px] font-semibold text-[#6e6e73]">Hvert stop{stats.guide.byGuide ? ` i "${guideNames["#rundvisning"] ?? "Vis mig rundt"}"` : ""}</div>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-[11px] text-[#8e8e93]">
                      <th className="py-1 font-medium">Stop</th>
                      <th className="py-1 text-right font-medium">Set af</th>
                      <th className="py-1 text-right font-medium">Tid (typisk)</th>
                      <th className="py-1 text-right font-medium">Lyd afspillet</th>
                      <th className="py-1 text-right font-medium">Forlod her</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[.05]">
                    {/* In the guide's order; stops that aren't in it any more (renamed, removed) last. */}
                    {[...stats.guide.stops]
                      .sort((a, b) => (guideStops.indexOf(a.title) + 1 || 999) - (guideStops.indexOf(b.title) + 1 || 999))
                      .map((s) => {
                        const n = guideStops.indexOf(s.title) + 1;
                        const left = n ? (stats.guide.leftAt.find((l) => l.stop === n)?.count ?? 0) : null;
                        return (
                          <tr key={s.title}>
                            <td className="max-w-[180px] truncate py-1.5">{n ? `${n}. ` : ""}{s.title}</td>
                            <td className="py-1.5 text-right tabular-nums">{s.seen}</td>
                            <td className="py-1.5 text-right tabular-nums">{s.medianSeconds >= 60 ? `${Math.floor(s.medianSeconds / 60)} min ${s.medianSeconds % 60} s` : `${s.medianSeconds} s`}</td>
                            <td className="py-1.5 text-right tabular-nums">{s.voice ? `${s.voice} gange` : "-"}</td>
                            <td className="py-1.5 text-right tabular-nums">{left ?? "-"}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
                <p className="text-[11px] text-[#8e8e93]">Tid: hvor længe de typisk blev ved stoppet (medianen). Lyd: hvor mange gange stoppets stemme blev spillet (også igen med ↺). Måles fra nu af.</p>
              </>
            )}
            <div className="text-[12px] font-semibold text-[#6e6e73]">Hvor de forlod {stats.guide.byGuide ? `"${guideNames["#rundvisning"] ?? "Vis mig rundt"}"` : "den"}</div>
            <Ranked
              rows={stats.guide.leftAt.map((r) => ({ label: `Stop ${r.stop}${guideStops[r.stop - 1] ? ` · ${guideStops[r.stop - 1]}` : ""}`, count: r.count })).sort((a, b) => b.count - a.count)}
              empty="Ingen har forladt rundvisningen undervejs (måles fra nu af)."
            />
            <div className="pt-1 text-[12px] font-semibold text-[#6e6e73]">Hvad de skiftede til</div>
            <Ranked rows={stats.guide.leftFor} empty="-" />
            <p className="text-[11px] text-[#8e8e93]">Et sted i menuen eller docken, &quot;Gå selv rundt&quot;-knappen - eller &quot;Gik selv rundt&quot;, når de gik videre i touren selv. Mange, der forlader ved samme stop, er et tegn på, at stoppet er for langt eller kedeligt.</p>
          </>
        ) : (
          <p className="text-[13px] text-[#8e8e93]">Ingen har startet rundvisningen endnu.</p>
        )}
      </Group>
      <Group title="Menuen">
        <p className="text-[13px] text-[#1d1d1f]">
          {stats.visits ? `${pct(stats.menu.opened / stats.visits)} af besøgene åbnede menuen (${stats.menu.opened} af ${stats.visits}).` : "Ingen besøg endnu."}
        </p>
        <Ranked rows={stats.menu.groups} empty="Ingen har åbnet en gruppe i menuen endnu (måles fra nu af)." />
        <p className="text-[11px] text-[#8e8e93]">Besøg, der åbnede hver gruppe. En gruppe, få åbner, gemmer sit indhold - ryk det vigtigste ud som et punkt for sig, på velkomsten eller i Vis mig rundt.</p>
      </Group>
      <Group title="Kom fra">
        <Ranked rows={stats.sources} empty="-" />
      </Group>
    </div>
  );
}
