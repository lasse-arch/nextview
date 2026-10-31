"use client";

import { useState } from "react";
import { allGuides, imageOfHref, isPlaceHref } from "../../tours/places";
import type { TourConfig } from "../../tours/types";

/*
 * "@" in a link field or in nextviewAI's chat: everything in the tour one can
 * link to - the menu's places, the points on the aerial photo, pictures, the
 * guided tours and the tour's own features (live data, the contact form, Vej
 * til stedet …). Picked, a link field gets the link; the chat gets "@Name",
 * and nextviewAI is told which link it means.
 */

/** `where`: the menu group it's in; `image`: a picture of it, shown beside the list - so two "Dronefoto"s can be told apart. */
export type Target = { label: string; kind: string; href: string; where?: string; image?: string };

export function tourTargets(T: TourConfig): Target[] {
  const out: Target[] = [];
  const seen = new Set<string>();
  const add = (label: string, kind: string, href: string, extra: { where?: string; image?: string } = {}) => {
    if (!label || !href || seen.has(href)) return;
    seen.add(href);
    out.push({ label, kind, href, ...extra });
  };
  const panos = T.panos?.basePath;
  for (const m of T.menu) {
    const items: [string, string][] = "items" in m ? m.items : [[m.title, m.href]];
    const where = "items" in m ? m.title : undefined;
    for (const [name, href] of items) {
      if (href.startsWith("#billede:")) add(name, "Billede", href, { where, image: imageOfHref(href) ?? undefined });
      else if (isPlaceHref(href)) add(name, "Sted", href, { where });
    }
  }
  for (const p of T.points ?? []) add(p.name, "Punkt", `#punkt:${p.id}`, { where: T.categories?.[p.cat]?.name || undefined, image: p.images?.[0] || p.panorama || (p.pano && panos ? `${panos}/${p.pano}-360.jpg` : undefined) });
  for (const g of allGuides(T)) add(g.id == null ? "Vis mig rundt" : g.title, "Rundvisning", g.id == null ? "#rundvisning" : `#rundvisning:${g.id}`);
  if (T.drone || T.map) add(T.map?.backLabel || T.drone?.backLabel || "Luftfotoet", "Luftfoto", "#luften", { image: T.map?.image || T.drone?.panorama || (T.drone?.basePath ? `${T.drone.basePath}-360.jpg` : undefined) });
  if (T.live) add(T.live.title || "Live data", "Funktion", "#live");
  if (T.contactForm) add("Kontaktformular", "Funktion", "#kontakt");
  if (T.commute) add(T.commute.title || "Vej til stedet", "Funktion", "#vej");
  if (T.day) add(T.day.title || "Sådan ser en dag ud", "Funktion", "#dag");
  if (T.wayfinding) add("Find vej", "Funktion", "#findvej");
  for (const c of T.cta) if (/^https?:\/\//.test(c.href)) add(c.label, "Knap", c.href);
  // Same name twice (two "Dronefoto"s): the name gets where it is, so "@Name" still means one of them.
  const count = new Map<string, number>();
  for (const t of out) count.set(t.label, (count.get(t.label) ?? 0) + 1);
  const used = new Map<string, number>();
  for (const t of out) {
    if ((count.get(t.label) ?? 0) < 2) continue;
    const n = (used.get(t.label) ?? 0) + 1;
    used.set(t.label, n);
    t.label = t.where && t.where !== t.label ? `${t.label} (${t.where})` : `${t.label} ${n}`;
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** The targets matching what's typed after "@" (best first, at most 8). */
export function matchTargets(targets: Target[], query: string): Target[] {
  const q = norm(query.trim());
  const hits = q ? targets.filter((t) => norm(t.label).includes(q) || norm(t.kind).startsWith(q)) : targets;
  return hits.sort((a, b) => Number(!norm(a.label).startsWith(q)) - Number(!norm(b.label).startsWith(q))).slice(0, 8);
}

/** The "@word" being typed right before the caret, if any. */
export function mentionAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = /(^|\s)@([^\s@]{0,40})$/.exec(before);
  return m ? { start: caret - m[2].length - 1, query: m[2] } : null;
}

/** The dropdown with the choices - and, beside it, a picture of the one pointed at (or picked with the arrow keys). */
export function MentionList({ items, active, onPick }: { items: Target[]; active: number; onPick: (t: Target) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!items.length) return null;
  const shown = items[hover ?? active] ?? items[0];
  return (
    <div className="relative z-30 mt-1" onMouseLeave={() => setHover(null)}>
      <ul className="max-h-72 overflow-y-auto rounded-xl bg-white p-1 shadow-[0_10px_30px_rgba(0,0,0,.18)] ring-1 ring-black/[.08]">
        {items.map((t, i) => (
          <li key={t.href}>
            <button
              type="button"
              // Before the field loses focus (a click would blur it first and close the list).
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(t);
              }}
              onMouseEnter={() => setHover(i)}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[14px] ${t === shown ? "bg-[#0071e3]/10" : "hover:bg-[#f2f2f7]"}`}
            >
              {t.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.image} alt="" loading="lazy" className="h-7 w-10 shrink-0 rounded-md bg-[#f2f2f7] object-cover" />
              ) : null}
              <span className="min-w-0 flex-1 truncate">@{t.label}</span>
              <span className="shrink-0 rounded-full bg-[#f2f2f7] px-2 py-0.5 text-[11px] text-[#6e6e73]">{t.kind}</span>
            </button>
          </li>
        ))}
      </ul>
      {shown.image && (
        <div className="pointer-events-none mt-1.5 overflow-hidden rounded-xl bg-white shadow-[0_10px_30px_rgba(0,0,0,.18)] ring-1 ring-black/[.08]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shown.image} alt="" className="aspect-[2/1] w-full bg-[#f2f2f7] object-cover" />
          <p className="truncate px-3 py-2 text-[12px] text-[#6e6e73]">
            <b className="font-semibold text-[#1d1d1f]">@{shown.label}</b>
            {shown.where ? ` · ${shown.where}` : ""} · {shown.kind}
          </p>
        </div>
      )}
    </div>
  );
}
