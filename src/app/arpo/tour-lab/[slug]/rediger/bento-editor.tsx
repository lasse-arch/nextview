"use client";

import { LinkInput } from "./links-open";
import { bentoTiles } from "../bento";
import type { BentoTile, TourConfig } from "../../tours/types";
import { Choice, Field, Group, input } from "./ui";

type Edit = (fn: (draft: TourConfig) => void) => void;

/*
 * "Fliser" (bento) menu: the tiles, in order - each a title (a new line with
 * Enter), a small line over it, an optional badge, its size and colour, and
 * where it leads (a place in the menu, a button's link, or any link).
 */
export function BentoEditor({ config, edit }: { config: TourConfig; edit: Edit }) {
  const own = config.bento?.tiles;
  const tiles = own ?? bentoTiles(config);
  const targets: [string, string][] = [
    ...config.cta.map((c): [string, string] => [`Knap: ${c.label}`, c.href]),
    ...config.menu.flatMap((m): [string, string][] => ("items" in m ? m.items.map(([n, h]): [string, string] => [`${m.title}: ${n}`, h]) : [[m.title, m.href]])),
  ];
  const set = (next: BentoTile[]) => edit((d) => void (d.bento = next.length ? { tiles: next } : undefined));
  const put = (i: number, t: BentoTile) => set(tiles.map((x, j) => (j === i ? t : x)));
  const move = (i: number, by: number) => {
    const next = [...tiles];
    const [t] = next.splice(i, 1);
    next.splice(Math.max(0, Math.min(next.length, i + by)), 0, t);
    set(next);
  };
  return (
    <Group title="Fliserne i menuen">
      <p className="px-1 text-[12px] leading-snug text-[#8e8e93]">
        {own ? "Fliserne øverst i menuen. Under dem kommer alle steder fra menuen og kontakt." : "Lavet ud fra hovedknappen og menuen - ret én, så bliver de jeres egne."} Ny linje i titlen med Enter.
      </p>
      <div className="space-y-2">
        {tiles.map((t, i) => {
          const known = targets.some(([, h]) => h === t.href);
          return (
            <div key={i} className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-black/[.06]">
              <div className="flex items-start gap-2">
                <textarea className={`${input} min-h-[44px] flex-1 resize-y py-1.5 text-[14px] font-semibold`} rows={2} value={t.title} onChange={(e) => put(i, { ...t, title: e.target.value })} aria-label="Titel" />
                <div className="flex flex-col gap-0.5">
                  <button type="button" disabled={i === 0} className="h-6 w-6 rounded text-[#8e8e93] hover:bg-black/5 disabled:opacity-30" onClick={() => move(i, -1)} aria-label="Op">
                    ↑
                  </button>
                  <button type="button" disabled={i === tiles.length - 1} className="h-6 w-6 rounded text-[#8e8e93] hover:bg-black/5 disabled:opacity-30" onClick={() => move(i, 1)} aria-label="Ned">
                    ↓
                  </button>
                  <button type="button" className="h-6 w-6 rounded text-[#c7c7cc] hover:text-[#ff3b30]" onClick={() => set(tiles.filter((_, j) => j !== i))} aria-label="Fjern">
                    ×
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input className={`${input} py-1.5 text-[13px]`} placeholder="Lille linje, fx Frie vægte" value={t.kicker ?? ""} onChange={(e) => put(i, { ...t, kicker: e.target.value || undefined })} />
                <input className={`${input} py-1.5 text-[13px]`} placeholder="Mærke, fx Nyhed" value={t.tag ?? ""} onChange={(e) => put(i, { ...t, tag: e.target.value || undefined })} />
              </div>
              <Choice
                value={t.size ?? "normal"}
                options={[
                  ["normal", "Normal"],
                  ["wide", "Bred"],
                  ["tall", "Høj"],
                ]}
                onChange={(v) => put(i, { ...t, size: v === "normal" ? undefined : (v as BentoTile["size"]) })}
              />
              <Choice
                value={t.style ?? "light"}
                options={[
                  ["light", "Lys"],
                  ["dark", "Mørk"],
                  ["accent", "Accent"],
                ]}
                onChange={(v) => put(i, { ...t, style: v === "light" ? undefined : (v as BentoTile["style"]) })}
              />
              <Field title="Fører til">
                <select className={`${input} py-1.5 text-[13px]`} value={known ? t.href : ""} onChange={(e) => put(i, { ...t, href: e.target.value || "https://" })}>
                  <option value="">Eget link …</option>
                  {targets.map(([label, href]) => (
                    <option key={label + href} value={href}>
                      {label}
                    </option>
                  ))}
                </select>
                {!known && <LinkInput className="mt-1.5" value={t.href} onChange={(href) => put(i, { ...t, href })} />}
              </Field>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        <button type="button" className="flex-1 rounded-xl bg-white py-2 text-[13px] font-medium text-[#0071e3] ring-1 ring-black/[.06]" onClick={() => set([...tiles, { title: "Ny flise", href: targets[0]?.[1] ?? "https://" }])}>
          + Flise
        </button>
        {own && (
          <button type="button" className="rounded-xl px-3 py-2 text-[13px] text-[#8e8e93] hover:text-[#ff3b30]" onClick={() => edit((d) => void (d.bento = undefined))}>
            Lav dem ud fra menuen igen
          </button>
        )}
      </div>
    </Group>
  );
}
