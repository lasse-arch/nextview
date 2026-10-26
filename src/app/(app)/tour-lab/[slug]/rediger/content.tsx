"use client";

import { isPlaceHref } from "../../tours/places";
import { useState } from "react";
import { saveTourStoryImage } from "@/lib/actions/tour-lab";
import type { PlaceCard, TourConfig, TourInfo, TourPlace, WelcomeGo } from "../../tours/types";
import { Choice, Field, Group, Icon, input, Toggle, UploadButton, ssOfHref, type PreviewApi } from "./ui";

/*
 * The editors for a tour's content - the start, its places, "Vis mig rundt"
 * and the cards that come up in the tour. Everything that points at a spot in
 * the tour is picked by standing there in the live preview, and photos are
 * taken from it, so nobody has to copy links or upload pictures.
 */

type Edit = (fn: (draft: TourConfig) => void) => void;
type Props = { config: TourConfig; edit: Edit; slug: string; preview: PreviewApi };

const PIN = '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>';
const CAMERA = '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>';
const textarea = `${input} min-h-[72px] resize-y leading-snug`;
const small = "px-1 text-[12px] leading-snug text-[#8e8e93]";
const linkButton = "rounded-xl bg-white py-2 text-[14px] font-medium text-[#0071e3] ring-1 ring-black/[.06] hover:bg-[#0071e3]/5 disabled:opacity-50";

/** Saves a photo from the preview with the tour and returns its address. */
async function savePhoto(slug: string, key: string, image: string): Promise<string> {
  const r = await saveTourStoryImage(slug, `foto:${key}`, image);
  if (!r.ok) throw new Error(r.error);
  return `/tour-lab/${slug}/historie?rum=${encodeURIComponent(`foto:${key}`)}&v=${Date.now()}`;
}

