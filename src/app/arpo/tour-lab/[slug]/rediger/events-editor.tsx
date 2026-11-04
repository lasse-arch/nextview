"use client";

import { useState, useTransition } from "react";
import { checkTourDates } from "@/lib/actions/tour-dates";
import { checkShopProduct } from "@/lib/actions/tour-shop";
import type { TourConfig } from "../../tours/types";
import { Field, Group, input, Toggle } from "./ui";

type Edit = (fn: (d: TourConfig) => void) => void;

/** "Næste rundvisninger": the coming dates from a sign-up form (Zenbi) - and where the tour shows them. */
export function EventsEditor({ config, edit, slug }: { config: TourConfig; edit: Edit; slug: string }) {
  const ev = config.events;
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, start] = useTransition();
  const set = (patch: Partial<NonNullable<TourConfig["events"]>>) => edit((d) => void (d.events = { ...(d.events ?? { source: "" }), ...patch }));
  const cards = config.placeCards ?? [];
  return (
    <Group title="Næste rundvisninger (tilmelding)">
      <p className="px-1 text-[12px] leading-snug text-[#8e8e93]">
        De kommende datoer fra en tilmeldingsformular (Zenbi) med en knap til at tilmelde sig. Opdateres af sig selv hvert 10. minut - datoer, der er passeret, vises ikke.
      </p>
      <Field title="Link til formularen">
        <input
          className={input}
          placeholder="https://signup.zenbi.dk/form/…"
          value={ev?.source ?? ""}
          onChange={(e) => {
            setNote(null);
            const source = e.target.value.trim();
            edit((d) => void (d.events = source ? { ...(d.events ?? {}), source } : undefined));
          }}
        />
      </Field>
      {ev?.source && (
        <>
          <button
            type="button"
            disabled={busy}
            className="self-start rounded-lg px-2 py-1 text-[13px] font-medium text-[#0071e3] hover:bg-[#0071e3]/5"
            onClick={() => start(async () => setNote((r => (r.ok ? { text: r.text } : { text: r.error, error: true }))(await checkTourDates(slug, ev.source, ev.field))))}
          >
            {busy ? "Tjekker…" : "Tjek datoerne"}
          </button>
          {note && <p className={`px-1 text-[12px] leading-snug ${note.error ? "text-[#ff3b30]" : "text-[#1f7a35]"}`}>{note.text}</p>}
          <div className="flex gap-2">
            <Field title="Overskrift">
              <input className={input} placeholder="Næste rundvisninger" value={ev.title ?? ""} onChange={(e) => set({ title: e.target.value || undefined })} />
            </Field>
            <Field title="Knappen">
              <input className={input} placeholder="Tilmeld" value={ev.button ?? ""} onChange={(e) => set({ button: e.target.value || undefined })} />
            </Field>
          </div>
          <Field title="Antal datoer" hint="Højst så mange af de kommende.">
            <input type="number" min={1} max={8} className={`${input} w-20`} value={ev.max ?? 3} onChange={(e) => set({ max: Math.max(1, Math.min(8, Number(e.target.value) || 3)) })} />
          </Field>
          <p className="px-1 pt-1 text-[13px] font-medium text-[#1d1d1f]">Hvor står det?</p>
          <Toggle on={Boolean(ev.welcome)} onChange={(on) => set({ welcome: on || undefined })} title="På velkomsten" hint="I boksen med overskriften, under teksten." />
          <Toggle on={Boolean(ev.menu)} onChange={(on) => set({ menu: on || undefined })} title="I menuen" hint="Øverst i menuen, under logoet." />
          {cards.length > 0 && (
            <Field title="På stedkort" hint="Under kortets tekst - fx stedkortet ved indgangen eller i fællessalen.">
              <div className="flex flex-col gap-1.5">
                {cards.map((c, i) => (
                  <label key={i} className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" checked={Boolean(c.events)} onChange={(e) => edit((d) => void (d.placeCards![i] = { ...d.placeCards![i], events: e.target.checked || undefined }))} />
                    {c.title || `Stedkort ${i + 1}`}
                  </label>
                ))}
              </div>
            </Field>
          )}
          <details className="text-[12px] text-[#8e8e93]">
            <summary className="cursor-pointer select-none">Formularens datofelt hedder noget andet</summary>
            <input className={`${input} mt-1.5`} placeholder='Feltets navn - tom: det, der hedder "…dato…"' value={ev.field ?? ""} onChange={(e) => set({ field: e.target.value || undefined })} />
          </details>
        </>
      )}
    </Group>
  );
}

