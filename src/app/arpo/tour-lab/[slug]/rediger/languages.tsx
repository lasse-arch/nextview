"use client";

import { useMemo, useState, useTransition } from "react";
import { translateTour } from "@/lib/actions/tour-translate";
import { findLinkTranslations } from "@/lib/actions/tour-links";
import { LANGUAGES, langName, linkIn, tourLanguages, tourWebLinks, translatableTexts } from "../../tours/i18n";
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
  const links = useMemo(() => tourWebLinks(config), [config]);

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

      {langs.length > 0 && <p className="px-1 text-[12px] leading-snug text-[#8e8e93]">Hvor man skifter sprog på computer og mobil, vælges under Layout → Placering.</p>}

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

      {lang && links.length > 0 && <LinksPerLanguage slug={slug} config={config} edit={edit} langs={langs} lang={lang} setLang={setShown} links={links} />}

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

/**
 * "Links pr. sprog": every web link in the tour, with its own address in each
 * language (e.g. the English page of the farm holiday) - left empty, the
 * Danish page opens. A rule ("starter med … → …") covers many links at once.
 */
function LinksPerLanguage({ slug, config, edit, langs, lang, setLang, links }: { slug: string; config: TourConfig; edit: (fn: (d: TourConfig) => void) => void; langs: string[]; lang: string; setLang: (l: string) => void; links: string[] }) {
  const map = config.linkTranslations?.[lang] ?? {};
  const rules = Object.entries(map).filter(([k]) => k.endsWith("*"));
  const [rule, setRule] = useState({ from: "", to: "" });
  const [finding, startFind] = useTransition();
  const [found, setFound] = useState<string | null>(null);
  /** Each linked page is read, and its own language versions (hreflang) fill the empty fields - nothing typed is overwritten. */
  const find = () =>
    startFind(async () => {
      setFound(null);
      const r = await findLinkTranslations(slug, links, langs);
      if (!r.ok) return setFound(r.error);
      let n = 0;
      const per: string[] = [];
      edit((d) => {
        const all = { ...(d.linkTranslations ?? {}) };
        for (const [l, map] of Object.entries(r.found)) {
          const next = { ...(all[l] ?? {}) };
          let k = 0;
          for (const [da, x] of Object.entries(map))
            if (!next[da]?.trim()) {
              next[da] = x;
              k++;
            }
          if (Object.keys(next).length) all[l] = next;
          n += k;
          if (k) per.push(`${langName(l)} ${k}`);
        }
        d.linkTranslations = Object.keys(all).length ? all : undefined;
      });
      setFound(
        n
          ? `Fandt ${n} adresser (${per.join(", ")}) på ${r.read} sider. Tjek dem, og tryk Gem.`
          : `Ingen nye adresser fundet på ${r.read} sider${r.failed ? ` (${r.failed} kunne ikke læses)` : ""} - siderne siger ikke selv, hvor sprogudgaverne ligger. Skriv dem ind herunder.`
      );
    });
  const set = (da: string, value: string) =>
    edit((d) => {
      const next = { ...(d.linkTranslations?.[lang] ?? {}) };
      if (value.trim()) next[da] = value.trim();
      else delete next[da];
      const all = { ...(d.linkTranslations ?? {}), [lang]: next };
      if (!Object.keys(next).length) delete all[lang];
      d.linkTranslations = Object.keys(all).length ? all : undefined;
    });
  const valid = (u: string) => /^https?:\/\/[^\s]+$/i.test(u.trim());
  const done = links.filter((l) => linkIn(config, lang, l) !== l).length;
  return (
    <Group title="Links pr. sprog">
      <p className="text-[13px] leading-snug text-[#6e6e73]">
        Knapper og links fører til de danske sider. Skriv adressen på samme side i {langName(lang)}-udgaven ud for hvert link, så åbner touren den, når den vises på det sprog. Tomt felt = den danske side.
      </p>
      <button type="button" disabled={finding} onClick={find} className="self-start rounded-xl bg-[#0071e3] px-4 py-2 text-[14px] font-medium text-white disabled:opacity-50">
        {finding ? "Leder på hjemmesiden …" : "Find dem på hjemmesiden"}
      </button>
      <p className="text-[12px] leading-snug text-[#8e8e93]">Læser hver side, touren linker til, og tager de sprogudgaver, siden selv nævner. Felter, du har skrevet i, bliver ikke rørt.</p>
      {found && <p className="text-[13px] text-[#1d1d1f]">{found}</p>}
      {langs.length > 1 && <Choice value={lang} options={langs.map((l): [string, string] => [l, langName(l)])} onChange={setLang} />}
      <p className="text-[12px] text-[#8e8e93]">
        {done} af {links.length} links har deres egen adresse ({langName(lang)}).
      </p>
      <ul className="space-y-2">
        {links.map((l) => {
          const own = map[l] ?? "";
          const byRule = !own && linkIn(config, lang, l) !== l ? linkIn(config, lang, l) : null;
          return (
            <li key={l} className="rounded-xl bg-white p-2.5 ring-1 ring-black/[.06]">
              <a href={l} target="_blank" rel="noreferrer noopener" className="mb-1 block truncate text-[12px] leading-snug text-[#8e8e93] hover:text-[#0071e3]" title={l}>
                {l}
              </a>
              <input
                className={`${input} ${own && !valid(own) ? "ring-1 ring-[#ff3b30]" : ""}`}
                type="url"
                placeholder={byRule ? `Via regel: ${byRule}` : "Samme side på dette sprog (https://…)"}
                value={own}
                onChange={(e) => set(l, e.target.value)}
              />
              {own && !valid(own) && <p className="mt-1 text-[11px] text-[#ff3b30]">Skal være en hel adresse, der starter med https://</p>}
            </li>
          );
        })}
      </ul>
      <div className="space-y-1.5 rounded-xl bg-[#f2f2f7] p-2.5">
        <p className="text-[12px] font-medium text-[#6e6e73]">Regel for mange links på én gang</p>
        {rules.map(([from, to]) => (
          <div key={from} className="flex items-center gap-2 text-[12px] text-[#1d1d1f]">
            <span className="min-w-0 flex-1 truncate" title={`${from} → ${to}`}>
              {from} → {to}
            </span>
            <button type="button" className="text-[12px] font-medium text-[#c4314b]" onClick={() => set(from, "")}>
              Fjern
            </button>
          </div>
        ))}
        <input className={input} placeholder="Starter med, fx https://webshop.dk/" value={rule.from} onChange={(e) => setRule({ ...rule, from: e.target.value })} />
        <input className={input} placeholder="Bliver til, fx https://webshop.dk/en/" value={rule.to} onChange={(e) => setRule({ ...rule, to: e.target.value })} />
        <button
          type="button"
          disabled={!valid(rule.from) || !valid(rule.to)}
          className="rounded-lg bg-[#0071e3] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
          onClick={() => {
            set(`${rule.from.trim().replace(/\*$/, "")}*`, `${rule.to.trim().replace(/\*$/, "")}*`);
            setRule({ from: "", to: "" });
          }}
        >
          Tilføj regel
        </button>
        <p className="text-[11px] leading-snug text-[#8e8e93]">Resten af adressen bliver hængende: med reglen ovenfor bliver …/produkt/42 til …/en/produkt/42. En adresse skrevet ud for et link vinder over reglen.</p>
      </div>
    </Group>
  );
}