/** A list of things that can be dragged into order, opened to edit and deleted - like the menu. */
function Rows<T>({
  items,
  onChange,
  icon,
  title,
  subtitle,
  editor,
  empty,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  icon: [string, string];
  title: (item: T) => string;
  subtitle: (item: T) => string;
  editor: (item: T, set: (next: T) => void) => React.ReactNode;
  empty: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  return (
    <div className="-mx-4 divide-y divide-black/[.05] border-y border-black/[.05]">
      {items.length === 0 && <p className="px-4 py-5 text-center text-[13px] text-[#8e8e93]">{empty}</p>}
      {items.map((item, i) => (
        <div
          key={i}
          draggable
          onDragStart={() => setDrag(i)}
          onDragEnd={() => {
            setDrag(null);
            setOver(null);
          }}
          onDragOver={(e) => {
            if (drag == null) return;
            e.preventDefault();
            setOver(i);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (drag != null && drag !== i) {
              const next = [...items];
              const [moved] = next.splice(drag, 1);
              next.splice(i, 0, moved);
              onChange(next);
            }
            setDrag(null);
            setOver(null);
            setOpen(null);
          }}
          className={drag === i ? "opacity-40" : ""}
        >
          {over === i && drag !== i && <div className="mx-4 h-0.5 rounded-full bg-[#0071e3]" />}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setOpen(open === i ? null : i)}
            onKeyDown={(e) => e.key === "Enter" && setOpen(open === i ? null : i)}
            className={`flex cursor-pointer items-center gap-3 py-2.5 pl-3 pr-3 transition ${open === i ? "bg-[#f2f2f7]" : "hover:bg-[#f9f9fb]"}`}
          >
            <span className="cursor-grab text-[#c7c7cc]" title="Træk for at flytte">
              <Icon d='<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>' className="h-4 w-4" />
            </span>
            <span className={`flex h-[28px] w-[28px] flex-none items-center justify-center rounded-[7px] text-white ${icon[0]}`}>
              <Icon d={icon[1]} className="h-[16px] w-[16px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px]">{title(item) || "Uden navn"}</span>
              <span className="block truncate text-[12px] text-[#8e8e93]">{subtitle(item)}</span>
            </span>
            <Icon d={open === i ? '<path d="M6 9l6 6 6-6"/>' : '<path d="M9 6l6 6-6 6"/>'} className="h-4 w-4 flex-none text-[#c7c7cc]" />
          </div>
          {open === i && (
            <div className="space-y-3 border-t border-black/[.04] bg-[#f9f9fb] px-4 py-3">
              {editor(item, (next) => onChange(items.map((x, j) => (j === i ? next : x))))}
              <button
                type="button"
                className="text-[13px] text-[#ff3b30] hover:underline"
                onClick={() => {
                  onChange(items.filter((_, j) => j !== i));
                  setOpen(null);
                }}
              >
                Slet
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Where something leads in the tour: picked by standing there in the preview. */
function PlacePicker({ href, onChange, preview, name }: { href: string; onChange: (href: string, room: string | null) => void; preview: PreviewApi; name?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ss = ssOfHref(href);
  return (
    <Field title="Sted i touren">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          className={`${linkButton} flex flex-1 items-center justify-center gap-1.5`}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const r = await preview.view();
            setBusy(false);
            if (r.error || !r.href) return setError(r.error ?? "Forhåndsvisningen svarede ikke.");
            onChange(r.href, r.room ?? null);
          }}
        >
          <Icon d={PIN} className="h-4 w-4" />
          {busy ? "Henter…" : ss ? "Brug udsynet i forhåndsvisningen" : "Brug stedet i forhåndsvisningen"}
        </button>
        {ss && (
          <button type="button" className={`${linkButton} px-3`} onClick={() => preview.go(name ?? "", href)}>
            Vis
          </button>
        )}
      </div>
      <p className={small}>{ss ? `Punkt ${ss} i touren.` : "Gå derhen i forhåndsvisningen og drej, så det ser rigtigt ud - tryk så her."}</p>
      {error && <p className="px-1 text-[12px] text-[#ff3b30]">{error}</p>}
    </Field>
  );
}

/** A photo - taken from the preview, or an address. */
function PhotoPicker({ image, onChange, preview, slug, photoKey }: { image: string; onChange: (src: string) => void; preview: PreviewApi; slug: string; photoKey: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Field title="Foto">
      <div className="flex items-center gap-3">
        <div className="h-[60px] w-[96px] flex-none overflow-hidden rounded-lg bg-[#e9e9eb]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {image && <img src={image} alt="" className="h-full w-full object-cover" />}
        </div>
        <button
          type="button"
          disabled={busy}
          className={`${linkButton} flex flex-1 items-center justify-center gap-1.5`}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const r = await preview.shot();
              if (r.error || !r.image) throw new Error(r.error ?? "Intet billede.");
              onChange(await savePhoto(slug, photoKey, r.image));
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
            setBusy(false);
          }}
        >
          <Icon d={CAMERA} className="h-4 w-4" />
          {busy ? "Tager billede…" : "Tag billede"}
        </button>
        <UploadButton accept="image/*" onDone={onChange} />
      </div>
      {error && <p className="px-1 text-[12px] text-[#ff3b30]">{error}</p>}
      <details className="text-[12px] text-[#8e8e93]">
        <summary className="cursor-pointer select-none">Brug et andet billede (adresse)</summary>
        <input className={`${input} mt-1.5 bg-white text-[13px]`} value={image} placeholder="https://… eller /tours/…" onChange={(e) => onChange(e.target.value)} />
      </details>
    </Field>
  );
}

type CardButton = { label: string; href: string; primary?: boolean } | { label: string; room: string };

/** Buttons on a card: to a room (by its menu name) or a page. */
function ButtonsEditor({ buttons, onChange, rooms, allowRoom }: { buttons: CardButton[]; onChange: (b: CardButton[]) => void; rooms: string[]; allowRoom: boolean }) {
  return (
    <Field title="Knapper">
      <div className="space-y-2">
        {buttons.map((b, i) => (
          <div key={i} className="space-y-1.5 rounded-xl bg-white p-2.5 ring-1 ring-black/[.05]">
            <div className="flex gap-1.5">
              <input className={input} value={b.label} placeholder="Tekst på knappen" onChange={(e) => onChange(buttons.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <button type="button" className="px-1 text-[#c7c7cc] hover:text-[#ff3b30]" onClick={() => onChange(buttons.filter((_, j) => j !== i))} aria-label="Slet">
                ×
              </button>
            </div>
            {allowRoom && (
              <Choice
                value={"room" in b ? "room" : "href"}
                options={[
                  ["href", "Webside"],
                  ["room", "Rum i touren"],
                ]}
                onChange={(v) => onChange(buttons.map((x, j) => (j === i ? (v === "room" ? { label: x.label, room: rooms[0] ?? "" } : { label: x.label, href: "https://" }) : x)))}
              />
            )}
            {"room" in b ? (
              <select className={input} value={b.room} onChange={(e) => onChange(buttons.map((x, j) => (j === i ? { label: x.label, room: e.target.value } : x)))}>
                {rooms.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            ) : (
              <input className={input} value={b.href} placeholder="https://…" onChange={(e) => onChange(buttons.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)))} />
            )}
          </div>
        ))}
        <button type="button" className="text-[13px] font-medium text-[#0071e3]" onClick={() => onChange([...buttons, { label: "Ny knap", href: "https://" }])}>
          + Knap
        </button>
      </div>
    </Field>
  );
}

/** Every room in the menu, by name (what card buttons can fly to). */
const menuRooms = (c: TourConfig) => c.menu.flatMap((m) => ("items" in m ? m.items : [[m.title, m.href] as [string, string]])).filter(([, h]) => isPlaceHref(h)).map(([n]) => n);

/* ------------------------------------------------------------------ */

export function StartEditor({ config, edit, slug, preview }: Props) {
  const style = config.design?.welcome === "cover" ? "cover" : config.welcome ? (config.design?.welcome === "simple" ? "simple" : "tiles") : "none";
  const menuStyle = config.design?.menu ?? "side";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cover = config.cover;
  const welcome = config.welcome;

  /** A place where the preview stands, with a photo of it - in one go. */
  async function addPlace() {
    setBusy(true);
    setError(null);
    try {
      const view = await preview.view();
      if (view.error || !view.href) throw new Error(view.error ?? "Forhåndsvisningen svarede ikke.");
      const shot = await preview.shot();
      if (shot.error || !shot.image) throw new Error(shot.error ?? "Intet billede.");
      const name = view.room ?? "Nyt sted";
      const image = await savePhoto(slug, `${name}-${Date.now().toString(36)}`, shot.image);
      edit((d) => void (d.places = [...(d.places ?? []), { name, href: view.href!, image }]));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusy(false);
  }

  return (
    <>
      <Group title="Når touren åbner">
        <Choice
          value={style}
          options={[
            ["none", "Direkte i touren"],
            ["tiles", "Velkomst"],
            ["simple", "Helt enkel"],
            ["cover", "Forside"],
          ]}
          onChange={(v) =>
            edit((d) => {
              if (v === "none") {
                d.welcome = undefined;
                d.design = { welcome: "tiles", menu: menuStyle };
              } else if (v === "tiles" || v === "simple") {
                d.welcome ??= { kicker: d.brand, title: `Velkommen til ${d.brand}`, lead: "Tag en tur rundt - eller hop direkte derhen, du vil se.", tiles: [], skip: "Jeg kigger selv rundt" };
                d.design = { welcome: v, menu: menuStyle };
              } else {
                d.cover ??= { kicker: d.subtitle ?? d.brand, title: `Velkommen til ${d.brand}`, lead: "Kig indenfor før du kommer.", image: d.places?.[0]?.image ?? d.logo, enter: "Træd indenfor", placesTitle: "Vælg hvor du vil starte" };
                d.design = { welcome: "cover", menu: menuStyle };
              }
            })
          }
        />
        <p className={small}>
          {style === "none" && "Touren starter med det samme - godt når folk kommer fra en knap på hjemmesiden, der allerede har fortalt historien."}
          {style === "tiles" && "En kort velkomst med fliser til de vigtigste steder. Godt når der er få, tydelige valg."}
          {style === "simple" && "Få store knapper under hinanden - intet andet. Til gæster, der skal have det helt roligt og enkelt (fx specialskoler). Hold det til 2-3 knapper."}
          {style === "cover" && "Et stort foto af stedet med en knap ind og stederne at vælge imellem - premium, og fortsætter hjemmesidens fortælling."}
        </p>
        {config.intro && <Toggle on={Boolean(config.intro)} onChange={(on) => !on && edit((d) => void (d.intro = undefined))} title="Kort film før touren" hint="Fx en drone, der flyver ned til indgangen. Slå fra for at fjerne den." />}
      </Group>

      {style === "cover" && cover && (
        <Group title="Forsiden">
          <Field title="Lille overskrift">
            <input className={input} value={cover.kicker} onChange={(e) => edit((d) => void (d.cover!.kicker = e.target.value))} />
          </Field>
          <Field title="Overskrift">
            <input className={input} value={cover.title} onChange={(e) => edit((d) => void (d.cover!.title = e.target.value))} />
          </Field>
          <Field title="Tekst">
            <textarea className={textarea} value={cover.lead} onChange={(e) => edit((d) => void (d.cover!.lead = e.target.value))} />
          </Field>
          <Field title="Knappen ind i touren">
            <input className={input} value={cover.enter} onChange={(e) => edit((d) => void (d.cover!.enter = e.target.value))} />
          </Field>
          <PhotoPicker image={cover.image} slug={slug} photoKey="forside" preview={preview} onChange={(src) => edit((d) => void (d.cover!.image = src))} />
          <Field title="Overskrift over stederne">
            <input className={input} value={cover.placesTitle} onChange={(e) => edit((d) => void (d.cover!.placesTitle = e.target.value))} />
          </Field>
        </Group>
      )}

      {(style === "tiles" || style === "simple") && welcome && (
        <>
          <Group title="Velkomsten">
            <Field title="Lille overskrift">
              <input className={input} value={welcome.kicker} onChange={(e) => edit((d) => void (d.welcome!.kicker = e.target.value))} />
            </Field>
            <Field title="Overskrift">
              <input className={input} value={welcome.title} onChange={(e) => edit((d) => void (d.welcome!.title = e.target.value))} />
            </Field>
            <Field title="Tekst">
              <textarea className={textarea} value={welcome.lead} onChange={(e) => edit((d) => void (d.welcome!.lead = e.target.value))} />
            </Field>
            <Field title='"Kig selv rundt"-link'>
              <input className={input} value={welcome.skip} onChange={(e) => edit((d) => void (d.welcome!.skip = e.target.value))} />
            </Field>
          </Group>
          <Group title="Fliser">
            <Rows
              items={welcome.tiles}
              onChange={(tiles) => edit((d) => void (d.welcome!.tiles = tiles))}
              icon={["bg-[#af52de]", '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>']}
              title={(t) => t.title}
              subtitle={(t) => `${t.kicker} · ${"room" in t.go ? "sted i touren" : "guide" in t.go ? "Vis mig rundt" : "href" in t.go ? "webside" : "luftfoto"}${t.recommended ? " · anbefalet" : ""}`}
              empty="Ingen fliser endnu."
              editor={(t, set) => (
                <>
                  <Field title="Lille overskrift">
                    <input className={`${input} bg-white`} value={t.kicker} onChange={(e) => set({ ...t, kicker: e.target.value })} />
                  </Field>
                  <Field title="Titel">
                    <input className={`${input} bg-white`} value={t.title} onChange={(e) => set({ ...t, title: e.target.value })} />
                  </Field>
                  <Field title="Udseende">
                    <Choice
                      value={t.style}
                      options={[
                        ["dark", "Mørk"],
                        ["light", "Lys"],
                        ["accent", "Accent"],
                      ]}
                      onChange={(v) => set({ ...t, style: v })}
                    />
                  </Field>
                  <Toggle on={Boolean(t.recommended)} onChange={(on) => set({ ...t, recommended: on || undefined })} title="Anbefalet" hint='Får et "Anbefalet"-mærke.' />
                  <Field title="Fører til">
                    <Choice
                      value={"room" in t.go ? "room" : "guide" in t.go ? "guide" : "day" in t.go ? "day" : "href" in t.go ? "href" : "drone"}
                      options={[["room", "Sted"], ["guide", "Rundvisning"], ...(config.day ? ([["day", "Dagen"]] as [string, string][]) : []), ["href", "Webside"], ...(config.drone || config.map ? ([["drone", "Luftfoto"]] as ["drone", string][]) : [])] as [string, string][]}
                      onChange={(v) => {
                        const go: WelcomeGo = v === "room" ? { room: "", name: t.title } : v === "guide" ? { guide: true } : v === "day" ? { day: true } : v === "href" ? { href: "https://" } : { drone: null };
                        set({ ...t, go });
                      }}
                    />
                  </Field>
                  {"room" in t.go && <PlacePicker href={t.go.room} name={t.title} preview={preview} onChange={(href) => set({ ...t, go: { room: href, name: t.title } })} />}
                  {"href" in t.go && <input className={`${input} bg-white`} value={t.go.href} placeholder="https://…" onChange={(e) => set({ ...t, go: { href: e.target.value } })} />}
                </>
              )}
            />
            <button type="button" className={`${linkButton} w-full`} onClick={() => edit((d) => void d.welcome!.tiles.push({ kicker: "", title: "Ny flise", go: { guide: true }, style: "light" }))}>
              + Flise
            </button>
          </Group>
        </>
      )}

      <Group title="Steder med foto">
        <p className={small}>Bruges på forsiden og i bunden af touren (&quot;Steder&quot;). Gå hen til et sted i forhåndsvisningen og tryk på knappen - så kommer både stedet og et foto med.</p>
        <Rows<TourPlace>
          items={config.places ?? []}
          onChange={(places) => edit((d) => void (d.places = places.length ? places : undefined))}
          icon={["bg-[#34c759]", PIN]}
          title={(p) => p.name}
          subtitle={(p) => (p.kicker ? `${p.kicker} · punkt ${ssOfHref(p.href) ?? "?"}` : `Punkt ${ssOfHref(p.href) ?? "?"}`)}
          empty="Ingen steder endnu."
          editor={(p, set) => (
            <>
              <Field title="Navn">
                <input className={`${input} bg-white`} value={p.name} onChange={(e) => set({ ...p, name: e.target.value })} />
              </Field>
              <Field title="Lille overskrift (valgfri)">
                <input className={`${input} bg-white`} value={p.kicker ?? ""} onChange={(e) => set({ ...p, kicker: e.target.value || undefined })} />
              </Field>
              <PhotoPicker image={p.image} slug={slug} photoKey={`sted-${ssOfHref(p.href) ?? 0}-${p.name}`} preview={preview} onChange={(image) => set({ ...p, image })} />
              <PlacePicker href={p.href} name={p.name} preview={preview} onChange={(href) => set({ ...p, href })} />
            </>
          )}
        />
        <button type="button" disabled={busy} onClick={addPlace} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0071e3] py-2.5 text-[15px] font-medium text-white hover:bg-[#0077ed] disabled:opacity-50">
          <Icon d={CAMERA} className="h-4 w-4" />
          {busy ? "Henter sted og foto…" : "Tilføj det sted, du ser"}
        </button>
        {error && <p className="px-1 text-[12px] text-[#ff3b30]">{error}</p>}
      </Group>
    </>
  );
}

/* ------------------------------------------------------------------ */

type Stop = NonNullable<TourConfig["guide"]>["stops"][number];

export function GuideEditor({ config, edit, preview }: Omit<Props, "slug">) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stops = config.guide?.stops ?? [];
  const setStops = (s: Stop[]) => edit((d) => void (d.guide = s.length ? { ...d.guide, stops: s } : undefined));
  return (
    <>
      <Group>
        <p className="text-[14px] leading-snug text-[#1d1d1f]">&quot;Vis mig rundt&quot; flyver fra stop til stop med en kort tekst ved hvert - og en stemme, hvis stoppet har en lydfil. Som en rundvisning med en medarbejder.</p>
        <p className={small}>Hold den kort: 4-7 stop, der fortæller en historie og slutter der, hvor man skal handle (fx book, bliv elev).</p>
        {stops.length > 0 && (
          <Toggle
            on={Boolean(config.guide?.manual)}
            onChange={(on) => edit((d) => void (d.guide = { ...d.guide!, manual: on || undefined }))}
            title="Man trykker selv videre"
            hint="Roligt tempo - godt til en stemme-rundvisning. Stop med lyd venter altid på, at stemmen er færdig."
          />
        )}
        {stops.length > 0 && !config.guide?.manual && (
          <Field title={`Sekunder ved hvert stop: ${config.guide?.seconds ?? 8}`}>
            <input type="range" min={4} max={20} className="w-full accent-[#0071e3]" value={config.guide?.seconds ?? 8} onChange={(e) => edit((d) => void (d.guide = { ...d.guide!, seconds: Number(e.target.value) }))} />
          </Field>
        )}
      </Group>
      <Group title="Stop">
        <Rows<Stop>
          items={stops}
          onChange={setStops}
          icon={["bg-[#ff2d55]", '<path d="M8 5v14l11-7z"/>']}
          title={(s) => ("point" in s ? `Luftfoto-punkt: ${s.point}` : s.title)}
          subtitle={(s) => ("point" in s ? "Bruger punktets egen tekst" : [s.audio ? "🔊" : null, s.href ? null : "Bliver stående", s.text || "Mangler tekst"].filter(Boolean).join(" · "))}
          empty='Ingen stop endnu. Gå til det første sted i forhåndsvisningen og tryk "Tilføj det sted, du ser".'
          editor={(s, set) =>
            "point" in s ? (
              <p className={small}>Dette stop bruger navn og tekst fra luftfotoets punkt &quot;{s.point}&quot;.</p>
            ) : (
              <>
                <Field title="Titel">
                  <input className={`${input} bg-white`} value={s.title} onChange={(e) => set({ ...s, title: e.target.value })} />
                </Field>
                <Field title="Tekst" hint="1-2 korte sætninger.">
                  <textarea className={`${textarea} bg-white`} value={s.text} onChange={(e) => set({ ...s, text: e.target.value })} />
                </Field>
                {s.href ? (
                  <>
                    <PlacePicker href={s.href} name={s.title} preview={preview} onChange={(href) => set({ ...s, href })} />
                    <button type="button" className="text-[12px] text-[#8e8e93] hover:text-[#ff3b30]" onClick={() => set({ ...s, href: "" })}>
                      Bliv stående (intet sted - fx et afslutningskort)
                    </button>
                  </>
                ) : (
                  <PlacePicker href="" name={s.title} preview={preview} onChange={(href) => set({ ...s, href })} />
                )}
                <Field title="Stemme (valgfri)" hint="En lydfil (mp3/m4a), der spilles ved stoppet. Gæsten kan slå lyden fra.">
                  {s.audio ? (
                    <div className="space-y-1.5">
                      <audio controls preload="none" src={s.audio} className="h-9 w-full" />
                      <div className="flex gap-2">
                        <UploadButton accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,.mp3,.m4a" label="Skift lyd" onDone={(audio) => set({ ...s, audio })} />
                        <button type="button" className="text-[13px] text-[#ff3b30] hover:underline" onClick={() => set({ ...s, audio: undefined })}>
                          Fjern
                        </button>
                      </div>
                    </div>
                  ) : (
                    <UploadButton accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,.mp3,.m4a" label="Upload lydfil" onDone={(audio) => set({ ...s, audio })} />
                  )}
                </Field>
              </>
            )
          }
        />
        <button
          type="button"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0071e3] py-2.5 text-[15px] font-medium text-white hover:bg-[#0077ed] disabled:opacity-50"
          onClick={async () => {
            setBusy(true);
            setError(null);
            const r = await preview.view();
            setBusy(false);
            if (r.error || !r.href) return setError(r.error ?? "Forhåndsvisningen svarede ikke.");
            setStops([...stops, { href: r.href, title: r.room ?? "Nyt stop", text: "" }]);
          }}
        >
          <Icon d='<path d="M12 5v14M5 12h14"/>' className="h-4 w-4" />
          {busy ? "Henter stedet…" : "Tilføj det sted, du ser"}
        </button>
        {error && <p className="px-1 text-[12px] text-[#ff3b30]">{error}</p>}
      </Group>
      <DayEditor config={config} edit={edit} preview={preview} />
    </>
  );
}

type DayStep = NonNullable<TourConfig["day"]>["steps"][number];

/** "Sådan ser en dag ud": a timeline of the day, each step optionally shown in the tour. */
function DayEditor({ config, edit, preview }: Omit<Props, "slug">) {
  const day = config.day;
  if (!day)
    return (
      <Group title="Sådan ser en dag ud">
        <p className={small}>En rolig tidslinje over en almindelig dag - tid, hvad der sker, og hvor. Godt for gæster, der gerne vil vide, hvad der kommer (fx en specialefterskole).</p>
        <button type="button" className={`${linkButton} w-full`} onClick={() => edit((d) => void (d.day = { title: "Sådan ser en dag ud", steps: [{ time: "8.00", title: "Morgenmad" }] }))}>
          + Lav en dag
        </button>
      </Group>
    );
  return (
    <Group title="Sådan ser en dag ud">
      <Field title="Overskrift">
        <input className={input} value={day.title} onChange={(e) => edit((d) => void (d.day!.title = e.target.value))} />
      </Field>
      <Field title="Kort intro (valgfri)">
        <input className={input} value={day.lead ?? ""} onChange={(e) => edit((d) => void (d.day!.lead = e.target.value || undefined))} />
      </Field>
      <Rows<DayStep>
        items={day.steps}
        onChange={(steps) => edit((d) => void (d.day!.steps = steps))}
        icon={["bg-[#ff9500]", '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>']}
        title={(s) => `${s.time}  ${s.title}`}
        subtitle={(s) => [s.href ? `Punkt ${ssOfHref(s.href) ?? "?"}` : "Intet sted", s.text].filter(Boolean).join(" · ")}
        empty="Ingen tidspunkter endnu."
        editor={(s, set) => (
          <>
            <div className="flex gap-2">
              <Field title="Tid">
                <input className={`${input} w-20 bg-white`} value={s.time} onChange={(e) => set({ ...s, time: e.target.value })} />
              </Field>
              <div className="flex-1">
                <Field title="Hvad sker der">
                  <input className={`${input} bg-white`} value={s.title} onChange={(e) => set({ ...s, title: e.target.value })} />
                </Field>
              </div>
            </div>
            <Field title="Tekst (valgfri)" hint="Én kort, konkret sætning.">
              <input className={`${input} bg-white`} value={s.text ?? ""} onChange={(e) => set({ ...s, text: e.target.value || undefined })} />
            </Field>
            <PlacePicker href={s.href ?? ""} name={s.title} preview={preview} onChange={(href) => set({ ...s, href })} />
            {s.href && (
              <button type="button" className="text-[12px] text-[#8e8e93] hover:text-[#ff3b30]" onClick={() => set({ ...s, href: undefined })}>
                Intet sted til dette tidspunkt
              </button>
            )}
          </>
        )}
      />
      <div className="flex gap-2">
        <button type="button" className={`${linkButton} flex-1`} onClick={() => edit((d) => void d.day!.steps.push({ time: "", title: "Nyt tidspunkt" }))}>
          + Tidspunkt
        </button>
        <button type="button" className="px-2 text-[13px] text-[#ff3b30] hover:underline" onClick={() => edit((d) => void (d.day = undefined))}>
          Fjern dagen
        </button>
      </div>
    </Group>
  );
}

/* ------------------------------------------------------------------ */

export function CardsEditor({ config, edit, preview }: Omit<Props, "slug">) {
  const [busy, setBusy] = useState<number | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cards = config.placeCards ?? [];
  const rooms = menuRooms(config);
  const nudge = config.nudge;
  async function here(): Promise<number | null> {
    setError(null);
    const r = await preview.view();
    const ss = r.href ? ssOfHref(r.href) : null;
    if (r.error || !ss) setError(r.error ?? "Gå ind i touren først.");
    return ss;
  }
  return (
    <>
      <Group title="Stedkort">
        <p className={small}>Et lille kort, der kommer frem, når man lander et bestemt sted - med en tekst om stedet og evt. knapper. Det forsvinder selv igen.</p>
        <Rows<PlaceCard>
          items={cards}
          onChange={(c) => edit((d) => void (d.placeCards = c.length ? c : undefined))}
          icon={["bg-[#5856d6]", '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 10h8M8 14h5"/>']}
          title={(c) => c.title}
          subtitle={(c) => `Ved punkt ${c.ss.join(", ") || "?"}`}
          empty="Ingen stedkort endnu."
          editor={(c, set) => (
            <>
              <Field title="Overskrift">
                <input className={`${input} bg-white`} value={c.title} onChange={(e) => set({ ...c, title: e.target.value })} />
              </Field>
              <Field title="Tekst" hint="Kort - 1-3 sætninger.">
                <textarea className={`${textarea} bg-white`} value={c.text} onChange={(e) => set({ ...c, text: e.target.value })} />
              </Field>
              <Field title="Vises ved punkt">
                <div className="flex flex-wrap items-center gap-1.5">
                  {c.ss.map((n) => (
                    <span key={n} className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[13px] ring-1 ring-black/[.06]">
                      {n}
                      <button type="button" className="text-[#c7c7cc] hover:text-[#ff3b30]" onClick={() => set({ ...c, ss: c.ss.filter((x) => x !== n) })} aria-label="Fjern">
                        ×
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    disabled={busy != null}
                    className="rounded-full px-2.5 py-1 text-[13px] font-medium text-[#0071e3] hover:bg-[#0071e3]/10"
                    onClick={async () => {
                      setBusy(cards.indexOf(c));
                      const ss = await here();
                      setBusy(null);
                      if (ss && !c.ss.includes(ss)) set({ ...c, ss: [...c.ss, ss] });
                    }}
                  >
                    + Punktet i forhåndsvisningen
                  </button>
                </div>
              </Field>
              <details className="text-[13px]">
                <summary className="cursor-pointer select-none text-[#0071e3]">&quot;Læs mere&quot;-side (valgfri)</summary>
                <div className="mt-2 space-y-2">
                  <input className={`${input} bg-white`} placeholder="Knaptekst, fx Læs mere" value={c.more?.label ?? ""} onChange={(e) => set({ ...c, more: e.target.value || c.more?.text ? { label: e.target.value, text: c.more?.text ?? "" } : undefined })} />
                  <textarea className={`${textarea} bg-white`} placeholder="Den lange tekst" value={c.more?.text ?? ""} onChange={(e) => set({ ...c, more: { label: c.more?.label || "Læs mere", text: e.target.value } })} />
                </div>
              </details>
              <ButtonsEditor buttons={c.buttons ?? []} rooms={rooms} allowRoom onChange={(b) => set({ ...c, buttons: b.length ? b : undefined })} />
            </>
          )}
        />
        <button
          type="button"
          disabled={busy != null}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0071e3] py-2.5 text-[15px] font-medium text-white hover:bg-[#0077ed] disabled:opacity-50"
          onClick={async () => {
            setBusy("new");
            const ss = await here();
            setBusy(null);
            if (ss) edit((d) => void (d.placeCards = [...(d.placeCards ?? []), { ss: [ss], title: "Nyt stedkort", text: "" }]));
          }}
        >
          <Icon d='<path d="M12 5v14M5 12h14"/>' className="h-4 w-4" />
          {busy === "new" ? "Henter stedet…" : "Nyt kort ved stedet, du ser"}
        </button>
        {error && <p className="px-1 text-[12px] text-[#ff3b30]">{error}</p>}
      </Group>

      <Group title='"Din plads venter"'>
        <Toggle
          on={Boolean(nudge)}
          onChange={(on) =>
            edit(
              (d) =>
                void (d.nudge = on
                  ? { afterSeconds: 90, title: "Din plads venter", text: "Har du set nok til at tage det næste skridt?", buttons: d.cta.filter((c) => c.primary).map((c) => ({ label: c.label, href: c.href, primary: true })) }
                  : undefined)
            )
          }
          title="Kort efter et stykke tid"
          hint="Kommer selv, når den besøgende har kigget rundt en stund - aldrig mens menuen eller et stedkort er åbent."
        />
        {nudge && (
          <>
            <Field title={`Efter ${nudge.afterSeconds} sekunder`}>
              <input type="range" min={30} max={300} step={15} className="w-full accent-[#0071e3]" value={nudge.afterSeconds} onChange={(e) => edit((d) => void (d.nudge!.afterSeconds = Number(e.target.value)))} />
            </Field>
            <Field title="Overskrift">
              <input className={input} value={nudge.title} onChange={(e) => edit((d) => void (d.nudge!.title = e.target.value))} />
            </Field>
            <Field title="Tekst">
              <textarea className={textarea} value={nudge.text} onChange={(e) => edit((d) => void (d.nudge!.text = e.target.value))} />
            </Field>
            <ButtonsEditor
              buttons={nudge.buttons}
              rooms={rooms}
              allowRoom={false}
              onChange={(b) => edit((d) => void (d.nudge!.buttons = b.filter((x): x is { label: string; href: string; primary?: boolean } => "href" in x)))}
            />
          </>
        )}
      </Group>
    </>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Tags: a pulsing dot on a thing in the room with a card - text, photo,
 * video, price and a button (book, buy, read more). Placed by clicking the
 * spot in the preview; shown from the scan points it's picked from (and any
 * added), so it never shows through a wall. Button clicks count as actions in
 * Resultater.
 */
export function TagsEditor({ config, edit, slug, preview }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tags = config.info ?? [];
  const setTags = (t: TourInfo[]) => edit((d) => void (d.info = t.length ? t : undefined));

  async function pick(): Promise<{ position: TourInfo["position"]; ss: number | null; room: string | null } | null> {
    setError(null);
    const r = await preview.pick();
    if (r.error || !r.position) {
      if (r.error !== "Annulleret.") setError(r.error ?? "Intet sted valgt.");
      return null;
    }
    return { position: r.position, ss: r.ss ?? null, room: r.room ?? null };
  }

  return (
    <>
      <Group>
        <p className="text-[14px] leading-snug">Sæt et tag på en ting i rummet - en sofa, et produkt, en udsigt. Et tryk på prikken åbner et kort med tekst, foto, video, pris og en knap.</p>
        <button
          type="button"
          disabled={busy != null}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0071e3] py-2.5 text-[15px] font-medium text-white hover:bg-[#0077ed] disabled:opacity-50"
          onClick={async () => {
            setBusy("new");
            const at = await pick();
            setBusy(null);
            if (at) setTags([...tags, { title: "Nyt tag", text: "", position: at.position, ss: at.ss ? [at.ss] : [] }]);
          }}
        >
          <Icon d='<path d="M12 5v14M5 12h14"/>' className="h-4 w-4" />
          {busy === "new" ? "Klik i forhåndsvisningen…" : "Sæt et tag i forhåndsvisningen"}
        </button>
        {busy === "new" && <p className={small}>Klik der i rummet, hvor tagget skal sidde (Esc fortryder).</p>}
        {error && <p className="px-1 text-[12px] text-[#ff3b30]">{error}</p>}
      </Group>
      <Group title="Tags">
        <Rows<TourInfo>
          items={tags}
          onChange={setTags}
          icon={["bg-[#ff9500]", '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.5"/>']}
          title={(t) => t.title}
          subtitle={(t) => [t.price, t.video ? "video" : null, t.link?.label, t.ss.length ? `ses fra punkt ${t.ss.join(", ")}` : "ses ikke nogen steder"].filter(Boolean).join(" · ")}
          empty="Ingen tags endnu."
          editor={(t, set) => (
            <>
              <Field title="Overskrift">
                <input className={`${input} bg-white`} value={t.title} onChange={(e) => set({ ...t, title: e.target.value })} />
              </Field>
              <Field title="Tekst" hint="Kort - 1-3 sætninger.">
                <textarea className={`${textarea} bg-white`} value={t.text} onChange={(e) => set({ ...t, text: e.target.value })} />
              </Field>
              <Field title="Pris (valgfri)">
                <input className={`${input} bg-white`} placeholder="Fx Fra 495 kr./md." value={t.price ?? ""} onChange={(e) => set({ ...t, price: e.target.value || undefined })} />
              </Field>
              <PhotoPicker image={t.image ?? ""} slug={slug} photoKey={`tag-${t.title}`} preview={preview} onChange={(image) => set({ ...t, image: image || undefined })} />
              <Field title="Video (valgfri)" hint="Et YouTube- eller Vimeo-link - afspilles i kortet.">
                <input className={`${input} bg-white`} placeholder="https://youtube.com/…" value={t.video ?? ""} onChange={(e) => set({ ...t, video: e.target.value || undefined })} />
              </Field>
              <Field title="Knap (valgfri)">
                <div className="flex gap-1.5">
                  <input className={`${input} w-2/5 bg-white`} placeholder="Fx Book" value={t.link?.label ?? ""} onChange={(e) => set({ ...t, link: e.target.value || t.link?.href ? { label: e.target.value, href: t.link?.href ?? "" } : undefined })} />
                  <input className={`${input} bg-white`} placeholder="https://…" value={t.link?.href ?? ""} onChange={(e) => set({ ...t, link: e.target.value || t.link?.label ? { label: t.link?.label || "Læs mere", href: e.target.value } : undefined })} />
                </div>
              </Field>
              <Field title="Ses fra punkt" hint="Tagget vises kun fra disse scanpunkter, så det aldrig ses gennem en væg.">
                <div className="flex flex-wrap items-center gap-1.5">
                  {t.ss.map((n) => (
                    <span key={n} className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[13px] ring-1 ring-black/[.06]">
                      {n}
                      <button type="button" className="text-[#c7c7cc] hover:text-[#ff3b30]" onClick={() => set({ ...t, ss: t.ss.filter((x) => x !== n) })} aria-label="Fjern">
                        ×
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    disabled={busy != null}
                    className="rounded-full px-2.5 py-1 text-[13px] font-medium text-[#0071e3] hover:bg-[#0071e3]/10"
                    onClick={async () => {
                      setBusy("ss");
                      const r = await preview.view();
                      setBusy(null);
                      const ss = r.href ? ssOfHref(r.href) : null;
                      if (ss && !t.ss.includes(ss)) set({ ...t, ss: [...t.ss, ss] });
                    }}
                  >
                    + Punktet i forhåndsvisningen
                  </button>
                </div>
              </Field>
              <button
                type="button"
                disabled={busy != null}
                className="text-[13px] font-medium text-[#0071e3]"
                onClick={async () => {
                  setBusy("move");
                  const at = await pick();
                  setBusy(null);
                  if (at) set({ ...t, position: at.position, ss: at.ss && !t.ss.includes(at.ss) ? [...t.ss, at.ss] : t.ss });
                }}
              >
                {busy === "move" ? "Klik i forhåndsvisningen…" : "Flyt tagget"}
              </button>
            </>
          )}
        />
      </Group>
    </>
  );
}
