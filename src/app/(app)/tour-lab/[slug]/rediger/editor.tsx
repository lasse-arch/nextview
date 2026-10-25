"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { restoreTourVersion, saveTour, searchDeals, setTourDeal } from "@/lib/actions/tours";
import type { LinkOpen, MenuEntry, TourConfig } from "../../tours/types";

type Version = { id: string; note: string | null; by: string | null; at: string };
type Tab = "generelt" | "design" | "menu" | "funktioner" | "links" | "avanceret" | "versioner";

/** The sections, with a small icon each (SF Symbols-like, drawn with strokes). */
const TABS: [Tab, string, string][] = [
  ["generelt", "Generelt", '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>'],
  ["design", "Design", '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A4.7 4.7 0 0 0 21 9.7C21 5.9 17 3 12 3z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15.5" cy="8" r="1"/>'],
  ["menu", "Menu", '<path d="M4 6h16M4 12h16M4 18h10"/>'],
  ["funktioner", "Funktioner", '<path d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.4 7.2 18l.9-5.4L4.2 8.7l5.4-.8z"/>'],
  ["links", "Knapper og links", '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>'],
  ["avanceret", "Avanceret", '<path d="M8 6l-5 6 5 6M16 6l5 6-5 6"/>'],
  ["versioner", "Versioner", '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],
];

const input =
  "w-full rounded-[10px] border-0 bg-[#f2f2f7] px-3 py-2 text-[15px] text-[#1d1d1f] placeholder:text-[#8e8e93] transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0071e3]";
const label = "block text-[13px] font-medium text-[#6e6e73]";
const when = (iso: string) => new Date(iso).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Icon({ d, className = "h-[18px] w-[18px]" }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} dangerouslySetInnerHTML={{ __html: d }} />;
}

/** A white, rounded group of settings - like a section in the iPhone's Settings. */
function Group({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section>
      {title && <h3 className="mb-1.5 px-1 text-[13px] font-medium uppercase tracking-wide text-[#6e6e73]">{title}</h3>}
      <div className="space-y-4 rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,.04)] ring-1 ring-black/[.04]">{children}</div>
    </section>
  );
}

function Field({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className={label}>{title}</span>
      {children}
      {hint && <p className="text-[12px] leading-snug text-[#8e8e93]">{hint}</p>}
    </div>
  );
}

