"use client";

import { createContext, useContext, useState } from "react";
import type { LinkOpen, PopupSize, TourConfig } from "../../tours/types";
import { Choice, Field, GearButton, input, Toggle } from "./ui";

/*
 * How the tour's links open (Knapper og kontakt → Åbning): the default, a
 * popup's size, and whether the popup says which site it shows.
 */

const SIZES: [PopupSize, string][] = [
  ["lille", "Lille"],
  ["mellem", "Mellem"],
  ["stor", "Stor"],
  ["egen", "Egen"],
  ["fuld", "Fuld skærm"],
];
const MODES: [LinkOpen, string][] = [
  ["popup", "Popup over touren"],
  ["tab", "Ny fane"],
  ["same", "Samme fane"],
];

export function LinksOpenEditor({ config, edit }: { config: TourConfig; edit: (fn: (d: TourConfig) => void) => void }) {
  const L = config.linkOpen;
  const def = L?.default ?? "tab";
  const set = (fn: (l: NonNullable<TourConfig["linkOpen"]>) => void) =>
    edit((d) => {
      const l = { ...(d.linkOpen ?? { default: "tab" as LinkOpen }) };
      fn(l);
      d.linkOpen = l;
    });
  return (
    <>
      <Field title="Links åbner som standard">
        <Choice value={def} options={MODES} onChange={(v: LinkOpen) => set((l) => void (l.default = v))} />
      </Field>
      <Field title="Popup-størrelse">
        <Choice
          value={L?.size ?? "stor"}
          options={SIZES}
          onChange={(v: PopupSize) =>
            set((l) => {
              l.size = v === "stor" ? undefined : v;
              if (v === "egen" && !l.custom) l.custom = { w: 1200, h: 900 };
            })
          }
        />
      </Field>
      {L?.size === "egen" && (
        <div className="grid grid-cols-2 gap-2">
          {(["w", "h"] as const).map((k) => (
            <Field key={k} title={k === "w" ? "Bredde (px)" : "Højde (px)"}>
              <input
                type="number"
                min={300}
                max={4000}
                step={10}
                className={input}
                value={L.custom?.[k] ?? (k === "w" ? 1200 : 900)}
                onChange={(e) => set((l) => void (l.custom = { w: l.custom?.w ?? 1200, h: l.custom?.h ?? 900, [k]: Math.max(300, Math.min(4000, Number(e.target.value) || 0)) }))}
              />
            </Field>
          ))}
          <p className="col-span-2 px-1 text-[12px] leading-snug text-[#8e8e93]">Aldrig større end skærmen - på en telefon fylder popup&apos;en skærmen som altid.</p>
        </div>
      )}
      <Toggle
        on={L?.showSite !== false}
        onChange={(on) => set((l) => void (l.showSite = on ? undefined : false))}
        title="Vis hvilken side popup'en viser"
        hint={`Fx "Fra boxdepotet.dk" eller "Fra onlinebooking.dk" øverst i popup'en, så de besøgende ved, hvilken side de er på.`}
      />
    </>
  );
}

/* ----- One link's own way of opening: the ⚙ next to every link field. ----- */

type Edit = (fn: (d: TourConfig) => void) => void;
/** The setup and its edit, for the link fields deep in the editor (set once round the editor). */
export const LinkOpenContext = createContext<{ config: TourConfig; edit: Edit } | null>(null);

const MODE_NAME: Record<LinkOpen, string> = { popup: "popup over touren", tab: "ny fane", same: "samme fane" };

/**
 * A web link's field, with a ⚙ beside it: how this one link opens - the
 * tour's standard (Knapper og kontakt → Åbning), or its own: new tab, popup
 * over the tour or the same tab. Saved by the link's address (linkOpen.byUrl).
 */
export function LinkInput({ value, onChange, onBlur, className = "", placeholder = "https://…" }: { value: string; onChange: (href: string) => void; onBlur?: (href: string) => void; className?: string; placeholder?: string }) {
  const ctx = useContext(LinkOpenContext);
  const [open, setOpen] = useState(false);
  const href = value.trim();
  const web = /^https?:\/\/\S+\.\S+/i.test(href);
  const def = ctx?.config.linkOpen?.default ?? "tab";
  const own = ctx?.config.linkOpen?.byUrl?.[href];
  const setOwn = (mode: LinkOpen | "standard") =>
    ctx?.edit((d) => {
      const byUrl = { ...d.linkOpen?.byUrl };
      if (mode === "standard") delete byUrl[href];
      else byUrl[href] = mode;
      d.linkOpen = { ...(d.linkOpen ?? { default: "tab" as LinkOpen }), byUrl: Object.keys(byUrl).length ? byUrl : undefined };
    });
  // A new address takes its old one's setting along.
  const change = (next: string) => {
    onChange(next);
    if (own && ctx && next.trim() !== href)
      ctx.edit((d) => {
        const byUrl = { ...d.linkOpen?.byUrl };
        delete byUrl[href];
        if (next.trim()) byUrl[next.trim()] = own;
        d.linkOpen = { ...(d.linkOpen ?? { default: "tab" as LinkOpen }), byUrl: Object.keys(byUrl).length ? byUrl : undefined };
      });
  };
  return (
    <div className={className}>
      <div className="flex items-center gap-1">
        <input className={`${input} ${className.includes("bg-white") ? "bg-white" : ""}`} value={value} placeholder={placeholder} onChange={(e) => change(e.target.value)} onBlur={onBlur ? (e) => onBlur(e.target.value) : undefined} />
        {ctx && web && <GearButton open={open} changed={own != null} onClick={() => setOpen(!open)} title="Hvordan linket åbner" />}
      </div>
      {ctx && web && open && (
        <div className="mt-1.5 space-y-1.5 rounded-xl bg-[#f2f2f7] p-2">
          <span className="block px-1 text-[12px] font-medium text-[#6e6e73]">Linket åbner som</span>
          <Choice<LinkOpen | "standard">
            value={own ?? "standard"}
            options={[
              ["standard", "Standard"],
              ["tab", "Ny fane"],
              ["popup", "Popup"],
              ["same", "Samme fane"],
            ]}
            onChange={setOwn}
          />
          <p className="px-1 text-[11px] leading-snug text-[#8e8e93]">
            {own ? "Gælder alle steder i touren, hvor netop dette link bruges." : `Standard = tourens indstilling (${MODE_NAME[def]}) under Knapper og kontakt → Åbning.`}
          </p>
        </div>
      )}
    </div>
  );
}
