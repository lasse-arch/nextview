"use client";

import type { FindButtonPlace, TourConfig } from "../../tours/types";
import { BentoEditor } from "./bento-editor";
import { Choice, Field, Group, Toggle, input } from "./ui";

/*
 * "Layout": the one place a tour's look is chosen, in the order it is made -
 * 1. how the tour starts, 2. the menu, 3. where things sit on a computer and
 * on a phone. These were spread over Design (the templates), Start ("Når
 * touren åbner"), Menu ("Menuens udseende"), Sprog and Funktioner; they now
 * live here only. The texts and pictures of the start stay under Start, the
 * menu's items under Menu. Writes exactly the fields it always did, so
 * existing tours look the same.
 */

type Edit = (fn: (draft: TourConfig) => void) => void;
type StartStyle = "none" | "tiles" | "simple" | "cover";

const STARTS: [StartStyle, string, string][] = [
  ["cover", "Forside med foto", "Et stort foto af stedet med en knap ind og stederne at vælge imellem - premium, og fortsætter hjemmesidens fortælling."],
  ["tiles", "Velkomst med fliser", "En kort velkomst med fliser til de vigtigste steder. Godt når der er få, tydelige valg."],
  ["simple", "Helt enkel", "Få store knapper under hinanden - intet andet. Til gæster, der skal have det helt roligt (fx specialskoler). Hold det til 2-3 knapper."],
  ["none", "Direkte i touren", "Touren starter med det samme - godt når folk kommer fra en knap på hjemmesiden, der allerede har fortalt historien."],
];

const MENUS: [NonNullable<TourConfig["design"]>["menu"], string, string][] = [
  ["side", "Sidemenu", "En menu i siden med grupper - til mange rum."],
  ["dock", "Bar i bunden", "Stederne, rundvisningen og hovedknappen i en bar nederst."],
  ["bento", "Fliser", "Menuen som store billedfliser."],
  ["simple", "Helt enkel", "Én knap med én liste - intet andet."],
  ["picker", "Rumvælger", "Vælg størrelse og rum i bunden. Kun til få kunder (fx depotrum)."],
];

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0071e3] text-[12px] font-bold text-white">{n}</span>
        <h3 className="text-[15px] font-semibold text-[#1d1d1f]">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Cards<T extends string>({ value, options, onChange }: { value: T; options: [T, string, string][]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {options.map(([v, name, what]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`rounded-xl px-3 py-2.5 text-left ring-1 ${value === v ? "bg-[#0071e3] text-white ring-[#0071e3]" : "bg-white text-[#1d1d1f] ring-black/[.06] hover:bg-[#f2f2f7]"}`}
        >
          <span className="block text-[14px] font-semibold">{name}</span>
          <span className={`block text-[12px] leading-snug ${value === v ? "text-white/85" : "text-[#8e8e93]"}`}>{what}</span>
        </button>
      ))}
    </div>
  );
}

