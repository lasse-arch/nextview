"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { restoreTourVersion, saveTour, searchDeals, setTourDeal } from "@/lib/actions/tours";
import type { LinkOpen, MenuEntry, TourConfig } from "../../tours/types";

type Version = { id: string; note: string | null; by: string | null; at: string };
type Tab = "generelt" | "design" | "menu" | "funktioner" | "links" | "avanceret" | "versioner";

const TABS: [Tab, string][] = [
  ["generelt", "Generelt"],
  ["design", "Design"],
  ["menu", "Menu"],
  ["funktioner", "Funktioner"],
  ["links", "Knapper og links"],
  ["avanceret", "Avanceret"],
  ["versioner", "Versioner"],
];

const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none";
const label = "block text-xs font-semibold uppercase tracking-wide text-slate-500";
const when = (iso: string) => new Date(iso).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Field({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className={label}>{title}</span>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function Toggle({ on, onChange, title, hint }: { on: boolean; onChange: (on: boolean) => void; title: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-indigo-600" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm font-medium text-slate-800">{title}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

function Choice<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-lg border px-3 py-1.5 text-sm ${v === value ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}
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
      setMsg({ ok: true, text: "Gemt - forhåndsvisningen viser nu den nye version." });
      setPreviewKey((k) => k + 1);
      router.refresh();
    });
  }

  const welcomeStyle = config.design?.welcome === "cover" ? "cover" : config.welcome ? "tiles" : "none";
  const menuStyle = config.design?.menu ?? "side";

  return (
    <div className="-m-4 flex h-[calc(100vh-4rem)] flex-col sm:-m-6 lg:-m-8">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <Link href="/tour-lab" className="text-sm text-slate-500 hover:text-slate-800">
          ← Tours
        </Link>
        <h1 className="text-lg font-semibold text-slate-900">{config.title}</h1>
        {dirty && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Ikke gemt</span>}
        <div className="ml-auto flex items-center gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Hvad har du ændret? (valgfrit)" className={`${input} w-64`} />
          <button type="button" onClick={save} disabled={pending || !dirty} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
            {pending ? "Gemmer…" : "Gem"}
          </button>
        </div>
        {msg && <p className={`w-full text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Settings */}
        <div className="flex w-[440px] flex-none flex-col border-r border-slate-200 bg-white">
          <div className="flex flex-wrap gap-1 border-b border-slate-200 p-2">
            {TABS.map(([t, text]) => (
              <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-md px-2.5 py-1.5 text-sm ${tab === t ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                {text}
              </button>
            ))}
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {tab === "generelt" && (
              <>
                <Field title="Navn">
                  <input className={input} value={config.title} onChange={(e) => edit((d) => void (d.title = e.target.value))} />
                </Field>
                <DealPicker slug={slug} initial={deal} />
                <Field title="Firmanavn i touren">
                  <input className={input} value={config.brand} onChange={(e) => edit((d) => void (d.brand = e.target.value))} />
                </Field>
                <Field title="Undertitel">
                  <input className={input} value={config.subtitle ?? ""} onChange={(e) => edit((d) => void (d.subtitle = e.target.value || undefined))} />
                </Field>
                <Field title="Matterport-touren (MPSkins-link)" hint="Touren henter scanpunkter og skjulte punkter herfra.">
                  <input className={input} value={config.tourPage} onChange={(e) => edit((d) => void (d.tourPage = e.target.value))} />
                </Field>
                <Field title="Start" hint='Et U-link eller et udsyn kopieret med "Kopiér dette udsyn" i touren.'>
                  <input className={input} value={config.start} onChange={(e) => edit((d) => void (d.start = e.target.value))} />
                </Field>
              </>
            )}

            {tab === "design" && (
              <>
                <Field title="Velkomst">
                  <Choice
                    value={welcomeStyle}
                    options={[
                      ["none", "Ingen"],
                      ["tiles", "Fliser"],
                      ["cover", "Forside med foto"],
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
                        <input type="color" className="h-9 w-11 rounded border border-slate-300" value={config.colors[k]} onChange={(e) => edit((d) => void (d.colors[k] = e.target.value))} />
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
                <Field title="Logo (adresse)">
                  <input className={input} value={config.logo} onChange={(e) => edit((d) => void (d.logo = e.target.value))} />
                </Field>
                <Field title={`Logostørrelse: ${config.logoSize ?? 46} px`}>
                  <input type="range" min={28} max={120} className="w-full accent-indigo-600" value={config.logoSize ?? 46} onChange={(e) => edit((d) => void (d.logoSize = Number(e.target.value)))} />
                </Field>
                <Toggle on={Boolean(config.logoOnLight)} onChange={(on) => edit((d) => void (d.logoOnLight = on))} title="Mørkt logo" hint="Logoet får et lyst kort bag sig, så det kan læses på alle vægge." />
              </>
            )}

            {tab === "menu" && <MenuEditor menu={config.menu} onChange={(menu) => edit((d) => void (d.menu = menu))} />}

            {tab === "funktioner" && (
              <>
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
                <div className="grid grid-cols-2 gap-2">
                  <Toggle on={config.menuOpenOnStart.desktop} onChange={(on) => edit((d) => void (d.menuOpenOnStart.desktop = on))} title="Menu åben på computer" />
                  <Toggle on={config.menuOpenOnStart.mobile} onChange={(on) => edit((d) => void (d.menuOpenOnStart.mobile = on))} title="Menu åben på mobil" />
                </div>
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
                <Toggle on={Boolean(config.wayfinding)} onChange={(on) => edit((d) => void (d.wayfinding = on ? d.wayfinding ?? {} : undefined))} title="Find vej" hint="Vælg et rum, og touren går vejen derhen fra der, man står." />
                <Toggle on={Boolean(config.measure)} onChange={(on) => edit((d) => void (d.measure = on || undefined))} title="Vis mål" hint="En knap, der viser Matterports mål i rummet." />
                <Toggle on={Boolean(config.matterportUi)} onChange={(on) => edit((d) => void (d.matterportUi = on || undefined))} title="Behold Matterports egne knapper" hint="Normalt skjult - tourens egne knapper er brugerfladen." />
                <p className="text-xs text-slate-500">
                  Vis mig rundt ({config.guide?.stops.length ?? 0} stop), infopunkter ({config.info?.length ?? 0}) og steder ({config.places?.length ?? 0}) redigeres under Avanceret indtil videre.
                </p>
              </>
            )}

            {tab === "links" && (
              <>
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
                <CtaEditor cta={config.cta} onChange={(cta) => edit((d) => void (d.cta = cta))} />
                <Field title="Kontakt (i menuen)">
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
              </>
            )}

            {tab === "avanceret" && (
              <>
                <p className="text-sm text-slate-600">Hele opsætningen. Ret direkte her for alt det, der endnu ikke har sine egne felter (velkomstens fliser, punkter, steder, guidet tur, infopunkter…).</p>
                <textarea
                  className="h-[60vh] w-full rounded-lg border border-slate-300 p-3 font-mono text-xs"
                  spellCheck={false}
                  value={json ?? JSON.stringify(config, null, 2)}
                  onChange={(e) => setJson(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={json == null}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
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
                    <button type="button" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setJson(null)}>
                      Fortryd
                    </button>
                  )}
                </div>
              </>
            )}

            {tab === "versioner" && (
              <ul className="space-y-2">
                {versions.map((v, i) => (
                  <li key={v.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 p-3">
                    <div>
                      <div className="text-sm font-medium text-slate-800">
                        {when(v.at)} {i === 0 && <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800">Nuværende</span>}
                      </div>
                      <div className="text-xs text-slate-500">
                        {v.by ?? "Ukendt"}
                        {v.note ? ` · ${v.note}` : ""}
                      </div>
                    </div>
                    {i > 0 && (
                      <button
                        type="button"
                        disabled={pending}
                        className="flex-none rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50"
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
        <div className="flex min-w-0 flex-1 flex-col bg-slate-100">
          <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 text-sm">
            <Choice
              value={device}
              options={[
                ["computer", "Computer"],
                ["mobil", "Mobil"],
              ]}
              onChange={setDevice}
            />
            <span className="text-slate-500">{dirty ? "Forhåndsvisningen viser den gemte version - gem for at se dine ændringer." : "Gemt version."}</span>
            <a href={`/tour-lab/${slug}`} target="_blank" rel="noopener" className="ml-auto text-indigo-600 hover:underline">
              Åbn i ny fane ↗
            </a>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-4">
            <iframe
              key={previewKey}
              title="Forhåndsvisning"
              src={`/tour-lab/${slug}`}
              className={`h-full rounded-xl border border-slate-300 bg-black shadow-lg ${device === "mobil" ? "w-[390px] max-h-[844px]" : "w-full"}`}
              allow="fullscreen; xr-spatial-tracking; autoplay; clipboard-write"
            />
          </div>
        </div>
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
        <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <Link href={`/deals/${deal.id}`} className="font-medium text-indigo-600 hover:underline">
            {deal.name}
          </Link>
          <button type="button" className="text-xs text-slate-500 hover:text-red-600" onClick={() => pick(null)}>
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
            <ul className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              {hits.map((h) => (
                <li key={h.id}>
                  <button type="button" className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50" onClick={() => pick({ id: h.id, name: h.displayName ?? h.companyName })}>
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
      <p className="text-xs text-slate-500">Links kan være U-links fra Matterport, MPSkins-links eller udsyn kopieret i touren. Links til andre sider åbner som knapper.</p>
      {menu.map((m, i) => (
        <div key={i} className="rounded-lg border border-slate-200 p-3">
          <div className="flex items-center gap-2">
            <input className={input} value={m.title} onChange={(e) => set(i, { ...m, title: e.target.value })} />
            <button type="button" className="text-slate-400 hover:text-slate-700" onClick={() => move(i, -1)} aria-label="Op">
              ↑
            </button>
            <button type="button" className="text-slate-400 hover:text-slate-700" onClick={() => move(i, 1)} aria-label="Ned">
              ↓
            </button>
            <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => onChange(menu.filter((_, j) => j !== i))} aria-label="Slet">
              ×
            </button>
          </div>
          {"items" in m ? (
            <div className="mt-2 space-y-1.5 pl-3">
              {m.items.map(([name, href], k) => (
                <div key={k} className="flex gap-1.5">
                  <input className={`${input} w-2/5`} value={name} onChange={(e) => set(i, { ...m, items: m.items.map((it, n) => (n === k ? [e.target.value, it[1]] : it)) })} />
                  <input className={input} value={href} placeholder="Link" onChange={(e) => set(i, { ...m, items: m.items.map((it, n) => (n === k ? [it[0], e.target.value] : it)) })} />
                  <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => set(i, { ...m, items: m.items.filter((_, n) => n !== k) })} aria-label="Slet">
                    ×
                  </button>
                </div>
              ))}
              <button type="button" className="text-xs font-medium text-indigo-600" onClick={() => set(i, { ...m, items: [...m.items, ["Nyt sted", ""]] })}>
                + Tilføj sted
              </button>
            </div>
          ) : (
            <input className={`${input} mt-2`} value={m.href} placeholder="Link" onChange={(e) => set(i, { ...m, href: e.target.value })} />
          )}
        </div>
      ))}
      <div className="flex gap-3 text-sm">
        <button type="button" className="font-medium text-indigo-600" onClick={() => onChange([...menu, { title: "Ny gruppe", items: [] }])}>
          + Gruppe
        </button>
        <button type="button" className="font-medium text-indigo-600" onClick={() => onChange([...menu, { title: "Nyt sted", href: "" }])}>
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
          <div key={i} className="space-y-1.5 rounded-lg border border-slate-200 p-2">
            <div className="flex gap-1.5">
              <input className={input} value={c.label} placeholder="Tekst" onChange={(e) => onChange(cta.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => onChange(cta.filter((_, j) => j !== i))} aria-label="Slet">
                ×
              </button>
            </div>
            <input className={input} value={c.href} placeholder="https://…" onChange={(e) => onChange(cta.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)))} />
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" className="accent-indigo-600" checked={c.primary} onChange={(e) => onChange(cta.map((x, j) => (j === i ? { ...x, primary: e.target.checked } : x)))} />
              Hovedknap (fremhævet)
            </label>
          </div>
        ))}
        <button type="button" className="text-sm font-medium text-indigo-600" onClick={() => onChange([...cta, { label: "Ny knap", href: "", primary: cta.length === 0 }])}>
          + Knap
        </button>
      </div>
    </Field>
  );
}
