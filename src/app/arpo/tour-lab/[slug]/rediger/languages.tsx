"use client";

import { useMemo, useState, useTransition } from "react";
import { translateTour } from "@/lib/actions/tour-translate";
import { LANGUAGES, langName, tourLanguages, translatableTexts } from "../../tours/i18n";
import type { TourConfig } from "../../tours/types";
import { Choice, Group, input } from "./ui";

/*
 * "Sprog": which languages the tour comes in, nextviewAI's translation of
 * everything (the tour's texts and the engine's own words), every text to
 * check and correct by hand, and the preview in each language.
 */

export function LanguagesPanel({ slug, config, edit, showIn }: { slug: string; config: TourConfig; edit: (fn: (d: TourConfig) => void) => void; showIn: (lang: string) => void }) {
  const langs = (config.languages ?? []).filter((l) => l !== "da");
  const texts = useMemo(() => translatableTexts(config), [config]);
  const [shown, setShown] = useState<string>(langs[0] ?? "");
  const [preview, setPreview] = useState("da");
  const [query, setQuery] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const missing = (lang: string) => texts.filter((t) => !config.translations?.[lang]?.[t]?.trim()).length;
  const lang = langs.includes(shown) ? shown : langs[0];

  function toggle(code: string, on: boolean) {
    edit((d) => {
      const next = new Set(d.languages ?? []);
      if (on) next.add(code);
      else next.delete(code);
      d.languages = next.size ? LANGUAGES.map((l) => l.code).filter((c) => next.has(c)) : undefined;
    });
    if (on) setShown(code);
  }

  function translate(all: boolean, which = langs) {
    setMsg(null);
    start(async () => {
      const r = await translateTour(slug, config, which, all);
      if (!r.ok) return setMsg(r.error);
      edit((d) => {
        d.translations = { ...(d.translations ?? {}) };
        for (const [l, map] of Object.entries(r.translations)) d.translations[l] = { ...(d.translations[l] ?? {}), ...map };
      });
      setMsg(r.count ? `nextviewAI oversatte ${r.count} tekster. Tjek dem, og tryk Gem.` : "Alt var allerede oversat.");
    });
  }

  const list = lang ? texts.filter((t) => (!onlyMissing || !config.translations?.[lang]?.[t]?.trim()) && (!query.trim() || `${t} ${config.translations?.[lang]?.[t] ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()))) : [];

  return (
    <>
      <Group title="Sprog i touren">
        <p className="text-[13px] leading-snug text-[#6e6e73]">Touren er skrevet på dansk. Vælg flere sprog, så får de besøgende en sprogknap, og touren starter selv på deres sprog, når den har det. Et link kan vælge sprog med ?sprog=en.</p>
        {langs.includes("kl") && <p className="text-[12px] leading-snug text-[#a05a00]">Grønlandsk oversætter nextviewAI mindre sikkert end de store sprog - få en, der taler grønlandsk, til at læse dem igennem og rette dem nedenfor under &quot;Teksterne&quot;, før touren går live.</p>}
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.filter((l) => l.code !== "da").map((l) => {
            const on = langs.includes(l.code);
            return (
              <button
                key={l.code}
                type="button"
                onClick={() => toggle(l.code, !on)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium ring-1 transition ${on ? "bg-[#0071e3] text-white ring-[#0071e3]" : "bg-white text-[#1d1d1f] ring-black/[.08] hover:bg-[#f5f5f7]"}`}
              >
                <span aria-hidden>{l.flag}</span>
                {l.code === "kl" ? "Kalaallisut (grønlandsk)" : l.name}
                {on && missing(l.code) > 0 && <span className="rounded-full bg-white/25 px-1.5 text-[11px]">{missing(l.code)} mangler</span>}
              </button>
            );
          })}
        </div>
        {langs.length > 0 && (
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={pending} onClick={() => translate(false)} className="rounded-xl bg-[#0071e3] px-4 py-2 text-[14px] font-medium text-white disabled:opacity-50">
                {pending ? "nextviewAI oversætter…" : `Oversæt med nextviewAI${langs.some((l) => missing(l) > 0) ? ` (${langs.reduce((n, l) => n + missing(l), 0)} tekster)` : ""}`}
              </button>
              <button type="button" disabled={pending} onClick={() => confirm("Oversæt alle tekster forfra? Dine egne rettelser bliver overskrevet.") && translate(true)} className="rounded-xl bg-white px-3 py-2 text-[13px] font-medium text-[#0071e3] ring-1 ring-black/[.06] disabled:opacity-50">
                Oversæt alt forfra
              </button>
            </div>
            {msg && <p className="text-[13px] text-[#1d1d1f]">{msg}</p>}
            <p className="text-[12px] leading-snug text-[#8e8e93]">Speak (lyd) findes kun på dansk - på andre sprog kører &quot;Vis mig rundt&quot; med tekst.</p>
          </div>
        )}
      </Group>

      {langs.length > 0 && (
        <Group title="Hvor man skifter sprog">
          {(["desktop", "mobile"] as const).map((device) => (
            <div key={device} className="space-y-1.5">
              <span className="block text-[13px] font-medium text-[#6e6e73]">{device === "desktop" ? "Computer" : "Mobil"}</span>
              <Choice
                value={config.langSwitch?.[device] ?? (device === "desktop" ? "top" : "menu")}
                options={[
                  ["top", "Øverst"],
                  ["corner", "Ved menuknappen"],
                  ["menu", "I menuen"],
                  ["hidden", "Skjult"],
                ]}
                onChange={(v) =>
                  edit((d) => {
                    const next = { ...d.langSwitch, [device]: v === (device === "desktop" ? "top" : "menu") ? undefined : v };
                    if (!next[device]) delete next[device];
                    d.langSwitch = Object.keys(next).length ? (next as TourConfig["langSwitch"]) : undefined;
                  })
                }
              />
            </div>
          ))}
          <p className="text-[12px] leading-snug text-[#8e8e93]">I menuen: øverst i sidemenuen (andre menuer får knappen ved menuknappen). Skjult: kun med et link, fx ?sprog=en. Under velkomsten vises knappen altid, så man kan skifte før man går ind.</p>
        </Group>
      )}

      {langs.length > 0 && (
        <Group title="Se touren på">
          <Choice
            value={preview}
            options={tourLanguages(config).map((l): [string, string] => [l, langName(l)])}
            onChange={(l) => {
              setPreview(l);
              showIn(l);
            }}
          />
        </Group>
      )}

      {lang && (
        <Group title="Teksterne">
          {langs.length > 1 && <Choice value={lang} options={langs.map((l): [string, string] => [l, langName(l)])} onChange={setShown} />}
          <div className="flex items-center gap-2">
            <input className={input} placeholder="Søg i teksterne" value={query} onChange={(e) => setQuery(e.target.value)} />
            <label className="flex flex-none items-center gap-1.5 text-[13px] text-[#6e6e73]">
              <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Kun manglende
            </label>
          </div>
          <ul className="space-y-2">
            {list.slice(0, 200).map((t) => {
              const value = config.translations?.[lang]?.[t] ?? "";
              return (
                <li key={t} className="rounded-xl bg-white p-2.5 ring-1 ring-black/[.06]">
                  <p className="mb-1 text-[12px] leading-snug text-[#8e8e93]">{t}</p>
                  <textarea
                    rows={t.length > 70 ? 3 : 1}
                    className={`${input} resize-y ${value ? "" : "ring-1 ring-[#ff9f0a]"}`}
                    placeholder="Ikke oversat - vises på dansk"
                    value={value}
                    onChange={(e) =>
                      edit((d) => {
                        d.translations = { ...(d.translations ?? {}), [lang]: { ...(d.translations?.[lang] ?? {}), [t]: e.target.value } };
                        if (!e.target.value) delete d.translations[lang][t];
                      })
                    }
                  />
                </li>
              );
            })}
          </ul>
          {list.length > 200 && <p className="text-[12px] text-[#8e8e93]">Viser 200 af {list.length} - søg for at finde resten.</p>}
        </Group>
      )}
    </>
  );
}
