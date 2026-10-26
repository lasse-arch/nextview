"use client";

import { useState, useTransition } from "react";
import { suggestFromStats, type Insight } from "@/lib/actions/tour-insights";
import type { TourConfig } from "../../tours/types";
import { Group } from "./ui";

/*
 * "Forslag ud fra tallene" (top of Resultater): nextviewAI reads what visitors
 * do in the tour and suggests changes that give more of what works - each one
 * carried out by nextviewAI in the editor with a click.
 */

export function InsightsPanel({ slug, config, onAsk }: { slug: string; config: TourConfig; onAsk: (request: string) => void }) {
  const [result, setResult] = useState<{ summary: string; suggestions: Insight[]; visits: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

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
          <p className="text-[11px] leading-snug text-[#8e8e93]">Ud fra {result.visits} besøg de seneste 60 dage. Ændringen kommer i kladden - se den i forhåndsvisningen, og tryk Gem.</p>
        </div>
      )}
    </Group>
  );
}
