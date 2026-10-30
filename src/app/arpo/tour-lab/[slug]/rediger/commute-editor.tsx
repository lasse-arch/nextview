"use client";

import { useState } from "react";
import { findWeatherPlace } from "@/lib/actions/tour-weather";
import type { MenuEntry, TourConfig } from "../../tours/types";
import { Choice, Field, Group, Toggle, input } from "./ui";

type Commute = NonNullable<TourConfig["commute"]>;

/** The menu's "#vej" items (on their own or in a group) get the heading too - one name everywhere. */
function renameInMenu(menu: MenuEntry[], title: string): MenuEntry[] {
  return menu.map((m) => ("items" in m ? { ...m, items: m.items.map(([n, h]): [string, string] => [h === "#vej" ? title : n, h]) } : m.href === "#vej" ? { ...m, title } : m));
}

/** "Vej til skolen": the place (an address), its name in the tour, the heading, when one meets, the ways shown - and where it's opened from. */
export function CommuteEditor({ config, edit }: { config: TourConfig; edit: (fn: (d: TourConfig) => void) => void }) {
  const C = config.commute;
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const inMenu = config.menu.some((m) => ("items" in m ? m.items.some(([, h]) => h === "#vej") : m.href === "#vej"));
  const set = (fn: (c: Commute) => void) =>
    edit((d) => {
      if (!d.commute) return;
      const c = { ...d.commute };
      fn(c);
      d.commute = c;
    });

  async function find(q: string) {
    setBusy(true);
    setNote(null);
    const hit = await findWeatherPlace(q);
    setBusy(false);
    if ("error" in hit) return setNote({ text: hit.error, error: true });
    edit(
      (d) =>
        void (d.commute = {
          ...d.commute,
          lat: Math.round(hit.lat * 100000) / 100000,
          lon: Math.round(hit.lon * 100000) / 100000,
          address: hit.address,
          place: d.commute?.place || d.brand || hit.name,
        })
    );
    setNote({ text: `Fundet: ${hit.address}. Prøv den i forhåndsvisningen.` });
    setQuery("");
  }

  const title = C?.title || "Hvor langt har du til os?";
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
          <Field title="Adressen" hint={C.address ? `Nu: ${C.address}` : undefined}>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (query.trim()) void find(query);
              }}
            >
              <input className={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Fx Saxogade 2, 9000 Aalborg" />
              <button type="submit" disabled={busy || !query.trim()} className="rounded-xl bg-[#0071e3] px-3 text-[14px] font-medium text-white disabled:opacity-40">
                {busy ? "…" : "Find"}
              </button>
            </form>
          </Field>
          <Field title="Navn i touren" hint='"Find din vej til …"'>
            <input className={input} value={C.place} onChange={(e) => set((c) => void (c.place = e.target.value.slice(0, 60)))} />
          </Field>
          <Field title="Overskrift" hint={`Tom = "Hvor langt har du til os?"${inMenu ? " - menupunktet hedder det samme." : ""}`}>
            <input
              className={input}
              value={C.title ?? ""}
              placeholder="Hvor langt har du til skolen?"
              onChange={(e) =>
                edit((d) => {
                  const t = e.target.value.slice(0, 60);
                  d.commute = { ...d.commute!, title: t || undefined };
                  d.menu = renameInMenu(d.menu, t || "Hvor langt har du til os?");
                })
              }
            />
          </Field>
          <Field title="Mødetid" hint={C.meet ? `Vises ved bus og tog: "Vi mødes kl. ${C.meet}".` : "Ingen mødetid - bus og tog vises uden."}>
            <div className="flex items-center gap-2">
              <input type="time" className={input} value={C.meet ?? ""} onChange={(e) => set((c) => void (c.meet = e.target.value || undefined))} />
              {C.meet && (
                <button type="button" className="shrink-0 text-[13px] font-medium text-[#ff3b30]" onClick={() => set((c) => void (c.meet = undefined))}>
                  Ingen
                </button>
              )}
            </div>
          </Field>
          <Field title="Vis" hint="Cykel over 45 min. og gang over 1 time vises aldrig.">
            <div className="flex flex-wrap gap-3 text-[14px]">
              {(
                [
                  ["car", "🚗 Bil"],
                  ["bike", "🚲 Cykel"],
                  ["walk", "🚶 Til fods"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#0071e3]"
                    checked={!C.hide?.[k]}
                    onChange={(e) =>
                      set((c) => {
                        const hide = { ...c.hide, [k]: e.target.checked ? undefined : (true as const) };
                        if (!hide[k]) delete hide[k];
                        c.hide = Object.keys(hide).length ? hide : undefined;
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </Field>
          <Field title="Knap på touren" hint={C.button ? "Står på touren - og i menuen, hvis den ligger der." : "Ingen knap - den åbnes fra menuen eller en flise/knap med linket #vej."}>
            <Choice<"none" | NonNullable<Commute["button"]>>
              value={C.button ?? "none"}
              options={[
                ["none", "Kun menu"],
                ["under-menu", "Under menu"],
                ["bottom-left", "Nede tv."],
                ["bottom-right", "Nede th."],
              ]}
              onChange={(v) => set((c) => void (c.button = v === "none" ? undefined : v))}
            />
          </Field>
          {!inMenu ? (
            <button type="button" className="text-[13px] font-medium text-[#0071e3]" onClick={() => edit((d) => void d.menu.push({ title, href: "#vej" }))}>
              + Læg den i menuen
            </button>
          ) : (
            <div className="flex items-center justify-between px-1 text-[12px] text-[#8e8e93]">
              <span>Ligger i menuen som &quot;{title}&quot;.</span>
              <button
                type="button"
                className="font-medium text-[#ff3b30]"
                onClick={() =>
                  edit((d) => {
                    d.menu = d.menu
                      .filter((m) => "items" in m || m.href !== "#vej")
                      .map((m) => ("items" in m ? { ...m, items: m.items.filter(([, h]) => h !== "#vej") } : m));
                  })
                }
              >
                Fjern fra menuen
              </button>
            </div>
          )}
        </>
      )}
      {note && <p className={`px-1 text-[12px] ${note.error ? "text-[#ff3b30]" : "text-[#34c759]"}`}>{note.text}</p>}
    </Group>
  );
}
