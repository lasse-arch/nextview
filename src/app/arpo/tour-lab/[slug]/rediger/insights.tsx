"use client";

import { useEffect, useState, useTransition } from "react";
import { latestTourTips, suggestFromStats, tourLooksFor, type Insight } from "@/lib/actions/tour-insights";
import type { LookSpot } from "@/lib/tour-looks";
import { placeHref } from "../../tours/places";
import type { TourConfig } from "../../tours/types";
import { Group, type PreviewApi } from "./ui";

/*
 * "Forslag ud fra tallene" (top of Resultater): nextviewAI reads what visitors
 * do in the tour and suggests changes that give more of what works - each one
 * carried out by nextviewAI in the editor with a click.
 */

export function InsightsPanel({ slug, config, onAsk }: { slug: string; config: TourConfig; onAsk: (request: string) => void }) {
  const [result, setResult] = useState<{ summary: string; suggestions: Insight[]; visits: number; at?: string; auto?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // The latest tips kept (by hand, or the monthly ones nextviewAI makes by itself) show at once.
  useEffect(() => {
    let live = true;
    latestTourTips(slug)
      .then((r) => live && r && setResult((now) => now ?? r))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [slug]);

  return (
    <Group title="Forslag ud fra tallene">
      <p className="text-[13px] leading-snug text-[#6e6e73]">
        nextviewAI kigger på, hvad de besøgende gør i touren: hvilke steder der fører til booking, hvad de vælger først, og hvor de stopper. Og foreslår, hvordan touren får mere af det, der virker.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await suggestFromStats(slug, config);
            if (!r.ok) return setError(r.error);
            setResult(r);
          })
        }
        className="w-full rounded-xl bg-[#0071e3] py-2.5 text-[14px] font-medium text-white disabled:opacity-50"
      >
        {pending ? "nextviewAI læser tallene…" : result ? "Find nye forslag" : "Find forbedringer"}
      </button>
      {error && <p className="text-[13px] text-[#1d1d1f]">{error}</p>}
      {result && (
        <div className="space-y-2.5">
          <p className="text-[13px] leading-snug text-[#1d1d1f]">{result.summary}</p>
          {result.suggestions.map((s, i) => (
            <div key={i} className="space-y-1.5 rounded-xl bg-white p-3 ring-1 ring-black/[.06]">
              <p className="text-[14px] font-semibold leading-snug">{s.title}</p>
              <p className="text-[13px] leading-snug text-[#6e6e73]">{s.why}</p>
              <button type="button" onClick={() => onAsk(s.ask)} className="rounded-full bg-[#0071e3]/10 px-3 py-1 text-[12px] font-medium text-[#0071e3]">
                Lad nextviewAI gøre det
              </button>
            </div>
          ))}
          <p className="text-[11px] leading-snug text-[#8e8e93]">
            {result.at ? `${result.auto ? "Lavet af sig selv" : "Lavet"} ${new Date(result.at).toLocaleDateString("da-DK", { day: "numeric", month: "short" })}, ud` : "Ud"} fra {result.visits} besøg de seneste 60 dage. Ændringen kommer i kladden - se den i forhåndsvisningen, og tryk Gem.
          </p>
        </div>
      )}
    </Group>
  );
}

/**
 * "Hvor folk kigger": per place in the tour, how long visitors looked around
 * there and which way - the 12 slices around the scan point as a ring of bars
 * (darker = longer), and "Vis" turns the preview to the direction most looked at.
 */
export function LooksPanel({ slug, config, preview }: { slug: string; config: TourConfig; preview?: PreviewApi }) {
  const [spots, setSpots] = useState<LookSpot[] | null>(null);
  useEffect(() => {
    let live = true;
    tourLooksFor(slug)
      .then((r) => live && setSpots(r))
      .catch(() => live && setSpots([]));
    return () => {
      live = false;
    };
  }, [slug]);
  const time = (s: number) => (s < 60 ? `${s} sek` : s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1).replace(".", ",")} t`);
  return (
    <Group title="Hvor folk kigger">
      <p className="text-[13px] leading-snug text-[#6e6e73]">De steder i touren, hvor de besøgende selv kigger længst rundt, og hvilken vej de kigger. Et godt sted for et infopunkt, et stedkort eller en knap. De seneste 60 dage.</p>
      {spots == null ? (
        <p className="text-[13px] text-[#8e8e93]">Henter…</p>
      ) : !spots.length ? (
        <p className="text-[13px] text-[#8e8e93]">Ingen målinger endnu. Det kommer, når besøgende har kigget rundt i touren.</p>
      ) : (
        <ul className="space-y-2">
          {spots.slice(0, 10).map((s) => {
            const max = Math.max(...s.slices);
            const best = s.top[0];
            return (
              <li key={s.ss} className="rounded-xl bg-white p-3 ring-1 ring-black/[.06]">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="min-w-0 truncate text-[14px] font-semibold">{s.room ?? `Scanpunkt ${s.ss}`}</p>
                  <p className="flex-none text-[12px] tabular-nums text-[#6e6e73]">
                    {time(s.seconds)}, {s.visits} besøg
                  </p>
                </div>
                <div className="mt-2 flex h-6 items-end gap-[2px]" aria-label="Hvor længe der er kigget i hver retning, hele vejen rundt">
                  {s.slices.map((n, i) => (
                    <span key={i} title={`${Math.round((n / s.seconds) * 100)} %`} className="flex-1 rounded-sm bg-[#0071e3]" style={{ height: `${Math.max(8, (n / max) * 100)}%`, opacity: n ? 0.25 + 0.75 * (n / max) : 0.08 }} />
                  ))}
                </div>
                {best && preview && (
                  <button type="button" onClick={() => preview.go(s.room ?? `Scanpunkt ${s.ss}`, placeHref(config, s.ss, { x: 0, y: best.yaw }))} className="mt-1.5 rounded-full bg-[#0071e3]/10 px-3 py-1 text-[12px] font-medium text-[#0071e3]">
                    Vis det, de kigger mest på ({Math.round(best.share * 100)} %)
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Group>
  );
}
