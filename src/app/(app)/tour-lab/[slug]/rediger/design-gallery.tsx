"use client";

import { useRef } from "react";
import { DESIGN_PRESETS, type Branch, type DesignPreset } from "../../tours/presets";
import type { TourConfig } from "../../tours/types";

/*
 * The ready-made designs as cards, each with a little drawing of how the tour
 * looks in it (in the tour's own colours). In the editor, resting the mouse
 * on one shows it in the live preview; a click picks it.
 */

type Colors = TourConfig["colors"];

/** A sketch of a tour in the design - not the real thing, just enough to tell them apart. */
export function PresetMock({ id, colors }: { id: DesignPreset["id"]; colors: Colors }) {
  const scene = <div className="absolute inset-0" style={{ background: "linear-gradient(160deg,#c9c3b8 0%,#8f8a80 55%,#5f5a52 100%)" }} />;
  const line = (w: string, c = "rgba(255,255,255,.85)", h = 3) => <div className="rounded-full" style={{ width: w, height: h, background: c }} />;
  return (
    <div className="relative aspect-[16/10] overflow-hidden rounded-lg">
      {scene}
      {id === "klassisk" && (
        <>
          <div className="absolute inset-y-0 right-0 w-[26%] space-y-1.5 p-1.5" style={{ background: colors.main }}>
            {line("70%")}
            {line("50%", "rgba(255,255,255,.5)")}
            {line("60%", "rgba(255,255,255,.5)")}
            {line("45%", "rgba(255,255,255,.5)")}
          </div>
          <div className="absolute left-[8%] top-[18%] w-[56%] rounded-md bg-white/95 p-1.5 shadow">
            {line("60%", colors.main, 4)}
            <div className="mt-1.5 grid grid-cols-3 gap-1">
              {[colors.main, "#fff", colors.accent].map((c, i) => (
                <div key={i} className="h-5 rounded-sm ring-1 ring-black/10" style={{ background: c }} />
              ))}
            </div>
          </div>
        </>
      )}
      {id === "forside" && (
        <>
          <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, ${colors.main}ee 0%, ${colors.main}88 55%, transparent 100%)` }} />
          <div className="absolute left-[7%] top-[16%] w-[50%] space-y-1">
            {line("40%", colors.accent, 2)}
            {line("85%", "#fff", 5)}
            {line("70%", "rgba(255,255,255,.6)", 2)}
            <div className="mt-1.5 h-3 w-[70%] rounded-full" style={{ background: colors.accent }} />
          </div>
          <div className="absolute inset-x-[7%] bottom-[7%] flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-5 flex-1 rounded-sm bg-white/30 ring-1 ring-white/40" />
            ))}
          </div>
        </>
      )}
      {id === "direkte" && (
        <>
          <div className="absolute right-[5%] top-[7%] h-3 w-8 rounded-full" style={{ background: colors.main }} />
          <div className="absolute inset-x-[5%] bottom-[7%] flex gap-1.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-7 w-5 rounded-md bg-white/40 ring-2" style={{ ["--tw-ring-color" as string]: colors.accent }} />
            ))}
          </div>
        </>
      )}
      {id === "rumvaelger" && (
        <div className="absolute inset-x-[5%] bottom-[6%] space-y-1 rounded-md bg-white/95 p-1.5 shadow">
          <div className="flex gap-1">
            {["5", "14", "17", "29"].map((t, i) => (
              <div key={t} className="flex-1 rounded-sm py-0.5 text-center text-[7px] font-bold" style={{ background: i === 1 ? colors.accent : "#eee", color: i === 1 ? "#fff" : "#555" }}>
                {t} m³
              </div>
            ))}
          </div>
          <div className="flex gap-1">
            {[0, 1].map((i) => (
              <div key={i} className="h-2.5 flex-1 rounded-sm ring-1 ring-black/10" />
            ))}
          </div>
        </div>
      )}
      {id === "guidet" && (
        <>
          <div className="absolute left-[18%] top-[14%] w-[64%] space-y-1 rounded-md bg-white/95 p-1.5 shadow">
            {line("55%", colors.main, 4)}
            <div className="h-3.5 rounded-full" style={{ background: colors.accent }} />
            {line("35%", "#bbb", 2)}
          </div>
          <div className="absolute bottom-[7%] left-[5%] w-[34%] space-y-1 rounded-md bg-white p-1 shadow-lg">
            {line("70%", colors.main, 3)}
            <div className="h-2 w-[60%] rounded-full" style={{ background: colors.accent }} />
          </div>
        </>
      )}
    </div>
  );
}

export function DesignGallery({
  colors,
  selected,
  branch,
  onPick,
  onHover,
}: {
  colors: Colors;
  selected: DesignPreset["id"] | null;
  branch?: Branch | null;
  onPick: (p: DesignPreset) => void;
  /** Resting on a card (null = left it) - the editor shows it in the live preview. */
  onHover?: (p: DesignPreset | null) => void;
}) {
  const timer = useRef<number>(0);
  const shown = useRef(false);
  const list = branch ? [...DESIGN_PRESETS].sort((a, b) => Number(b.recommendedFor.includes(branch)) - Number(a.recommendedFor.includes(branch))) : DESIGN_PRESETS;
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {list.map((p) => {
        const recommended = branch ? p.recommendedFor.includes(branch) : false;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              window.clearTimeout(timer.current);
              shown.current = false;
              onPick(p);
            }}
            onMouseEnter={() => {
              if (!onHover) return;
              window.clearTimeout(timer.current);
              timer.current = window.setTimeout(() => {
                shown.current = true;
                onHover(p);
              }, 450);
            }}
            onMouseLeave={() => {
              window.clearTimeout(timer.current);
              if (shown.current) onHover?.(null);
              shown.current = false;
            }}
            className={`group rounded-xl bg-white p-1.5 text-left ring-1 transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,.12)] ${selected === p.id ? "ring-2 ring-[#0071e3]" : "ring-black/[.06]"}`}
          >
            <PresetMock id={p.id} colors={colors} />
            <div className="px-1 pb-0.5 pt-1.5">
              <div className="flex items-center gap-1.5 text-[13px] font-semibold">
                {p.name}
                {recommended && <span className="rounded-full bg-[#34c759]/15 px-1.5 py-px text-[10px] font-semibold text-[#248a3d]">Anbefalet</span>}
                {selected === p.id && <span className="ml-auto text-[#0071e3]">✓</span>}
              </div>
              <div className="text-[11px] leading-snug text-[#6e6e73]">{p.what}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-[#8e8e93]">{p.when}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