/** An iOS-style switch with its label on the left. */
function Toggle({ on, onChange, title, hint }: { on: boolean; onChange: (on: boolean) => void; title: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span>
        <span className="block text-[15px] text-[#1d1d1f]">{title}</span>
        {hint && <span className="block text-[12px] leading-snug text-[#8e8e93]">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={title}
        onClick={() => onChange(!on)}
        className={`relative h-[31px] w-[51px] flex-none rounded-full transition-colors duration-200 ${on ? "bg-[#34c759]" : "bg-[#e9e9eb]"}`}
      >
        <span className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,.15),0_1px_1px_rgba(0,0,0,.16)] transition-all duration-200 ${on ? "left-[22px]" : "left-[2px]"}`} />
      </button>
    </div>
  );
}

/** A segmented control. */
function Choice<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-[9px] bg-[#e9e9eb] p-[2px]">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`flex-1 rounded-[7px] px-3 py-[5px] text-[13px] font-medium transition ${v === value ? "bg-white text-[#1d1d1f] shadow-[0_3px_8px_rgba(0,0,0,.12),0_3px_1px_rgba(0,0,0,.04)]" : "text-[#1d1d1f]/70 hover:text-[#1d1d1f]"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** Starting points when a tour switches to a welcome/menu it has no content for yet. */
const DEFAULT_WELCOME = (T: TourConfig): NonNullable<TourConfig["welcome"]> => ({
  kicker: T.brand,
  title: `Velkommen til ${T.brand}`,
  lead: "Tag en tur rundt - eller hop direkte derhen, du vil se.",
  tiles: [],
  skip: "Jeg kigger selv rundt",
});
const DEFAULT_COVER = (T: TourConfig): NonNullable<TourConfig["cover"]> => ({
  kicker: T.subtitle ?? T.brand,
  title: `Velkommen til ${T.brand}`,
  lead: "Kig indenfor før du kommer.",
  image: T.logo,
  enter: "Træd indenfor",
  placesTitle: "Vælg hvor du vil starte",
});

export function TourEditor({ slug, initial, deal, versions }: { slug: string; initial: TourConfig; deal: { id: string; name: string } | null; versions: Version[] }) {
  const router = useRouter();
  const [config, setConfig] = useState<TourConfig>(initial);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<Tab>("generelt");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [device, setDevice] = useState<"computer" | "mobil">("computer");
  const [previewKey, setPreviewKey] = useState(0);
  const [pending, start] = useTransition();
  const [json, setJson] = useState<string | null>(null);

  /** Changes the draft (a copy - the saved tour is untouched until "Gem"). */
  function edit(fn: (draft: TourConfig) => void) {
    setConfig((c) => {
      const next = structuredClone(c);
      fn(next);
      return next;
    });
    setDirty(true);
    setMsg(null);
  }

  function save() {
    start(async () => {
      const r = await saveTour(slug, config, note);
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setDirty(false);
      setNote("");
      setMsg({ ok: true, text: "Gemt" });
      setTimeout(() => setMsg(null), 2500);
      setPreviewKey((k) => k + 1);
      router.refresh();
    });
  }

  const welcomeStyle = config.design?.welcome === "cover" ? "cover" : config.welcome ? "tiles" : "none";
  const menuStyle = config.design?.menu ?? "side";

  return (
    <div
      className="-mx-4 -mb-4 flex h-[calc(100vh-6rem)] flex-col overflow-hidden rounded-t-2xl bg-[#f5f5f7] text-[#1d1d1f] sm:-mx-6 sm:-mb-6 lg:-mx-8 lg:-mb-8"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-black/[.06] bg-white/80 px-5 py-3 backdrop-blur-xl">
        <Link href="/tour-lab" className="flex items-center gap-1 text-[15px] text-[#0071e3] hover:opacity-80">
          <Icon d='<path d="M15 5l-7 7 7 7"/>' className="h-4 w-4" />
          Tours
        </Link>
        <div className="mx-auto text-center">
          <h1 className="text-[15px] font-semibold tracking-tight">{config.title}</h1>
          <p className="text-[12px] text-[#8e8e93]">{dirty ? "Ændringer ikke gemt" : `Gemt · ${versions[0] ? when(versions[0].at) : ""}`}</p>
        </div>
        <a href={`/tour-lab/${slug}`} target="_blank" rel="noopener" className="rounded-full bg-[#f2f2f7] px-3.5 py-1.5 text-[13px] font-medium hover:bg-[#e9e9eb]">
          Åbn tour ↗
        </a>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Sections */}
        <nav className="flex w-[210px] flex-none flex-col gap-0.5 p-3">
          {TABS.map(([t, text, icon]) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex items-center gap-2.5 rounded-[9px] px-2.5 py-[7px] text-left text-[14px] transition ${tab === t ? "bg-white font-medium shadow-[0_1px_3px_rgba(0,0,0,.08)]" : "text-[#1d1d1f]/80 hover:bg-black/[.04]"}`}
            >
              <span className={`flex h-7 w-7 items-center justify-center rounded-[7px] ${tab === t ? "bg-[#0071e3] text-white" : "bg-white text-[#6e6e73] ring-1 ring-black/[.06]"}`}>
                <Icon d={icon} className="h-4 w-4" />
              </span>
              {text}
            </button>
          ))}
        </nav>

        {/* Settings */}
        <div className="flex w-[400px] flex-none flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-2 pb-28 pt-3">
            {tab === "generelt" && (
              <>
                <Group title="Tour">
                <Field title="Navn">
                  <input className={input} value={config.title} onChange={(e) => edit((d) => void (d.title = e.target.value))} />
                </Field>
                <DealPicker slug={slug} initial={deal} />
                </Group>
                <Group title="I touren">
                <Field title="Firmanavn i touren">
                  <input className={input} value={config.brand} onChange={(e) => edit((d) => void (d.brand = e.target.value))} />
                </Field>
                <Field title="Undertitel">
                  <input className={input} value={config.subtitle ?? ""} onChange={(e) => edit((d) => void (d.subtitle = e.target.value || undefined))} />
                </Field>
                </Group>
                <Group title="Matterport">
                <Field title="Matterport-touren (MPSkins-link)" hint="Touren henter scanpunkter og skjulte punkter herfra.">
                  <input className={input} value={config.tourPage} onChange={(e) => edit((d) => void (d.tourPage = e.target.value))} />
                </Field>
                <Field title="Start" hint='Et U-link eller et udsyn kopieret med "Kopiér dette udsyn" i touren.'>
                  <input className={input} value={config.start} onChange={(e) => edit((d) => void (d.start = e.target.value))} />
                </Field>
                </Group>
              </>
            )}

            {tab === "design" && (
              <>
                <Group title="Opbygning">
                <Field title="Velkomst">
                  <Choice
                    value={welcomeStyle}
                    options={[
                      ["none", "Ingen"],
                      ["tiles", "Fliser"],
                      ["cover", "Forside"],
                    ]}
                    onChange={(v) =>
                      edit((d) => {
                        if (v === "none") {
                          d.welcome = undefined;
                          d.design = { welcome: "tiles", menu: menuStyle };
                        } else if (v === "tiles") {
                          d.welcome ??= DEFAULT_WELCOME(d);
                          d.design = { welcome: "tiles", menu: menuStyle };
                        } else {
                          d.cover ??= DEFAULT_COVER(d);
                          d.design = { welcome: "cover", menu: menuStyle };
                        }
                      })
                    }
                  />
                </Field>
                <Field title="Menu">
                  <Choice
                    value={menuStyle}
                    options={[
                      ["side", "Sidemenu"],
                      ["dock", "Bar i bunden"],
                      ["picker", "Rumvælger"],
                    ]}
                    onChange={(v) => edit((d) => void (d.design = { welcome: d.design?.welcome ?? "tiles", menu: v }))}
                  />
                </Field>
                </Group>
                <Group title="Farver og skrift">
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      ["main", "Hovedfarve"],
                      ["accent", "Accent"],
                      ["accentDark", "Accent, mørk"],
                      ["soft", "Baggrund, lys"],
                    ] as const
                  ).map(([k, text]) => (
                    <Field key={k} title={text}>
                      <div className="flex items-center gap-2">
                        <input type="color" className="h-9 w-9 flex-none cursor-pointer appearance-none overflow-hidden rounded-full border-0 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-black/10" value={config.colors[k]} onChange={(e) => edit((d) => void (d.colors[k] = e.target.value))} />
                        <input className={input} value={config.colors[k]} onChange={(e) => edit((d) => void (d.colors[k] = e.target.value))} />
                      </div>
                    </Field>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field title="Skrift" hint="Navn på en Google-skrift">
                    <input className={input} value={config.font} onChange={(e) => edit((d) => void (d.font = e.target.value))} />
                  </Field>
                  <Field title="Skrift til overskrifter">
                    <input className={input} value={config.fontHeading ?? ""} placeholder="Samme" onChange={(e) => edit((d) => void (d.fontHeading = e.target.value || undefined))} />
                  </Field>
                </div>
                </Group>
                <Group title="Logo">
                <Field title="Logo (adresse)">
                  <input className={input} value={config.logo} onChange={(e) => edit((d) => void (d.logo = e.target.value))} />
                </Field>
                <Field title={`Logostørrelse: ${config.logoSize ?? 46} px`}>
                  <input type="range" min={28} max={120} className="w-full accent-[#0071e3]" value={config.logoSize ?? 46} onChange={(e) => edit((d) => void (d.logoSize = Number(e.target.value)))} />
                </Field>
                <Toggle on={Boolean(config.logoOnLight)} onChange={(on) => edit((d) => void (d.logoOnLight = on))} title="Mørkt logo" hint="Logoet får et lyst kort bag sig, så det kan læses på alle vægge." />
                </Group>
              </>
            )}

            {tab === "menu" && <MenuEditor menu={config.menu} onChange={(menu) => edit((d) => void (d.menu = menu))} />}

            {tab === "funktioner" && (
              <>
                <Group title="Navigation">
                <Field title="Bevægelse">
                  <Choice
                    value={config.navigation}
                    options={[
                      ["free", "Fri gang"],
                      ["points", "Kun menuens steder"],
                    ]}
                    onChange={(v) => edit((d) => void (d.navigation = v))}
                  />
                </Field>
                <Field title="Skift mellem steder">
                  <Choice
                    value={config.jump ?? "fly"}
                    options={[
                      ["fly", "Flyv"],
                      ["instant", "Skift direkte"],
                      ["fade", "Overblænding"],
                    ]}
                    onChange={(v) => edit((d) => void (d.jump = v))}
                  />
                </Field>
                </Group>
                <Group title="Menu og historier">
                  <Toggle on={config.menuOpenOnStart.desktop} onChange={(on) => edit((d) => void (d.menuOpenOnStart.desktop = on))} title="Menu åben på computer" />
                  <Toggle on={config.menuOpenOnStart.mobile} onChange={(on) => edit((d) => void (d.menuOpenOnStart.mobile = on))} title="Menu åben på mobil" />
                <Toggle
                  on={Boolean(config.stories?.mobile)}
                  onChange={(on) => edit((d) => void (d.stories = { mobile: on, desktop: d.stories?.desktop ?? false, rooms: d.stories?.rooms }))}
                  title="Historier på mobil"
                  hint="Rummene som kort nederst, som Instagram-stories."
                />
                <Toggle
                  on={Boolean(config.stories?.desktop)}
                  onChange={(on) => edit((d) => void (d.stories = { mobile: d.stories?.mobile ?? false, desktop: on, rooms: d.stories?.rooms }))}
                  title="Historier på computer"
                />
                </Group>
                <Group title="Ekstra">
                <Toggle on={Boolean(config.wayfinding)} onChange={(on) => edit((d) => void (d.wayfinding = on ? d.wayfinding ?? {} : undefined))} title="Find vej" hint="Vælg et rum, og touren går vejen derhen fra der, man står." />
                <Toggle on={Boolean(config.measure)} onChange={(on) => edit((d) => void (d.measure = on || undefined))} title="Vis mål" hint="En knap, der viser Matterports mål i rummet." />
                <Toggle on={Boolean(config.matterportUi)} onChange={(on) => edit((d) => void (d.matterportUi = on || undefined))} title="Behold Matterports egne knapper" hint="Normalt skjult - tourens egne knapper er brugerfladen." />
                </Group>
                <p className="px-1 text-[12px] leading-snug text-[#8e8e93]">
                  Vis mig rundt ({config.guide?.stops.length ?? 0} stop), infopunkter ({config.info?.length ?? 0}) og steder ({config.places?.length ?? 0}) redigeres under Avanceret indtil videre.
                </p>
              </>
            )}

            {tab === "links" && (
              <>
                <Group title="Åbning">
                <Field title="Links åbner som standard">
                  <Choice
                    value={config.linkOpen?.default ?? "tab"}
                    options={[
                      ["popup", "Popup over touren"],
                      ["tab", "Ny fane"],
                      ["same", "Samme fane"],
                    ]}
                    onChange={(v: LinkOpen) => edit((d) => void (d.linkOpen = { default: v, byUrl: d.linkOpen?.byUrl }))}
                  />
                </Field>
                </Group>
                <Group title="Knapper">
                <CtaEditor cta={config.cta} onChange={(cta) => edit((d) => void (d.cta = cta))} />
                </Group>
                <Group title="Kontakt">
                <Field title="Vises i menuen">
                  <div className="space-y-2">
                    {(
                      [
                        ["phone", "Telefon"],
                        ["email", "E-mail"],
                        ["address", "Adresse"],
                        ["mapUrl", "Link til kort"],
                        ["instagram", "Instagram"],
                      ] as const
                    ).map(([k, text]) => (
                      <input
                        key={k}
                        className={input}
                        placeholder={text}
                        value={config.contact?.[k] ?? ""}
                        onChange={(e) => edit((d) => void (d.contact = { ...d.contact, [k]: e.target.value || undefined }))}
                      />
                    ))}
                  </div>
                </Field>
                </Group>
              </>
            )}

            {tab === "avanceret" && (
              <>
                <p className="px-1 text-[13px] leading-snug text-[#6e6e73]">Hele opsætningen. Ret direkte her for alt det, der endnu ikke har sine egne felter (velkomstens fliser, punkter, steder, guidet tur, infopunkter…).</p>
                <textarea
                  className="h-[60vh] w-full rounded-2xl border-0 bg-[#1d1d1f] p-4 font-mono text-[11.5px] leading-relaxed text-[#f5f5f7] shadow-inner outline-none focus:ring-2 focus:ring-[#0071e3]"
                  spellCheck={false}
                  value={json ?? JSON.stringify(config, null, 2)}
                  onChange={(e) => setJson(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={json == null}
                    className="rounded-full bg-[#0071e3] px-4 py-1.5 text-[14px] font-medium text-white disabled:opacity-40"
                    onClick={() => {
                      try {
                        const parsed = JSON.parse(json!) as TourConfig;
                        setConfig(parsed);
                        setDirty(true);
                        setJson(null);
                        setMsg({ ok: true, text: "Anvendt - husk at gemme." });
                      } catch (err) {
                        setMsg({ ok: false, text: `Ikke gyldig JSON: ${err instanceof Error ? err.message : err}` });
                      }
                    }}
                  >
                    Anvend
                  </button>
                  {json != null && (
                    <button type="button" className="rounded-full px-4 py-1.5 text-[14px] text-[#0071e3] hover:bg-[#0071e3]/10" onClick={() => setJson(null)}>
                      Fortryd
                    </button>
                  )}
                </div>
              </>
            )}

            {tab === "versioner" && (
              <ul className="divide-y divide-black/[.06] overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(0,0,0,.04)] ring-1 ring-black/[.04]">
                {versions.map((v, i) => (
                  <li key={v.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div>
                      <div className="text-[15px] text-[#1d1d1f]">
                        {when(v.at)} {i === 0 && <span className="ml-1 rounded-full bg-[#34c759]/15 px-2 py-0.5 text-[11px] font-medium text-[#248a3d]">Nuværende</span>}
                      </div>
                      <div className="text-[12px] text-[#8e8e93]">
                        {v.by ?? "Ukendt"}
                        {v.note ? ` · ${v.note}` : ""}
                      </div>
                    </div>
                    {i > 0 && (
                      <button
                        type="button"
                        disabled={pending}
                        className="flex-none rounded-full bg-[#f2f2f7] px-3 py-1 text-[13px] font-medium text-[#0071e3] hover:bg-[#e8e8ed]"
                        onClick={() =>
                          start(async () => {
                            if (dirty && !confirm("Du har ændringer, der ikke er gemt. Gendan alligevel?")) return;
                            const r = await restoreTourVersion(v.id);
                            if (!r.ok) return setMsg({ ok: false, text: r.error });
                            setMsg({ ok: true, text: "Versionen er gendannet." });
                            setDirty(false);
                            setPreviewKey((k) => k + 1);
                            router.refresh();
                            window.location.reload();
                          })
                        }
                      >
                        Gendan
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Preview */}
        <div className="flex min-w-0 flex-1 flex-col p-3 pl-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="w-56">
              <Choice
                value={device}
                options={[
                  ["computer", "Computer"],
                  ["mobil", "Mobil"],
                ]}
                onChange={setDevice}
              />
            </div>
            <span className="text-[12px] text-[#8e8e93]">{dirty ? "Viser den gemte version - gem for at se dine ændringer." : "Viser den gemte version."}</span>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center">
            {device === "computer" ? (
              <div className="flex h-full w-full flex-col overflow-hidden rounded-xl bg-white shadow-[0_20px_50px_rgba(0,0,0,.15)] ring-1 ring-black/10">
                <div className="flex items-center gap-1.5 border-b border-black/[.06] bg-[#f6f6f6] px-3 py-2">
                  <i className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                  <i className="h-3 w-3 rounded-full bg-[#febc2e]" />
                  <i className="h-3 w-3 rounded-full bg-[#28c840]" />
                  <span className="mx-auto rounded-md bg-white px-3 py-0.5 text-[11px] text-[#8e8e93] ring-1 ring-black/[.06]">explore.nextview360.dk/{slug}</span>
                </div>
                <iframe key={previewKey} title="Forhåndsvisning" src={`/tour-lab/${slug}`} className="min-h-0 w-full flex-1 bg-black" allow="fullscreen; xr-spatial-tracking; autoplay; clipboard-write" />
              </div>
            ) : (
              <div className="relative h-full max-h-[860px] w-[min(410px,100%)] rounded-[54px] bg-[#1d1d1f] p-[12px] shadow-[0_30px_60px_rgba(0,0,0,.3)]">
                <span className="absolute left-1/2 top-[22px] z-10 h-[28px] w-[100px] -translate-x-1/2 rounded-full bg-black" />
                <iframe key={previewKey} title="Forhåndsvisning" src={`/tour-lab/${slug}`} className="h-full w-full rounded-[42px] bg-black" allow="fullscreen; xr-spatial-tracking; autoplay; clipboard-write" />
              </div>
            )}
          </div>
        </div>

        {/* Save bar - only when there's something to save */}
        {(dirty || msg) && (
          <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center">
            <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-[#1d1d1f]/90 py-2 pl-5 pr-2 text-white shadow-[0_12px_40px_rgba(0,0,0,.3)] backdrop-blur-xl">
              {msg && !dirty ? (
                <span className={`pr-3 text-[14px] ${msg.ok ? "" : "text-[#ff6961]"}`}>{msg.ok ? "✓ " : ""}{msg.text}</span>
              ) : (
                <>
                  <span className="text-[14px] font-medium">Ikke gemte ændringer</span>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Hvad har du ændret?"
                    className="w-56 rounded-full border-0 bg-white/10 px-3 py-1.5 text-[13px] text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setConfig(initial);
                      setDirty(false);
                      setMsg(null);
                    }}
                    className="rounded-full px-3 py-1.5 text-[14px] text-white/80 hover:text-white"
                  >
                    Fortryd
                  </button>
                  <button type="button" onClick={save} disabled={pending} className="rounded-full bg-[#0071e3] px-5 py-1.5 text-[14px] font-semibold hover:bg-[#0077ed] disabled:opacity-50">
                    {pending ? "Gemmer…" : "Gem"}
                  </button>
                </>
              )}
              {msg && !msg.ok && dirty && <span className="pr-3 text-[13px] text-[#ff6961]">{msg.text}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DealPicker({ slug, initial }: { slug: string; initial: { id: string; name: string } | null }) {
  const [deal, setDeal] = useState(initial);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; companyName: string; displayName: string | null }[]>([]);
  const [, start] = useTransition();
  const pick = (d: { id: string; name: string } | null) =>
    start(async () => {
      await setTourDeal(slug, d?.id ?? null);
      setDeal(d);
      setQ("");
      setHits([]);
    });
  return (
    <Field title="Kunde">
      {deal ? (
        <div className="flex items-center justify-between rounded-[10px] bg-[#f2f2f7] px-3 py-2 text-[15px]">
          <Link href={`/deals/${deal.id}`} className="font-medium text-[#0071e3] hover:underline">
            {deal.name}
          </Link>
          <button type="button" className="text-[13px] text-[#ff3b30]" onClick={() => pick(null)}>
            Fjern
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            className={input}
            placeholder="Søg kunde…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              const query = e.target.value;
              start(async () => setHits(await searchDeals(query)));
            }}
          />
          {hits.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl bg-white/95 py-1 shadow-[0_10px_30px_rgba(0,0,0,.15)] ring-1 ring-black/[.06] backdrop-blur">
              {hits.map((h) => (
                <li key={h.id}>
                  <button type="button" className="w-full px-3 py-1.5 text-left text-sm hover:bg-[#0071e3] hover:text-white" onClick={() => pick({ id: h.id, name: h.displayName ?? h.companyName })}>
                    {h.displayName ?? h.companyName}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Field>
  );
}

function MenuEditor({ menu, onChange }: { menu: MenuEntry[]; onChange: (m: MenuEntry[]) => void }) {
  const set = (i: number, m: MenuEntry) => onChange(menu.map((x, j) => (j === i ? m : x)));
  const move = (i: number, by: number) => {
    const next = [...menu];
    const [m] = next.splice(i, 1);
    next.splice(Math.max(0, Math.min(next.length, i + by)), 0, m);
    onChange(next);
  };
  return (
    <div className="space-y-3">
      <p className="px-1 text-[12px] leading-snug text-[#8e8e93]">Links kan være U-links fra Matterport, MPSkins-links eller udsyn kopieret i touren. Links til andre sider åbner som knapper.</p>
      {menu.map((m, i) => (
        <div key={i} className="rounded-2xl bg-white p-3.5 shadow-[0_1px_2px_rgba(0,0,0,.04)] ring-1 ring-black/[.04]">
          <div className="flex items-center gap-2">
            <input className={input} value={m.title} onChange={(e) => set(i, { ...m, title: e.target.value })} />
            <button type="button" className="text-[#c7c7cc] hover:text-[#1d1d1f]" onClick={() => move(i, -1)} aria-label="Op">
              ↑
            </button>
            <button type="button" className="text-[#c7c7cc] hover:text-[#1d1d1f]" onClick={() => move(i, 1)} aria-label="Ned">
              ↓
            </button>
            <button type="button" className="text-[#c7c7cc] hover:text-[#ff3b30]" onClick={() => onChange(menu.filter((_, j) => j !== i))} aria-label="Slet">
              ×
            </button>
          </div>
          {"items" in m ? (
            <div className="mt-2 space-y-1.5 pl-3">
              {m.items.map(([name, href], k) => (
                <div key={k} className="flex gap-1.5">
                  <input className={`${input} w-2/5`} value={name} onChange={(e) => set(i, { ...m, items: m.items.map((it, n) => (n === k ? [e.target.value, it[1]] : it)) })} />
                  <input className={input} value={href} placeholder="Link" onChange={(e) => set(i, { ...m, items: m.items.map((it, n) => (n === k ? [it[0], e.target.value] : it)) })} />
                  <button type="button" className="text-[#c7c7cc] hover:text-[#ff3b30]" onClick={() => set(i, { ...m, items: m.items.filter((_, n) => n !== k) })} aria-label="Slet">
                    ×
                  </button>
                </div>
              ))}
              <button type="button" className="text-xs font-medium text-[#0071e3]" onClick={() => set(i, { ...m, items: [...m.items, ["Nyt sted", ""]] })}>
                + Tilføj sted
              </button>
            </div>
          ) : (
            <input className={`${input} mt-2`} value={m.href} placeholder="Link" onChange={(e) => set(i, { ...m, href: e.target.value })} />
          )}
        </div>
      ))}
      <div className="flex gap-3 text-sm">
        <button type="button" className="font-medium text-[#0071e3]" onClick={() => onChange([...menu, { title: "Ny gruppe", items: [] }])}>
          + Gruppe
        </button>
        <button type="button" className="font-medium text-[#0071e3]" onClick={() => onChange([...menu, { title: "Nyt sted", href: "" }])}>
          + Enkelt sted
        </button>
      </div>
    </div>
  );
}

function CtaEditor({ cta, onChange }: { cta: TourConfig["cta"]; onChange: (c: TourConfig["cta"]) => void }) {
  return (
    <Field title="Knapper (fx Book, Kontakt)">
      <div className="space-y-2">
        {cta.map((c, i) => (
          <div key={i} className="space-y-1.5 rounded-xl bg-[#f2f2f7]/60 p-2.5">
            <div className="flex gap-1.5">
              <input className={input} value={c.label} placeholder="Tekst" onChange={(e) => onChange(cta.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <button type="button" className="text-[#c7c7cc] hover:text-[#ff3b30]" onClick={() => onChange(cta.filter((_, j) => j !== i))} aria-label="Slet">
                ×
              </button>
            </div>
            <input className={input} value={c.href} placeholder="https://…" onChange={(e) => onChange(cta.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)))} />
            <label className="flex items-center gap-2 text-[13px] text-[#1d1d1f]">
              <input type="checkbox" className="accent-[#0071e3]" checked={c.primary} onChange={(e) => onChange(cta.map((x, j) => (j === i ? { ...x, primary: e.target.checked } : x)))} />
              Hovedknap (fremhævet)
            </label>
          </div>
        ))}
        <button type="button" className="text-sm font-medium text-[#0071e3]" onClick={() => onChange([...cta, { label: "Ny knap", href: "", primary: cta.length === 0 }])}>
          + Knap
        </button>
      </div>
    </Field>
  );
}