/** "Book ophold": the tour's own webshop booking (TourConfig.shop) - a "#book" button wherever it's wanted. */
export function ShopTourEditor({ config, edit, slug }: { config: TourConfig; edit: Edit; slug: string }) {
  const shop = config.shop;
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, start] = useTransition();
  const cta = config.cta.find((c) => c.href === "#book");
  const inMenu = config.menu.find((m): m is { title: string; href: string } => "href" in m && m.href === "#book");
  const label = cta?.label ?? inMenu?.title ?? "Book ophold";
  const setLabel = (l: string) =>
    edit((d) => {
      d.cta = d.cta.map((c) => (c.href === "#book" ? { ...c, label: l } : c));
      d.menu = d.menu.map((m) => ("href" in m && m.href === "#book" ? { ...m, title: l } : m));
    });
  return (
    <Group title="Book ophold (kalender fra webshop)">
      <p className="px-1 text-[12px] leading-snug text-[#8e8e93]">
        En knap med jeres egen tekst, der åbner en kalender: ledige dage fra kundens webshop, antal gæster og prisen - og Book, der åbner webshoppen. Knappen kan stå som tourens hovedknap, i menuen - og alle steder, et link kan stå (fliser, stedkort): linket er <code>#book</code>.
      </p>
      <Field title="Link til produktet i webshoppen" hint="Et produkt med en kalender, fx Bed and Breakfast.">
        <input
          className={input}
          placeholder="https://webshop.…/product/…"
          value={shop?.url ?? ""}
          onChange={(e) => {
            setNote(null);
            const url = e.target.value.trim();
            edit((d) => void (d.shop = url ? { ...d.shop, url } : undefined));
          }}
        />
      </Field>
      {shop?.url && (
        <>
          <button
            type="button"
            disabled={busy}
            className="self-start rounded-lg px-2 py-1 text-[13px] font-medium text-[#0071e3] hover:bg-[#0071e3]/5"
            onClick={() => start(async () => setNote(((r) => (r.ok ? { text: r.text } : { text: r.error, error: true }))(await checkShopProduct(slug, shop.url))))}
          >
            {busy ? "Tjekker…" : "Tjek hvad touren kan læse"}
          </button>
          {note && <p className={`px-1 text-[12px] leading-snug ${note.error ? "text-[#ff3b30]" : "text-[#1f7a35]"}`}>{note.text}</p>}
          <Field title="Knappens tekst">
            <input className={input} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Book ophold" />
          </Field>
          <Field title="Overskrift i kalenderen" hint="Tom: produktets navn.">
            <input className={input} value={shop.title ?? ""} onChange={(e) => edit((d) => void (d.shop = { ...d.shop!, title: e.target.value || undefined }))} />
          </Field>
          <Toggle
            on={Boolean(cta)}
            onChange={(on) =>
              edit((d) => {
                if (on) d.cta = [{ label, href: "#book", primary: true }, ...d.cta.map((c) => ({ ...c, primary: false }))];
                else {
                  d.cta = d.cta.filter((c) => c.href !== "#book");
                  if (d.cta.length && !d.cta.some((c) => c.primary)) d.cta[0] = { ...d.cta[0], primary: true };
                }
              })
            }
            title="Tourens hovedknap"
            hint="Står i boksen øverst, i menuen og på kortene, hvor tourens hovedknap står."
          />
          <Toggle
            on={Boolean(inMenu)}
            onChange={(on) => edit((d) => void (d.menu = on ? [...d.menu, { title: label, href: "#book" }] : d.menu.filter((m) => !("href" in m && m.href === "#book"))))}
            title="I menuen"
            hint="Som et menupunkt nederst - kan flyttes under Menu."
          />
        </>
      )}
    </Group>
  );
}
