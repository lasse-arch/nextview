"use client";

import type { LinkOpen, PopupSize, TourConfig } from "../../tours/types";
import { Choice, Field, input, Toggle } from "./ui";

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
