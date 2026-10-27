"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { setPortalLanguage } from "@/lib/actions/portal-language";
import { portalReview } from "@/lib/actions/portal-review";

/*
 * The customer page's moving parts: the location picker (like Wolt's - "all
 * locations" first, then each with its address) and the language switch.
 */

export type PortalLocation = { id: string; name: string; address: string | null };

export function LocationSwitcher({
  company,
  locations,
  current,
  hrefFor,
  words,
}: {
  company: string;
  locations: PortalLocation[];
  current: string | null;
  /** Links for each choice (null = all), built on the server - they keep the admin preview's ?som. */
  hrefFor: Record<string, string>;
  words: { all: string; search: string; none: string };
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const click = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", click);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", click);
      window.removeEventListener("keydown", key);
    };
  }, []);
  const chosen = locations.find((l) => l.id === current);
  const hits = locations.filter((l) => `${l.name} ${l.address ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div ref={box} className="relative min-w-0">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex max-w-full min-w-0 items-center gap-2 rounded-xl px-2.5 py-1.5 text-left hover:bg-black/[.04]">
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold leading-tight">{chosen?.name ?? company}</span>
          <span className="block truncate text-[12px] leading-tight text-[#6e6e73]">{chosen ? (chosen.address ?? company) : words.all}</span>
        </span>
        <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-[#6e6e73]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="m5 8 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-2 w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-white shadow-[0_16px_48px_rgba(0,0,0,.16)] ring-1 ring-black/[.06]">
          {locations.length > 5 && (
            <div className="border-b border-black/[.06] p-3">
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={words.search} className="w-full rounded-full bg-[#f2f2f7] px-4 py-2.5 text-[15px] outline-none placeholder:text-[#8e8e93]" />
            </div>
          )}
          <ul className="max-h-[60vh] overflow-y-auto py-1.5">
            <li>
              <Link href={hrefFor.all} onClick={() => setOpen(false)} className={`flex items-center gap-3 px-4 py-3 hover:bg-[#f5f5f7] ${!current ? "bg-[#f5f5f7]" : ""}`}>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eef3ff] text-[#0071e3]">
                  <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" fill="currentColor" aria-hidden>
                    <path d="M3 17V7l5-3v4l5-3v12H3Zm11 0V9h3v8h-3Z" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{company}</span>
                  <span className="block text-[13px] text-[#6e6e73]">{words.all}</span>
                </span>
              </Link>
            </li>
            {hits.map((l) => (
              <li key={l.id}>
                <Link href={hrefFor[l.id]} onClick={() => setOpen(false)} className={`flex items-center gap-3 px-4 py-3 hover:bg-[#f5f5f7] ${current === l.id ? "bg-[#f5f5f7]" : ""}`}>
                  <span className={`flex h-9 w-9 items-center justify-center`}>
                    <span className={`h-4 w-4 rounded-full border-2 ${current === l.id ? "border-[#0071e3] bg-[radial-gradient(circle,#0071e3_45%,transparent_50%)]" : "border-[#c7c7cc]"}`} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{l.name}</span>
                    {l.address && <span className="block truncate text-[13px] text-[#6e6e73]">{l.address}</span>}
                  </span>
                </Link>
              </li>
            ))}
            {hits.length === 0 && <li className="px-4 py-4 text-[14px] text-[#8e8e93]">{words.none}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

/** DA / EN - remembered in a cookie (just the language, nothing else). */
export function LangToggle({ lang }: { lang: "da" | "en" }) {
  const router = useRouter();
  const set = (l: "da" | "en") => setPortalLanguage(l).then(() => router.refresh());
  return (
    <div className="flex rounded-full bg-black/[.05] p-0.5 text-[12px] font-semibold">
      {(["da", "en"] as const).map((l) => (
        <button key={l} type="button" onClick={() => set(l)} aria-pressed={lang === l} className={`rounded-full px-2.5 py-1 uppercase ${lang === l ? "bg-white text-[#1d1d1f] shadow-sm" : "text-[#6e6e73]"}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

/** A tour's own photo from Matterport - the "360°" placeholder while it loads or if there is none. */
export function TourThumb({ src }: { src: string }) {
  const [ok, setOk] = useState(true);
  return (
    <span className="relative flex h-12 w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-[#1d2a4d] to-[#3a5aa0] text-[11px] font-semibold text-white/50">
      360°
      {ok && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" onError={() => setOk(false)} className="absolute inset-0 h-full w-full object-cover" />
      )}
    </span>
  );
}

/** "Rettelser": the tour in review mode in a big window on the page - closing it shows what's been sent. */
export function ReviewLauncher({ slug, title, words }: { slug: string; title: string; words: { open: string; opening: string; hint: string; close: string } }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setToken(null);
    router.refresh();
  };
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const r = await portalReview(slug).catch(() => ({ ok: false as const, error: "?" }));
          setBusy(false);
          if (r.ok) setToken(r.token);
          else setError(r.error);
        }}
        className="rounded-full bg-[#1d1d1f] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-50"
      >
        {busy ? words.opening : words.open}
      </button>
      {error && <span className="text-[13px] text-[#c4271d]">{error}</span>}
      {token && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/70 sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
          <div className="mx-auto flex h-full w-full max-w-[1500px] flex-col overflow-hidden bg-white sm:rounded-3xl">
            <div className="flex items-center gap-3 border-b border-black/[.06] px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{title}</p>
                <p className="truncate text-[12px] text-[#6e6e73]">{words.hint}</p>
              </div>
              <button type="button" onClick={close} className="rounded-full bg-[#f3f3f5] px-4 py-1.5 text-[14px] font-semibold hover:bg-[#e8e8ed]">
                {words.close}
              </button>
            </div>
            <iframe src={`/p/${token}`} title={title} className="w-full flex-1 border-0" allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer; clipboard-write" allowFullScreen />
          </div>
        </div>
      )}
    </>
  );
}

/** "Brug touren": a link straight to each place (and the whole tour), to copy - with a QR code to print. */
export function PlaceLinks({ links, words }: { links: { key: string; name: string; group: string | null; url: string }[]; words: { copy: string; copied: string; qr: string } }) {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <ul className="divide-y divide-black/[.06]">
      {links.map((l) => (
        <li key={l.key} className="flex flex-wrap items-center gap-2 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">{l.name}</p>
            <p className="truncate text-[12px] text-[#8e8e93]">{l.group ?? l.url.replace(/^https?:\/\//, "")}</p>
          </div>
          <a href={`/api/qr?url=${encodeURIComponent(l.url)}`} target="_blank" rel="noopener" className="rounded-full bg-[#f3f3f5] px-3 py-1.5 text-[13px] font-semibold hover:bg-[#e8e8ed]">
            {words.qr}
          </a>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(l.url).catch(() => {});
              setCopied(l.key);
              setTimeout(() => setCopied(null), 1600);
            }}
            className="rounded-full bg-[#0071e3] px-3.5 py-1.5 text-[13px] font-semibold text-white"
          >
            {copied === l.key ? words.copied : words.copy}
          </button>
        </li>
      ))}
    </ul>
  );
}