export function LayoutEditor({ config, edit, onTab }: { config: TourConfig; edit: Edit; /** Jump to the tab where the texts/items are edited. */ onTab: (tab: "start" | "menu" | "sprog" | "funktioner") => void }) {
  const style: StartStyle = config.design?.welcome === "cover" ? "cover" : config.welcome ? (config.design?.welcome === "simple" ? "simple" : "tiles") : "none";
  const menuStyle = config.design?.menu ?? "side";
  const langs = (config.languages ?? []).filter((l) => l !== "da");
  const more = "px-1 text-left text-[13px] font-medium text-[#0071e3] hover:underline";

  return (
    <div className="space-y-6">
      <p className="px-1 text-[12px] leading-snug text-[#8e8e93]">Her vælges, hvordan touren ser ud - i den rækkefølge, den bygges: hvordan den starter, menuen og hvor tingene sidder. Det hele kan ses med det samme i forhåndsvisningen.</p>

      <Step n={1} title="Sådan starter touren">
        <Group>
          <Cards
            value={style}
            options={STARTS}
            onChange={(v) =>
              edit((d) => {
                if (v === "none") {
                  d.welcome = undefined;
                  d.design = { ...d.design, welcome: "tiles", menu: menuStyle };
                } else if (v === "tiles" || v === "simple") {
                  d.welcome ??= { kicker: d.brand, title: `Velkommen til ${d.brand}`, lead: "Tag en tur rundt - eller hop direkte derhen, du vil se.", tiles: [], skip: "Jeg kigger selv rundt" };
                  d.design = { ...d.design, welcome: v, menu: menuStyle };
                } else {
                  d.cover ??= { kicker: d.subtitle ?? d.brand, title: `Velkommen til ${d.brand}`, lead: "Kig indenfor før du kommer.", image: d.places?.[0]?.image ?? d.logo, enter: "Træd indenfor", placesTitle: "Vælg hvor du vil starte" };
                  d.design = { ...d.design, welcome: "cover", menu: menuStyle };
                }
              })
            }
          />
          {style !== "none" && (
            <button type="button" className={more} onClick={() => onTab("start")}>
              Tekster, billeder og fliser under Start →
            </button>
          )}
        </Group>
      </Step>

      <Step n={2} title="Menuen">
        <Group>
          <Cards value={menuStyle} options={MENUS} onChange={(v) => edit((d) => void (d.design = { ...d.design, welcome: d.design?.welcome ?? "tiles", menu: v }))} />
          {menuStyle === "bento" && <BentoEditor config={config} edit={edit} />}
          {menuStyle === "picker" && (
            <Field title="Når man vælger en størrelse, start i" hint="Findes rummet ikke i en størrelse, starter den i størrelsens første">
              <select
                className={input}
                value={config.design?.first ?? ""}
                onChange={(e) => edit((d) => void (d.design = { welcome: d.design?.welcome ?? "tiles", menu: d.design?.menu ?? "picker", first: e.target.value || undefined }))}
              >
                <option value="">Det første i hver størrelse</option>
                {[...new Set(config.menu.flatMap((m) => ("items" in m ? m.items.map((i) => i[0]) : [])))].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Toggle on={config.menuOpenOnStart.desktop} onChange={(on) => edit((d) => void (d.menuOpenOnStart.desktop = on))} title="Menu åben på computer" />
          <Toggle on={config.menuOpenOnStart.mobile} onChange={(on) => edit((d) => void (d.menuOpenOnStart.mobile = on))} title="Menu åben på mobil" />
          <Toggle
            on={config.menuDim !== false}
            onChange={(on) => edit((d) => void (d.menuDim = on ? undefined : false))}
            title="Dæmp touren bag menuen"
            hint="Touren bliver lidt mørkere, når menuen er åben, og et tryk på den lukker menuen. Fra: touren står klar og kan bruges, mens menuen er åben."
          />
          <button type="button" className={more} onClick={() => onTab("menu")}>
            Menupunkter og grupper under Menu →
          </button>
        </Group>
      </Step>

      <Step n={3} title="Placering på computer og mobil">
        <Group>
          <Field title="Logoet sidder til - menuen tager den anden side">
            <Choice
              value={config.logoSide ?? "left"}
              options={[
                ["left", "Venstre"],
                ["right", "Højre"],
              ]}
              onChange={(v) => edit((d) => void (d.logoSide = v === "right" ? "right" : undefined))}
            />
          </Field>
          <Field title="Vis hvor menuen er" hint={config.menuHint ? "Lige efter man er gået ind: en pil og en blinkende ring om menuen i et par sekunder (én gang pr. besøg). Prøv den på Mobil i forhåndsvisningen." : "Ingen pil - som i dag."}>
            <Choice<"off" | "mobile" | "all">
              value={config.menuHint ?? "off"}
              options={[
                ["off", "Fra"],
                ["mobile", "På mobil"],
                ["all", "Mobil og computer"],
              ]}
              onChange={(v) => edit((d) => void (d.menuHint = v === "off" ? undefined : v))}
            />
          </Field>
          {langs.length > 0 &&
            (["desktop", "mobile"] as const).map((device) => (
              <Field key={`lang-${device}`} title={`Skift sprog - ${device === "desktop" ? "computer" : "mobil"}`} hint={device === "mobile" ? "I menuen: øverst i sidemenuen (andre menuer får knappen ved menuknappen). Skjult: kun med et link, fx ?sprog=en." : undefined}>
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
              </Field>
            ))}
          {config.wayfinding &&
            (["desktop", "mobile"] as const).map((dev) => (
              <Field key={`find-${dev}`} title={`Find vej-knappen - ${dev === "desktop" ? "computer" : "mobil"}`} hint={config.wayfinding?.button?.[dev] === "menu" ? 'Ingen knap - læg "Find vej" i menuen med linket #findvej.' : undefined}>
                <select
                  className={input}
                  value={config.wayfinding?.button?.[dev] ?? "std"}
                  onChange={(e) =>
                    edit((d) => {
                      const v = e.target.value as FindButtonPlace | "std";
                      const b = { ...d.wayfinding?.button, [dev]: v === "std" ? undefined : v };
                      if (!b[dev]) delete b[dev];
                      d.wayfinding = { ...d.wayfinding, button: Object.keys(b).length ? b : undefined };
                    })
                  }
                >
                  {(
                    [
                      ["std", dev === "desktop" ? "Øverst i midten (standard)" : "Nederst til højre (standard)"],
                      ...(dev === "desktop" ? ([["bottom-left", "Nederst til venstre"], ["bottom-right", "Nederst til højre"]] as const) : ([["top", "Øverst i midten"], ["bottom-left", "Nederst til venstre"]] as const)),
                      ["under-menu", "Under menuknappen"],
                      ...(config.live ? ([["under-live", "Under live data"]] as const) : []),
                      ["menu", "Ingen knap - kun i menuen"],
                    ] as [string, string][]
                  ).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
        </Group>
      </Step>
    </div>
  );
}
