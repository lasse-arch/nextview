"use client";

import { allGuides, isPlaceHref } from "../../tours/places";
import type { TourConfig } from "../../tours/types";

/*
 * "@" in a link field or in nextviewAI's chat: everything in the tour one can
 * link to - the menu's places, the points on the aerial photo, pictures, the
 * guided tours and the tour's own features (live data, the contact form, Vej
 * til stedet …). Picked, a link field gets the link; the chat gets "@Name",
 * and nextviewAI is told which link it means.
 */

export type Target = { label: string; kind: string; href: string };

export function tourTargets(T: TourConfig): Target[] {
  const out: Target[] = [];
  const seen = new Set<string>();
  const add = (label: string, kind: string, href: string) => {
    if (!label || !href || seen.has(kind + label)) return;
    seen.add(kind + label);
    out.push({ label, kind, href });
  };
  for (const m of T.menu) {
    const items: [string, string][] = "items" in m ? m.items : [[m.title, m.href]];
    for (const [name, href] of items) {
      if (href.startsWith("#billede:")) add(name, "Billede", href);
      else if (isPlaceHref(href)) add(name, "Sted", href);
    }
  }
  for (const p of T.points ?? []) add(p.name, "Punkt", `#punkt:${p.id}`);
  for (const g of allGuides(T)) add(g.id == null ? "Vis mig rundt" : g.title, "Rundvisning", g.id == null ? "#rundvisning" : `#rundvisning:${g.id}`);
  if (T.drone || T.map) add(T.map?.backLabel || T.drone?.backLabel || "Luftfotoet", "Luftfoto", "#luften");
  if (T.live) add(T.live.title || "Live data", "Funktion", "#live");
  if (T.contactForm) add("Kontaktformular", "Funktion", "#kontakt");
  if (T.commute) add(T.commute.title || "Vej til stedet", "Funktion", "#vej");
  if (T.day) add(T.day.title || "Sådan ser en dag ud", "Funktion", "#dag");
  if (T.wayfinding) add("Find vej", "Funktion", "#findvej");
  for (const c of T.cta) if (/^https?:\/\//.test(c.href)) add(c.label, "Knap", c.href);
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

/** The dropdown with the choices. */
export function MentionList({ items, active, onPick }: { items: Target[]; active: number; onPick: (t: Target) => void }) {
  if (!items.length) return null;
  return (
    <ul className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-xl bg-white p-1 shadow-[0_10px_30px_rgba(0,0,0,.18)] ring-1 ring-black/[.08]">
      {items.map((t, i) => (
        <li key={t.kind + t.label}>
          <button
            type="button"
            // Before the field loses focus (a click would blur it first and close the list).
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(t);
            }}
            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[14px] ${i === active ? "bg-[#0071e3]/10" : "hover:bg-[#f2f2f7]"}`}
          >
            <span className="min-w-0 flex-1 truncate">@{t.label}</span>
            <span className="shrink-0 rounded-full bg-[#f2f2f7] px-2 py-0.5 text-[11px] text-[#6e6e73]">{t.kind}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
