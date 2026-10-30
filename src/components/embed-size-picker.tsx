"use client";

import { useState } from "react";
import type { EmbedSize } from "@/app/arpo/tour-lab/[slug]/rediger/share";

/*
 * The customer chooses how big the tour is on their page (the code is made
 * in that size) - with a small page drawn to scale, on a computer and a
 * phone, showing how much room it takes.
 */

const WORDS = {
  da: {
    size: "Størrelse på hjemmesiden",
    sizes: { "16:9": "Bred", "4:3": "Høj", fast: "Fast højde", skaerm: "Hele skærmen" } as Record<EmbedSize["kind"], string>,
    height: "Højde",
    computer: "Computer",
    phone: "Mobil",
    preview: "Sådan fylder touren på en side",
    yourTour: "Jeres virtuelle tour",
    fold: "Hertil ser man uden at scrolle",
  },
  en: {
    size: "Size on the website",
    sizes: { "16:9": "Wide", "4:3": "Tall", fast: "Fixed height", skaerm: "Full screen" } as Record<EmbedSize["kind"], string>,
    height: "Height",
    computer: "Computer",
    phone: "Phone",
    preview: "How much room the tour takes on a page",
    yourTour: "Your virtual tour",
    fold: "What you see without scrolling",
  },
};

/** The box's height on a page this wide (as embedBox in the browser): the same rules, in pixels. */
function boxHeight(size: EmbedSize, width: number, screen: number) {
  if (size.kind === "fast") return size.height;
  if (size.kind === "skaerm") return Math.min(screen, 900);
  // 16:9 or 4:3 of the width - never lower than 520 px, never more than 90 % of the screen.
  return Math.min(Math.max(width * (size.kind === "16:9" ? 9 / 16 : 3 / 4), 520), screen * 0.9);
}

/** The size of the box on their page - and a small page showing how much room it takes, on a computer and a phone. */
export function EmbedSizePicker({ size, onChange, lang = "da" }: { size: EmbedSize; onChange: (s: EmbedSize) => void; lang?: "da" | "en" }) {
  const words = WORDS[lang];
  const [device, setDevice] = useState<"computer" | "phone">("computer");
  // A page's content width and screen height on each.
  const page = device === "computer" ? { width: 1100, screen: 800, scale: 0.26 } : { width: 360, screen: 740, scale: 0.42 };
  const h = boxHeight(size, page.width, page.screen);
  const kinds: EmbedSize["kind"][] = ["16:9", "4:3", "fast", "skaerm"];
  return (
    <div className="space-y-3 rounded-2xl bg-[#f7f7f9] p-4">
      <p className="text-[13px] font-semibold text-[#6e6e73]">{words.size}</p>
      <div className="flex flex-wrap gap-1.5">
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onChange({ kind: k, height: size.height || 600 })}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${size.kind === k ? "bg-[#1d1d1f] text-white" : "bg-white text-[#3a3a3c] ring-1 ring-black/[.06]"}`}
          >
            {words.sizes[k]}
          </button>
        ))}
      </div>
      {size.kind === "fast" && (
        <label className="flex items-center gap-3 text-[13px] text-[#6e6e73]">
          {words.height}
          <input type="range" min={360} max={1000} step={20} value={size.height} onChange={(e) => onChange({ kind: "fast", height: Number(e.target.value) })} className="flex-1 accent-[#0071e3]" />
          <span className="w-16 text-right font-semibold text-[#1d1d1f]">{size.height} px</span>
        </label>
      )}
      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-[13px] font-semibold text-[#6e6e73]">{words.preview}</p>
        <div className="flex rounded-full bg-white p-0.5 ring-1 ring-black/[.06]">
          {(["computer", "phone"] as const).map((d) => (
            <button key={d} type="button" onClick={() => setDevice(d)} className={`rounded-full px-3 py-1 text-[12px] font-semibold ${device === d ? "bg-[#1d1d1f] text-white" : "text-[#6e6e73]"}`}>
              {words[d]}
            </button>
          ))}
        </div>
      </div>
      {/* A page drawn to scale: the screen (the dashed line is where the first screenful ends), some text, the tour, more text. */}
      <div className="flex justify-center">
        <div className="relative overflow-hidden rounded-xl bg-white ring-1 ring-black/[.08]" style={{ width: page.width * page.scale, height: (page.screen + 260) * page.scale }}>
          <div className="space-y-1.5 p-2" style={{ transform: `scale(${page.scale})`, transformOrigin: "0 0", width: page.width }}>
            <div className="mb-6 h-12 rounded-lg bg-[#e8e8ed]" />
            <div className="h-6 w-2/3 rounded bg-[#d1d1d6]" />
            <div className="h-4 w-full rounded bg-[#ececf0]" />
            <div className="mb-6 h-4 w-5/6 rounded bg-[#ececf0]" />
            <div className="flex flex-col items-center justify-center gap-1 rounded-xl bg-gradient-to-br from-[#0f2a3d] to-[#2f6f8f] text-white" style={{ height: h }}>
              <span className="text-[40px]">▶</span>
              <span className="text-[30px] font-semibold">{words.yourTour}</span>
              <span className="text-[24px] opacity-80">
                {page.width} × {Math.round(h)} px
              </span>
            </div>
            <div className="mt-6 h-4 w-full rounded bg-[#ececf0]" />
            <div className="h-4 w-4/5 rounded bg-[#ececf0]" />
          </div>
          <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[#ff3b30]/60" style={{ top: page.screen * page.scale }} title={words.fold} />
        </div>
      </div>
    </div>
  );
}

