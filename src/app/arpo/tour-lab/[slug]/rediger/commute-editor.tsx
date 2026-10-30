"use client";

import { useState } from "react";
import { findWeatherPlace } from "@/lib/actions/tour-weather";
import type { TourConfig } from "../../tours/types";
import { Field, Group, Toggle, input } from "./ui";

/** "Vej til skolen": the place (an address), its name in the tour, when one meets - and a menu item that opens it. */
export function CommuteEditor({ config, edit }: { config: TourConfig; edit: (fn: (d: TourConfig) => void) => void }) {
  const C = config.commute;
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const inMenu = config.menu.some((m) => ("items" in m ? m.items.some(([, h]) => h === "#vej") : m.href === "#vej"));

  async function find(q: string) {
    setBusy(true);
    setNote(null);
    const hit = await findWeatherPlace(q);
    setBusy(false);
    if ("error" in hit) return setNote({ text: hit.error, error: true });
    edit((d) => void (d.commute = { ...d.commute, lat: Math.round(hit.lat * 100000) / 100000, lon: Math.round(hit.lon * 100000) / 100000, place: d.commute?.place || d.brand || hit.name }));
    setNote({ text: `Fundet: ${hit.name}. Prøv den i forhåndsvisningen.` });
    setQuery("");
  }

  return (
    <Group title="Vej til stedet">
      <Toggle
        on={Boolean(C)}
        title='"Hvor langt har du til os?"'
        hint="Gæsten skriver sin adresse eller sit postnummer og ser afstanden og tiden i bil, på cykel og til fods - og en knap til rejsen med bus og tog i Google Maps."
        onChange={(on) => {
          if (!on) return edit((d) => void (d.commute = undefined));
          void find(config.contact?.address || config.brand || config.title);
        }}
      />
      {C && (
        <>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim()) void find(query);
            }}
          >
            <input className={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Adressen - fx Saxogade 2, 9000 Aalborg" />
            <button type="submit" disabled={busy || !query.trim()} className="rounded-xl bg-[#0071e3] px-3 text-[14px] font-medium text-white disabled:opacity-40">
              {busy ? "…" : "Find"}
            </button>
          </form>
          <Field title="Navn i touren" hint='"Find din vej til …"'>
            <input className={input} value={C.place} onChange={(e) => edit((d) => void (d.commute = { ...C, place: e.target.value.slice(0, 60) }))} />
          </Field>
          <Field title="Overskrift" hint='Tom = "Hvor langt har du til os?"'>
            <input className={input} value={C.title ?? ""} placeholder="Hvor langt har du til skolen?" onChange={(e) => edit((d) => void (d.commute = { ...C, title: e.target.value.slice(0, 60) || undefined }))} />
          </Field>
          <Field title="Mødetid (valgfri)" hint='Vises ved bus og tog: "Vi mødes kl. 08:10".'>
            <input type="time" className={input} value={C.meet ?? ""} onChange={(e) => edit((d) => void (d.commute = { ...C, meet: e.target.value || undefined }))} />
          </Field>
          {!inMenu ? (
            <button type="button" className="text-[13px] font-medium text-[#0071e3]" onClick={() => edit((d) => void d.menu.push({ title: C.title || "Vej til os", href: "#vej" }))}>
              + Læg den i menuen
            </button>
          ) : (
            <p className="px-1 text-[12px] text-[#8e8e93]">Ligger i menuen. Den kan også åbnes fra en flise eller knap med linket #vej.</p>
          )}
        </>
      )}
      {note && <p className={`px-1 text-[12px] ${note.error ? "text-[#ff3b30]" : "text-[#34c759]"}`}>{note.text}</p>}
    </Group>
  );
}
