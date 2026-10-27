"use client";

import { useMemo, useState } from "react";
import { DEFAULT_EMBED, embedCode, type EmbedSize } from "@/app/arpo/tour-lab/[slug]/rediger/share";

/*
 * "Brug touren": pick a tour and a place in it, then what you need for it -
 * a link, a QR code to print, or the code for the website (iframe). One thing
 * at a time, instead of a long list of every place.
 */

export type ShareTour = { key: string; title: string; url: string; size?: EmbedSize; places: { key: string; name: string; group: string | null }[] };

type Words = {
  tour: string;
  place: string;
  whole: string;
  link: string;
  qr: string;
  code: string;
  copy: string;
  copied: string;
  download: string;
  linkHint: string;
  qrHint: string;
  codeHint: string;
  open: string;
};

export function TourShare({ tours, words }: { tours: ShareTour[]; words: Words }) {
  const [tourKey, setTourKey] = useState(tours[0]?.key ?? "");
  const [place, setPlace] = useState("");
  const [what, setWhat] = useState<"link" | "qr" | "code">("link");
  const [copied, setCopied] = useState(false);
  const tour = tours.find((x) => x.key === tourKey) ?? tours[0];
  const groups = useMemo(() => {
    const m = new Map<string, { key: string; name: string; group: string | null }[]>();
    for (const p of tour?.places ?? []) {
      const g = p.group ?? "";
      m.set(g, [...(m.get(g) ?? []), p]);
    }
    return [...m];
  }, [tour]);
  if (!tour) return null;
  const chosen = tour.places.find((p) => p.key === place);
  const url = chosen ? `${tour.url}?rum=${chosen.key}` : tour.url;
  const code = embedCode(url, chosen ? `${tour.title} - ${chosen.name}` : tour.title, tour.size ?? DEFAULT_EMBED);
  const qr = `/api/qr?url=${encodeURIComponent(url)}`;
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const select = "w-full appearance-none rounded-2xl bg-[#f3f3f5] px-4 py-3 pr-10 text-[15px] font-medium outline-none focus:ring-2 focus:ring-[#0071e3]/40";

  return (
    <div className="space-y-5">
      <div className={`grid gap-3 ${tours.length > 1 ? "sm:grid-cols-2" : ""}`}>
        {tours.length > 1 && (
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-[#6e6e73]">{words.tour}</span>
            <span className="relative block">
              <select
                className={select}
                value={tour.key}
                onChange={(e) => {
                  setTourKey(e.target.value);
                  setPlace("");
                }}
              >
                {tours.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.title}
                  </option>
                ))}
              </select>
              <Chevron />
            </span>
          </label>
        )}
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold text-[#6e6e73]">{words.place}</span>
          <span className="relative block">
            <select className={select} value={place} onChange={(e) => setPlace(e.target.value)} disabled={!tour.places.length}>
              <option value="">{words.whole}</option>
              {groups.map(([g, list]) =>
                g ? (
                  <optgroup key={g} label={g}>
                    {list.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  list.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name}
                    </option>
                  ))
                )
              )}
            </select>
            <Chevron />
          </span>
        </label>
      </div>

      <div className="flex rounded-full bg-[#f3f3f5] p-1">
        {(
          [
            ["link", words.link],
            ["qr", words.qr],
            ["code", words.code],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setWhat(k)} className={`flex-1 rounded-full px-3 py-2 text-[14px] font-semibold transition ${what === k ? "bg-white shadow-sm" : "text-[#6e6e73]"}`}>
            {label}
          </button>
        ))}
      </div>

      {what === "link" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-2xl bg-[#f7f7f9] p-2 pl-4">
            <span className="min-w-0 flex-1 truncate text-[14px] text-[#3a3a3c]">{url}</span>
            <a href={url} target="_blank" rel="noopener" className="rounded-full px-3 py-2 text-[13px] font-semibold text-[#0071e3] hover:bg-[#0071e3]/10">
              {words.open} ↗
            </a>
            <button type="button" onClick={() => copy(url)} className="rounded-full bg-[#0071e3] px-4 py-2 text-[13px] font-semibold text-white">
              {copied ? words.copied : words.copy}
            </button>
          </div>
          <p className="text-[13px] leading-snug text-[#8e8e93]">{words.linkHint}</p>
        </div>
      )}

      {what === "qr" && (
        <div className="flex flex-col items-center gap-4 rounded-2xl bg-[#f7f7f9] p-5 sm:flex-row sm:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={qr} src={qr} alt="" className="h-44 w-44 rounded-xl bg-white p-2" />
          <div className="space-y-3 text-center sm:text-left">
            <p className="text-[15px] font-semibold">{chosen ? [chosen.group, chosen.name].filter(Boolean).join(" · ") : words.whole}</p>
            <p className="text-[13px] leading-snug text-[#6e6e73]">{words.qrHint}</p>
            <a href={qr} download={`qr-${chosen?.key ?? "tour"}.png`} className="inline-block rounded-full bg-[#1d1d1f] px-4 py-2 text-[14px] font-semibold text-white">
              {words.download}
            </a>
          </div>
        </div>
      )}

      {what === "code" && (
        <div className="space-y-3">
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-2xl bg-[#1d1d1f] p-4 text-[12px] leading-relaxed text-white/85">{code}</pre>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-md text-[13px] leading-snug text-[#8e8e93]">{words.codeHint}</p>
            <button type="button" onClick={() => copy(code)} className="rounded-full bg-[#0071e3] px-4 py-2 text-[14px] font-semibold text-white">
              {copied ? words.copied : words.copy}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 20 20" className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6e6e73]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="m5 8 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
