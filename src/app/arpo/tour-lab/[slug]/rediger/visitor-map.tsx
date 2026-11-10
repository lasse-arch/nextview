import {
  DENMARK_PATH,
  MAP_HEIGHT,
  MAP_WIDTH,
  projectLatLon,
} from "@/lib/denmark-map-projection";
import type { VisitGeo } from "@/lib/tour-stats";

/*
 * "Hvor de besøgende kom fra": a map of Denmark with a dot for each town the
 * visits came from (bigger = more), and the share per region - plus abroad.
 * The place is rough (the town from the visitor's network, ~10 km), never an
 * address. No hooks, so it works in the editor, the customer's portal and on
 * the report link alike.
 */

export type MapLang = "da" | "en";

const W = {
  da: {
    title: "Hvor de besøgende kom fra",
    visits: "besøg",
    abroad: "Udlandet",
    dkElse: "Danmark, ukendt region",
    empty: "Kortet fyldes, efterhånden som touren får besøg.",
    note: "Groft, ud fra de besøgendes netværk (byen - aldrig adressen).",
    of: "af besøgene med kendt sted",
  },
  en: {
    title: "Where the visitors came from",
    visits: "visits",
    abroad: "Abroad",
    dkElse: "Denmark, region unknown",
    empty: "The map fills in as the tour gets visits.",
    note: "Rough, from the visitors' network (the town - never the address).",
    of: "of the visits with a known place",
  },
} as const;

const REGION_EN: Record<string, string> = {
  Nordjylland: "North Jutland",
  Midtjylland: "Central Jutland",
  Syddanmark: "Southern Denmark",
  Sjælland: "Zealand",
  Hovedstaden: "Capital Region",
};

/** Just Denmark (the coastline lies within y 85-395 of the 400x480 projection). */
const VIEW = `0 80 ${MAP_WIDTH} ${Math.min(MAP_HEIGHT, 320)}`;

const pct = (n: number, of: number) =>
  of ? `${Math.round((n / of) * 100)} %` : "0 %";

export function VisitorMap({
  geo,
  lang = "da",
  className = "",
}: {
  geo: VisitGeo | undefined;
  lang?: MapLang;
  className?: string;
}) {
  const t = W[lang];
  if (!geo) return null;
  const max = Math.max(1, ...geo.points.map((p) => p.count));
  const abroad = geo.abroad.reduce((n, a) => n + a.count, 0);
  const rows = [
    ...geo.regions.map((r) => ({
      key: r.code,
      label: lang === "en" ? (REGION_EN[r.label] ?? r.label) : r.label,
      count: r.count,
    })),
    ...(geo.denmarkElse
      ? [{ key: "dk", label: t.dkElse, count: geo.denmarkElse }]
      : []),
    ...(abroad ? [{ key: "ud", label: t.abroad, count: abroad }] : []),
  ];
  const top = Math.max(1, ...rows.map((r) => r.count));
  // The smallest dots first, so a big town never hides a small one.
  const dots = [...geo.points].sort((a, b) => a.count - b.count);
  return (
    <div className={className}>
      <div className="mb-2 text-[13px] font-medium text-[#6e6e73]">
        {t.title}
      </div>
      {geo.located === 0 ? (
        <p className="text-[13px] text-[#8e8e93]">{t.empty}</p>
      ) : (
        // Side by side when there's room (the report), the list under the map in a narrow panel (the editor).
        <div className="@container">
          <div className="grid items-center gap-4 @lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
            <svg
              viewBox={VIEW}
              className="mx-auto w-full max-w-[300px]"
              role="img"
              aria-label={t.title}
            >
              <path
                d={DENMARK_PATH}
                fill="#eef2f7"
                stroke="#cbd5e1"
                strokeWidth={1}
              />
              {dots.map((p) => {
                const { x, y } = projectLatLon(p.lat, p.lng);
                const r = 3 + 11 * Math.sqrt(p.count / max);
                return (
                  <circle
                    key={`${p.lat},${p.lng}`}
                    cx={x}
                    cy={y}
                    r={r}
                    fill="var(--report-accent, #0071e3)"
                    fillOpacity={0.55}
                    stroke="#fff"
                    strokeWidth={1.2}
                  >
                    <title>{`${p.city ?? "?"}: ${p.count} ${t.visits}`}</title>
                  </circle>
                );
              })}
            </svg>
            <div>
              <ul className="space-y-2">
                {rows.map((r) => (
                  <li key={r.key}>
                    <div className="flex justify-between gap-3 text-[13px]">
                      <span className="truncate">{r.label}</span>
                      <span className="tabular-nums text-[#3a3a3c]">
                        <b className="font-semibold">
                          {pct(r.count, geo.located)}
                        </b>{" "}
                        <span className="text-[#8e8e93]">· {r.count}</span>
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-[#f2f2f7]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(r.count / top) * 100}%`,
                          background: "var(--report-accent, #0071e3)",
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              {geo.abroad.length > 0 && (
                <p className="mt-2 text-[12px] text-[#6e6e73]">
                  {t.abroad}:{" "}
                  {geo.abroad
                    .slice(0, 5)
                    .map((a) => `${a.label} ${a.count}`)
                    .join(", ")}
                  {geo.abroad.length > 5 ? " …" : ""}
                </p>
              )}
              <p className="mt-2 text-[11px] text-[#8e8e93]">
                {geo.located} {t.visits} {t.of}. {t.note}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
