"use client";

import type { LinkOpen, PopupSize, TourConfig } from "../../tours/types";
import { Choice, Field, Toggle } from "./ui";

/*
 * How the tour's links open (Knapper og kontakt → Åbning): the default, a
 * popup's size, and whether the popup says which site it shows.
 */

const SIZES: [PopupSize, string][] = [
  ["lille", "Lille"],
  ["mellem", "Mellem"],
  ["stor", "Stor"],
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
        <Choice value={L?.size ?? "stor"} options={SIZES} onChange={(v: PopupSize) => set((l) => void (l.size = v === "stor" ? undefined : v))} />
      </Field>
      <Toggle
        on={L?.showSite !== false}
        onChange={(on) => set((l) => void (l.showSite = on ? undefined : false))}
        title="Vis hvilken side popup'en viser"
        hint={`Fx "Fra boxdepotet.dk" eller "Fra onlinebooking.dk" øverst i popup'en, så de besøgende ved, hvilken side de er på.`}
      />
    </>
  );
}
