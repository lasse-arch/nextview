"use client";

import { LinkInput } from "./links-open";
import { StopVoice, VoiceGroup, voiceState } from "./voice-editor";
import { startStyleOf } from "../../tours/presets";
import { guideExit, IMAGE_HREF, imageOfHref, isPlaceHref, PANO_HFOV, placeHref, startPlaces } from "../../tours/places";
import { AiImageButton, AiImageList } from "./ai-image";
import { writePlaceCards, type CardDraft } from "@/lib/actions/tour-cards";
import { useEffect, useState } from "react";
import { saveTourStoryImage } from "@/lib/actions/tour-lab";
import type { DroneView, GuideTurn, PlaceCard, TourConfig, TourInfo, TourPlace, WelcomeGo } from "../../tours/types";
import type { DroneViews } from "../../tours/places";
import type { ScanMap } from "@/lib/matterport-graph";
import { ScanPointPicker } from "./scanpoints";
import { Choice, Field, Group, Icon, input, PanoZoom, Toggle, UploadButton, ssOfHref, type PreviewApi } from "./ui";

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
  return `/t/${slug}/historie?rum=${encodeURIComponent(`foto:${key}`)}&v=${Date.now()}`;
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
  /** A row moves only when picked up by its handle (⋮⋮) - dragging a slider or a 360° picture inside it never moves the row. */
  const [armed, setArmed] = useState<number | null>(null);
  useEffect(() => {
    const up = () => setArmed(null);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);
  return (
    <div className="-mx-4 divide-y divide-black/[.05] border-y border-black/[.05]">
      {items.length === 0 && <p className="px-4 py-5 text-center text-[13px] text-[#8e8e93]">{empty}</p>}
      {items.map((item, i) => (
        <div
          key={i}
          draggable={armed === i}
          onDragStart={() => setDrag(i)}
          onDragEnd={() => {
            setDrag(null);
            setOver(null);
            setArmed(null);
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
            <span className="cursor-grab text-[#c7c7cc]" title="Træk for at flytte" onPointerDown={() => setArmed(i)} onClick={(e) => e.stopPropagation()}>
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
export function PlacePicker({ href, onChange, preview, name }: { href: string; onChange: (href: string, room: string | null) => void; preview: PreviewApi; name?: string }) {
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
      <AiImageButton src={image} onUse={onChange} />
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
function ButtonsEditor({
  buttons,
  onChange,
  rooms,
  allowRoom,
  scan,
}: {
  buttons: CardButton[];
  onChange: (b: CardButton[]) => void;
  rooms: string[];
  allowRoom: boolean;
  /** A button to one scan point - also a hidden one (e.g. the same room set for a party): pick it on the scan point plan, and its link. */
  scan?: { pick: (title: string, value: number | null, apply: (ss: number) => void) => void; href: (ss: number) => string };
}) {
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
                value={"room" in b ? (isPlaceHref(b.room) ? "scan" : "room") : "href"}
                options={[
                  ["href", "Webside"],
                  ["room", "Rum i menuen"],
                  ...(scan ? [["scan", "Scanpunkt"] as ["scan", string]] : []),
                ]}
                onChange={(v) =>
                  v === "scan"
                    ? scan?.pick(b.label, null, (ss) => onChange(buttons.map((x, j) => (j === i ? { label: x.label, room: scan.href(ss) } : x))))
                    : onChange(buttons.map((x, j) => (j === i ? (v === "room" ? { label: x.label, room: rooms[0] ?? "" } : { label: x.label, href: "https://" }) : x)))
                }
              />
            )}
            {"room" in b && isPlaceHref(b.room) ? (
              <div className="flex items-center justify-between gap-2 px-1 text-[13px]">
                <span className="text-[#1d1d1f]">Scanpunkt {ssOfHref(b.room) ?? "?"}</span>
                <button
                  type="button"
                  className="font-medium text-[#0071e3]"
                  onClick={() => scan?.pick(b.label, ssOfHref(b.room), (ss) => onChange(buttons.map((x, j) => (j === i ? { label: x.label, room: scan.href(ss) } : x))))}
                >
                  Vælg på kortet
                </button>
              </div>
            ) : "room" in b ? (
              <select className={input} value={b.room} onChange={(e) => onChange(buttons.map((x, j) => (j === i ? { label: x.label, room: e.target.value } : x)))}>
                {rooms.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            ) : (
              <LinkInput value={b.href} onChange={(href) => onChange(buttons.map((x, j) => (j === i ? { ...x, href } : x)))} />
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
const SPARK_SMALL = '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>';

const menuRooms = (c: TourConfig) => c.menu.flatMap((m) => ("items" in m ? m.items : [[m.title, m.href] as [string, string]])).filter(([, h]) => isPlaceHref(h)).map(([n]) => n);

/* ------------------------------------------------------------------ */

export function StartEditor({ config, edit, slug, preview }: Props) {
  const style = startStyleOf(config);
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

  /** The tour's start: where the preview stands right now (scan point and the exact direction). */
  const [startNote, setStartNote] = useState<{ text: string; error?: boolean } | null>(null);
  async function startHere() {
    setStartNote(null);
    const view = await preview.view();
    if (view.error || !view.href) return setStartNote({ text: view.error ?? "Forhåndsvisningen svarede ikke.", error: true });
    edit((d) => void (d.start = view.href!));
    setStartNote({ text: `Touren starter nu her${view.room ? ` (${view.room})` : ""} - også retningen, du kigger i.` });
  }
  const startSs = new URLSearchParams(config.start.split("?")[1] ?? "").get("ss");
  /** Tours with an aerial photo: is there a start inside at all (switched on, or already chosen)? */
  const [startOn, setStartOn] = useState(Boolean(config.start));

  return (
    <>
      <Group title="Hvor touren starter">
        {config.drone || config.map ? (
          <>
            <p className="text-[14px] leading-snug">Touren starter på luftfotoet.</p>
            <p className={small}>Hvad man ser først på luftfotoet, sættes under Luftfoto og kort.</p>
            <Toggle
              on={startOn}
              onChange={(on) => {
                setStartOn(on);
                if (!on) edit((d) => void (d.start = ""));
              }}
              title="Startpunkt indenfor"
              hint="Til, når touren har en hel Matterport-scanning: der, hvor man lander, når man går ind uden at vælge et punkt (fx forsidens Træd indenfor), og det touren gør klar i baggrunden. Fra, når man kun går ind fra punkterne (fx Hals)."
            />
            {startOn && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <button type="button" onClick={startHere} className="flex-1 rounded-xl bg-[#0071e3] py-2 text-[14px] font-medium text-white">
                    Vælg startpunkt her
                  </button>
                  {config.start && (
                    <button type="button" onClick={() => preview.go("Start", config.start)} className="rounded-xl bg-[#f2f2f7] px-3 py-2 text-[14px] font-medium text-[#0071e3]">
                      Vis start
                    </button>
                  )}
                </div>
                <p className={`px-1 text-[12px] ${startNote?.error ? "text-[#ff3b30]" : startNote ? "text-[#34c759]" : "text-[#8e8e93]"}`}>
                  {startNote?.text ?? (startSs ? `Starter nu i scanpunkt ${startSs}.` : config.start ? "Starter et valgt sted." : "Intet startpunkt endnu - touren starter, hvor Matterport starter.")}
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-[12px] leading-snug text-[#8e8e93]">Gå hen, hvor touren skal starte, i forhåndsvisningen, og drej, så man ser det rigtige. Tryk så Vælg startpunkt her.</p>
            <div className="flex gap-2">
              <button type="button" onClick={startHere} className="flex-1 rounded-xl bg-[#0071e3] py-2 text-[14px] font-medium text-white">
                Vælg startpunkt her
              </button>
              {config.start && (
                <button type="button" onClick={() => preview.go("Start", config.start)} className="rounded-xl bg-[#f2f2f7] px-3 py-2 text-[14px] font-medium text-[#0071e3]">
                  Vis start
                </button>
              )}
            </div>
            <p className={`px-1 text-[12px] ${startNote?.error ? "text-[#ff3b30]" : startNote ? "text-[#34c759]" : "text-[#8e8e93]"}`}>
              {startNote?.text ?? (startSs ? `Starter nu i scanpunkt ${startSs}.` : config.start ? "Starter et valgt sted." : "Intet startpunkt endnu - touren starter, hvor Matterport starter.")}
            </p>
          </>
        )}
      </Group>
      {config.intro && (
        <Group title="Kort film før touren">
          <Toggle on={Boolean(config.intro)} onChange={(on) => !on && edit((d) => void (d.intro = undefined))} title="Kort film før touren" hint="Fx en drone, der flyver ned til indgangen. Slå fra for at fjerne den." />
        </Group>
      )}
      <p className={small}>Hvordan touren starter (forside, velkomst, helt enkel eller direkte ind) vælges under Layout. Her er teksterne og billederne.</p>

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
          <Group title="Fliserne - teksten over dem">
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
              title={(t) => t.title || t.place || ""}
              subtitle={(t) => t.place ? `Fra Stederne: ${t.place}` : `${t.kicker} · ${"room" in t.go ? "sted i touren" : "guide" in t.go ? "Vis mig rundt" : "href" in t.go ? "webside" : "menu" in t.go ? "menu-gruppe" : "luftfoto"}${t.recommended ? " · anbefalet" : ""}`}
              empty="Ingen fliser endnu."
              editor={(t, set) => (
                <>
                  {(() => {
                    const place = t.place ? config.places?.find((p) => p.name === t.place) : undefined;
                    return (
                      <>
                        {(config.places?.length ?? 0) > 0 && (
                          <Field title="Et af Stederne" hint={place ? "Navn, foto og sted kommer fra Stederne nedenfor - ret dem dér, så følger flisen med. Skriv kun her, hvis flisen skal sige noget andet." : "Vælg et sted, så henter flisen navn, foto og sted derfra."}>
                            <select
                              className={`${input} bg-white`}
                              value={t.place ?? ""}
                              onChange={(e) => {
                                const p = config.places?.find((x) => x.name === e.target.value);
                                set(p ? { ...t, place: p.name, title: "", kicker: "", image: undefined, go: { room: p.href, name: p.name } } : { ...t, place: undefined, title: t.title || t.place || "Ny flise" });
                              }}
                            >
                              <option value="">Ingen - flisen har sine egne</option>
                              {config.places!.map((p) => (
                                <option key={p.name} value={p.name}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </Field>
                        )}
                        <Field title="Lille overskrift">
                          <input className={`${input} bg-white`} value={t.kicker} placeholder={place?.kicker} onChange={(e) => set({ ...t, kicker: e.target.value })} />
                        </Field>
                        <Field title="Titel">
                          <input className={`${input} bg-white`} value={t.title} placeholder={place?.name} onChange={(e) => set({ ...t, title: e.target.value })} />
                        </Field>
                      </>
                    );
                  })()}
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
                      value={"room" in t.go ? "room" : "guide" in t.go ? "guide" : "day" in t.go ? "day" : "href" in t.go ? "href" : "menu" in t.go ? "menu" : "drone"}
                      options={[["room", "Sted"], ["guide", "Rundvisning"], ...(config.day ? ([["day", "Dagen"]] as [string, string][]) : []), ["menu", "Menu-gruppe"], ["href", "Webside"], ...(config.drone || config.map ? ([["drone", "Luftfoto"]] as ["drone", string][]) : [])] as [string, string][]}
                      onChange={(v) => {
                        const go: WelcomeGo = v === "room" ? { room: "", name: t.title } : v === "guide" ? { guide: true } : v === "day" ? { day: true } : v === "href" ? { href: "https://" } : v === "menu" ? { menu: config.menu.find((m) => "items" in m)?.title ?? "" } : { drone: null };
                        set({ ...t, go });
                      }}
                    />
                  </Field>
                  {"guide" in t.go && (config.guides?.length ?? 0) > 0 && (
                    <select className={`${input} bg-white`} value={t.go.guide === true ? "" : t.go.guide} onChange={(e) => set({ ...t, go: { guide: e.target.value || true } })}>
                      <option value="">Vis mig rundt</option>
                      {config.guides!.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.title}
                        </option>
                      ))}
                    </select>
                  )}
                  {"room" in t.go && !t.place && <PlacePicker href={t.go.room} name={t.title} preview={preview} onChange={(href) => set({ ...t, go: { room: href, name: t.title } })} />}
                  {"href" in t.go && <LinkInput className="bg-white" value={t.go.href} onChange={(href) => set({ ...t, go: { href } })} />}
                  {"menu" in t.go && (
                    <select className={`${input} bg-white`} value={t.go.menu} onChange={(e) => set({ ...t, go: { menu: e.target.value } })}>
                      <option value="">Bare menuen</option>
                      {config.menu.flatMap((m) => ("items" in m ? [m.title] : [])).map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  )}
                  {"drone" in t.go && <DroneViewPicker views={t.go.view} preview={preview} onChange={(view) => set({ ...t, go: { drone: (t.go as { drone: string | null }).drone, view } })} />}
                </>
              )}
            />
            <button type="button" className={`${linkButton} w-full`} onClick={() => edit((d) => void d.welcome!.tiles.push({ kicker: "", title: "Ny flise", go: { guide: true }, style: "light" }))}>
              + Flise
            </button>
          </Group>
        </>
      )}

      {(style === "cover" || style === "tiles" || style === "simple" || menuStyle === "dock" || (config.places?.length ?? 0) > 0) && (
      <Group title="Steder">
        <p className={small}>
          Hvert sted skrives én gang her - med navn, foto og sted i touren. Forsidens steder, barens &quot;Steder&quot; og velkomstfliserne (vælg &quot;Et af Stederne&quot; på flisen) henter herfra. Det er ikke menuen (den laves under Menu). Gå hen til et sted i forhåndsvisningen og tryk på knappen - så kommer både stedet og et foto med.
        </p>
        <Rows<TourPlace>
          items={config.places ?? []}
          onChange={(places) =>
            edit((d) => {
              // Welcome tiles follow their place: a new name is carried over, a removed place leaves the tile its own name.
              const before = d.places ?? [];
              const renamed = new Map(before.length === places.length ? before.map((p, i) => [p.name, places[i].name] as const).filter(([a, b]) => a !== b) : []);
              d.welcome?.tiles.forEach((t) => {
                if (!t.place) return;
                if (renamed.has(t.place)) t.place = renamed.get(t.place);
                else if (!places.some((p) => p.name === t.place)) {
                  const old = before.find((p) => p.name === t.place);
                  t.title ||= t.place;
                  t.kicker ||= old?.kicker ?? "";
                  t.image ??= old?.image;
                  t.place = undefined;
                }
              });
              d.places = places.length ? places : undefined;
            })
          }
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
          {busy ? "Henter sted og foto…" : "Tilføj stedet, du ser, med foto"}
        </button>
        {error && <p className="px-1 text-[12px] text-[#ff3b30]">{error}</p>}
      </Group>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

type Stop = NonNullable<TourConfig["guide"]>["stops"][number];

/**
 * Where something leading to the drone picture turns it. By default one view
 * for both devices (the other device's zoom made to fit its screen); "Kun
 * computer/mobil" sets just the device the preview is on.
 */
export function DroneViewPicker({ views, preview, onChange, what = "flisen" }: { views: DroneViews | undefined; preview: PreviewApi; onChange: (views: DroneViews | undefined) => void; what?: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [only, setOnly] = useState(false);
  const device = preview.device() === "mobil" ? "mobile" : "desktop";
  const name = (k: "desktop" | "mobile") => (k === "desktop" ? "computer" : "mobil");
  const set = (key: "desktop" | "mobile", v: DroneView | undefined) => {
    const view = { ...views, [key]: v };
    if (!v) delete view[key];
    onChange(view.desktop || view.mobile ? view : undefined);
  };
  /** The same spot on the other device: a phone is narrow, so it sees it with less width (as 360° photos open). */
  const other = (v: DroneView, to: "desktop" | "mobile"): DroneView => {
    const f = to === "mobile" ? PANO_HFOV.mobile / PANO_HFOV.desktop : PANO_HFOV.desktop / PANO_HFOV.mobile;
    return { ...v, hfov: Math.round(Math.max(30, Math.min(120, v.hfov * f)) * 10) / 10 };
  };
  const both = !only;
  return (
    <Field title="Udsnit af luftfotoet" hint={`Drej og zoom luftfotoet i forhåndsvisningen til det, ${what} skal vise, og tryk. Det gælder både computer og mobil - vælg "Kun ${name(device)}" for at rette den ene for sig (skift enhed øverst over forhåndsvisningen). Uden udsnit vises luftfotoets første udsnit.`}>
      <div className="space-y-1.5">
        <div className="flex rounded-[9px] bg-[#e9e9eb] p-[2px] text-[12px] font-medium">
          {([
            [false, "Begge"],
            [true, `Kun ${name(device)}`],
          ] as const).map(([v, label]) => (
            <button key={label} type="button" onClick={() => setOnly(v)} className={`flex-1 rounded-[7px] py-1 ${only === v ? "bg-white shadow" : "text-[#1d1d1f]/70"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <button type="button" className={`${linkButton} flex-1`} onClick={() => preview.go("", "#luften")}>
            Vis luftfotoet
          </button>
          <button
            type="button"
            className={`${linkButton} flex-1`}
            onClick={async () => {
              setMsg(null);
              const v = await preview.droneView();
              if (v.error || v.yaw == null || v.pitch == null || v.hfov == null) return setMsg(v.error ?? "Kunne ikke læse udsnittet.");
              const here: "desktop" | "mobile" = v.phone ? "mobile" : "desktop";
              const view = { yaw: v.yaw, pitch: v.pitch, hfov: v.hfov };
              if (both) {
                const there = here === "mobile" ? "desktop" : "mobile";
                onChange({ [here]: view, [there]: other(view, there) });
                setMsg("Gemt for computer og mobil.");
              } else {
                set(here, view);
                setMsg(`Gemt kun for ${name(here)}.`);
              }
            }}
          >
            Brug dette udsnit
          </button>
        </div>
        <div className="flex items-center gap-2 px-1 text-[12px] text-[#8e8e93]">
          <span className="flex-1">
            {!views?.desktop && !views?.mobile
              ? "Første udsnit (intet eget)"
              : (["desktop", "mobile"] as const).map((k) => `${name(k)[0].toUpperCase()}${name(k).slice(1)}: ${views?.[k] ? "eget" : "første"}`).join(" · ")}
          </span>
          {(views?.desktop || views?.mobile) && (
            <button type="button" className="text-[#ff3b30]" onClick={() => (only ? set(device, undefined) : onChange(undefined))}>
              {only ? `Nulstil ${name(device)}` : "Nulstil"}
            </button>
          )}
        </div>
        {msg && <p className={small}>{msg}</p>}
      </div>
    </Field>
  );
}

/**
 * A guide stop at a point on the aerial photo: what it shows - the point's
 * 360° photo and its photos - changed right here (upload, remove, AI). The
 * same pictures as the point's own (one place in the setup); its text and
 * position are changed at the point under Luftfoto og kort.
 */
function PointStop({ config, id, edit, onEdit, preview }: { config: TourConfig; id: string; edit: Props["edit"]; onEdit?: (id: string) => void; preview: PreviewApi }) {
  const p = config.points.find((x) => x.id === id);
  if (!p) return <p className={small}>Punktet findes ikke længere på luftfotoet.</p>;
  const proto = !p.panorama && p.pano && config.panos ? `${config.panos.basePath}/${p.pano}-360.jpg` : null;
  const pano = p.panorama ?? proto;
  const setPoint = (fn: (x: (typeof config.points)[number]) => void) =>
    edit((d) => {
      const x = d.points.find((y) => y.id === id);
      if (x) fn(x);
    });
  /** A new 360° photo for the point - a prototype's tiles are replaced by it, its start direction kept. */
  const setPano = (url: string) =>
    edit((d) => {
      const x = d.points.find((y) => y.id === id);
      if (!x) return;
      if (x.panoStart) d.imageView = { ...d.imageView, [url]: { ...d.imageView?.[url], yaw: x.panoStart.yaw, pitch: x.panoStart.pitch } };
      x.panorama = url;
      delete x.pano;
      delete x.panoStart;
    });
  const images = p.images ?? [];
  return (
    <div className="space-y-3">
      <Field title="360°-billede" hint="Det, gæsten ser ved stoppet. Et 360°-foto (2:1).">
        {pano ? (
          <div className="space-y-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pano} alt="" className="aspect-[2/1] w-full rounded-lg object-cover ring-1 ring-black/[.06]" onError={(e) => (e.currentTarget.style.display = "none")} />
            <div className="flex flex-wrap items-center gap-2">
              <UploadButton accept="image/*" label="Skift 360°-billede" onDone={setPano} />
              <AiImageButton src={pano} onUse={setPano} />
            </div>
            {/* Where it looks and how close when the stop opens - per picture, as everywhere in the tour. */}
            <PanoZoom
              src={pano}
              name={p.name}
              preview={preview}
              value={config.imageView?.[pano] ?? (p.panoStart ? { yaw: p.panoStart.yaw, pitch: p.panoStart.pitch } : undefined)}
              onChange={(z) =>
                edit((d) => {
                  const x = d.points.find((y) => y.id === id);
                  // A prototype's tiles become a plain 360° photo here, so the view can be kept with it.
                  if (x && !x.panorama && proto) {
                    x.panorama = proto;
                    delete x.pano;
                    delete x.panoStart;
                  }
                  const all = { ...d.imageView };
                  if (z) all[pano] = z;
                  else delete all[pano];
                  d.imageView = Object.keys(all).length ? all : undefined;
                })
              }
            />
          </div>
        ) : p.pano ? (
          <p className={small}>360°-billedet er fra prototypen og kan ikke vises her - upload et nyt for at skifte det.</p>
        ) : null}
        {!pano && <UploadButton accept="image/*" label="Upload 360°-billede" onDone={setPano} />}
      </Field>
      {/* Where "Gå ind" goes in the tour from this point - and where the guide goes in, when it does. */}
      <div className="space-y-1">
        <PlacePicker href={p.tour ?? ""} name={p.name} preview={preview} onChange={(href) => setPoint((x) => void (x.tour = href))} />
        <p className={small}>
          {p.tour ? 'Her starter touren, når man trykker "Gå ind" ved punktet.' : 'Punktet har intet sted i touren endnu - så er der ingen "Gå ind".'}{" "}
          {p.tour && (
            <button type="button" className="text-[#0071e3] hover:underline" onClick={() => setPoint((x) => void (x.tour = null))}>
              Fjern stedet
            </button>
          )}
        </p>
      </div>
      <Field title="Billeder på punktets kort" hint="Det første vises først. Tryk × for at fjerne et.">
        {images.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5">
            {images.map((src, i) => (
              <div key={src} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="aspect-[4/3] w-full rounded-lg object-cover ring-1 ring-black/[.06]" />
                <button
                  type="button"
                  aria-label="Fjern billedet"
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-[14px] text-white"
                  onClick={() => setPoint((x) => void (x.images = (x.images ?? []).filter((_, j) => j !== i)))}
                >
                  ×
                </button>
                {i > 0 && (
                  <button
                    type="button"
                    className="absolute bottom-1 left-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white"
                    onClick={() => setPoint((x) => void (x.images = [src, ...(x.images ?? []).filter((y) => y !== src)]))}
                  >
                    Vis først
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <UploadButton accept="image/*" label="Tilføj billede" onDone={(url) => setPoint((x) => void (x.images = [...(x.images ?? []), url]))} />
          <AiImageList images={images} onReplace={(i, url) => setPoint((x) => void (x.images = (x.images ?? []).map((y, j) => (j === i ? url : y))))} />
        </div>
      </Field>
      <p className={small}>Punktets tekst og placering rettes ved punktet under Luftfoto og kort.</p>
      {onEdit && config.map && (
        <button type="button" onClick={() => onEdit(id)} className="w-full rounded-xl bg-[#f2f2f7] py-2 text-[14px] font-medium text-[#0071e3]">
          Åbn punktet på luftfotoet
        </button>
      )}
    </div>
  );
}

/**
 * "Vis mig rundt": the main guided tour and any more (`guides`, e.g. one per
 * linjefag) - pick one at the top, and the editor below edits that one.
 */
export function GuideEditor({ config, edit, preview, onEditPoint }: Omit<Props, "slug"> & { onEditPoint?: (id: string) => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const extra = sel != null ? config.guides?.find((g) => g.id === sel) : undefined;
  // The one picked is edited as if it were `guide`: a copy with it there, and what changed written back to it (anything else the editor changed, too).
  const view: TourConfig = extra ? { ...config, guide: extra } : config;
  const editPicked: Edit = extra
    ? (fn) =>
        edit((d) => {
          const i = d.guides!.findIndex((g) => g.id === extra.id);
          if (i < 0) return;
          const tmp = { ...d, guide: d.guides![i] } as TourConfig;
          fn(tmp);
          for (const k of Object.keys(d) as (keyof TourConfig)[]) if (!(k in tmp) && k !== "guide") delete d[k];
          for (const [k, v] of Object.entries(tmp)) if (k !== "guide") (d as Record<string, unknown>)[k] = v;
          d.guides![i] = { ...(tmp.guide ?? { stops: [] }), id: extra.id, title: d.guides![i].title };
        })
    : edit;
  const newId = () => {
    let n = (config.guides?.length ?? 0) + 1;
    while (config.guides?.some((g) => g.id === `rundvisning-${n}`)) n++;
    return `rundvisning-${n}`;
  };
  const pill = (on: boolean) => `rounded-full px-3 py-1.5 text-[13px] font-medium ${on ? "bg-[#0071e3] text-white" : "bg-white text-[#1d1d1f] ring-1 ring-black/[.08]"}`;
  return (
    <>
      <Group title="Rundvisninger">
        <Field title="Kortets størrelse" hint="Kortet med teksten ved hvert stop - gælder alle rundvisninger. Skalerer altid med skærmen.">
          <Choice
            value={config.guideCardSize ?? "mellem"}
            options={[
              ["lille", "Lille"],
              ["mellem", "Mellem"],
              ["stor", "Stor"],
            ]}
            onChange={(v) => edit((d) => void (d.guideCardSize = v === "mellem" ? undefined : (v as "lille" | "stor")))}
          />
        </Field>
        <p className={small}>Touren kan have flere rundvisninger - fx én for hele stedet og én pr. linjefag. Menuen får en knap til hver. Vælg den, du vil rette.</p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={pill(!extra)} onClick={() => setSel(null)}>
            Vis mig rundt
          </button>
          {config.guides?.map((g) => (
            <button key={g.id} type="button" className={pill(extra?.id === g.id)} onClick={() => setSel(g.id)}>
              {g.title || "Uden navn"}
            </button>
          ))}
          <button
            type="button"
            className="rounded-full px-3 py-1.5 text-[13px] font-medium text-[#0071e3] hover:bg-[#0071e3]/5"
            onClick={() => {
              const id = newId();
              edit((d) => void (d.guides = [...(d.guides ?? []), { id, title: "Ny rundvisning", stops: [] }]));
              setSel(id);
            }}
          >
            + Ny rundvisning
          </button>
        </div>
        {extra && (
          <>
            <Field title="Navn" hint="Står på knappen i menuen, fx Padel.">
              <input className={`${input} bg-white`} value={extra.title} onChange={(e) => edit((d) => void (d.guides = d.guides!.map((g) => (g.id === extra.id ? { ...g, title: e.target.value } : g))))} />
            </Field>
            <p className={small}>
              En flise på velkomsten kan starte netop denne (vælg den under flisen), og ethvert link kan starte den, fx en knap eller et menupunkt: <code className="rounded bg-black/5 px-1">#rundvisning:{extra.id}</code>
            </p>
            <button
              type="button"
              className="self-start text-[13px] text-[#ff3b30] hover:underline"
              onClick={() => {
                if (!confirm(`Slet rundvisningen "${extra.title}"?`)) return;
                edit((d) => {
                  d.guides = d.guides!.filter((g) => g.id !== extra.id);
                  if (!d.guides.length) d.guides = undefined;
                  // Tiles that started it start the main one instead.
                  d.welcome?.tiles.forEach((t) => {
                    if ("guide" in t.go && t.go.guide === extra.id) t.go = { guide: true };
                  });
                });
                setSel(null);
              }}
            >
              Slet rundvisningen
            </button>
          </>
        )}
      </Group>
      <GuideSetupEditor key={extra?.id ?? ""} config={view} edit={editPicked} preview={preview} onEditPoint={onEditPoint} />
      <DayEditor config={config} edit={edit} preview={preview} />
    </>
  );
}

/** One guided tour's settings and stops (shown as `config.guide`). */
function GuideSetupEditor({ config, edit, preview, onEditPoint }: Omit<Props, "slug"> & { onEditPoint?: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stops = config.guide?.stops ?? [];
  const fromMenu = Boolean(config.guide?.fromMenu);
  const places = startPlaces(config);
  const setStops = (s: Stop[]) => edit((d) => void (d.guide = s.length || d.guide?.fromMenu ? { ...d.guide, stops: s } : undefined));
  const turnOptions: [string, string][] = [
    ["as", "Drej som nu"],
    ["other", "Drej den anden vej"],
    ["none", "Drej ikke"],
  ];
  return (
    <>
      <Group>
        <p className="text-[14px] leading-snug text-[#1d1d1f]">&quot;Vis mig rundt&quot; flyver fra stop til stop med en kort tekst ved hvert - og en stemme, hvis stoppet har en lydfil. Som en rundvisning med en medarbejder.</p>
        <p className={small}>Hold den kort: 4-7 stop, der fortæller en historie og slutter der, hvor man skal handle (fx book, bliv elev).</p>
        {(stops.length > 0 || fromMenu) && <MenuPlace value={config.guide?.menu} onChange={(v) => edit((d) => void (d.guide = { ...d.guide!, menu: v }))} link="#rundvisning" />}
        <Toggle
          on={fromMenu}
          onChange={(on) => edit((d) => void (d.guide = on ? { ...d.guide, stops: d.guide?.stops ?? [], fromMenu: true } : d.guide?.stops.length ? { ...d.guide, fromMenu: undefined, menuPlaces: undefined, menuTurns: undefined } : undefined))}
          title="Lav den ud fra menuen"
          hint="Ét stop pr. sted i menuen, i menuens rækkefølge. Vælg nedenfor, hvilke der skal med."
        />
        {(stops.length > 0 || fromMenu) && (
          <Field title="Ved hvert stop">
            <Choice value={config.guide?.turn ?? "as"} options={turnOptions} onChange={(v) => edit((d) => void (d.guide = { ...d.guide!, turn: v === "as" ? undefined : (v as GuideTurn) }))} />
          </Field>
        )}
        {(stops.length > 0 || fromMenu) && (
          <Field title='"Træk i billedet for at se dig omkring"' hint="Hjælpeteksten på guidens kort inde i touren - ved de første stop, ved alle eller aldrig.">
            <Choice
              value={config.guide?.walkHint === "all" ? "all" : config.guide?.walkHint === "none" ? "none" : "first"}
              options={[
                ["first", "Ved de første"],
                ["all", "Ved alle"],
                ["none", "Aldrig"],
              ]}
              onChange={(v) => edit((d) => void (d.guide = { ...d.guide!, walkHint: v === "first" ? undefined : (v as "all" | "none") }))}
            />
            {typeof config.guide?.walkHint !== "string" && (
              <label className="mt-2 flex items-center gap-2 text-[13px] text-[#6e6e73]">
                Antal stop
                <input
                  type="number"
                  min={1}
                  max={50}
                  className={`${input} bg-white py-1.5 text-right`}
                  style={{ width: 80, flex: "none" }}
                  value={config.guide?.walkHint ?? 2}
                  onChange={(e) => {
                    const n = Math.round(Number(e.target.value));
                    if (n >= 1 && n <= 50) edit((d) => void (d.guide = { ...d.guide!, walkHint: n === 2 ? undefined : n }));
                  }}
                />
              </label>
            )}
          </Field>
        )}
        {(stops.length > 0 || fromMenu) && (
          <Toggle
            on={Boolean(config.guide?.manual)}
            onChange={(on) => edit((d) => void (d.guide = { ...d.guide!, manual: on || undefined }))}
            title="Man trykker selv videre"
            hint="Roligt tempo - godt til en stemme-rundvisning. Stop med lyd venter altid på, at stemmen er færdig."
          />
        )}
        {(stops.length > 0 || fromMenu) && (config.drone || config.map) && (
          <Field title="Knappen, der stopper guiden" hint="Tilbage til luften: til tours, hvor man ikke kan gå rundt selv (fx kun 360°-billeder på luftfotoet).">
            <Choice
              value={guideExit(config)}
              options={[
                ["self", "Gå selv rundt"],
                ["overview", "Tilbage til luften"],
              ]}
              onChange={(v) => edit((d) => void (d.guide = { ...d.guide!, exit: v === "overview" ? "overview" : "self" }))}
            />
          </Field>
        )}
        {stops.length > 0 && !config.guide?.manual && (
          <Field title={`Sekunder ved hvert stop: ${config.guide?.seconds ?? 8}`}>
            <input type="range" min={4} max={20} className="w-full accent-[#0071e3]" value={config.guide?.seconds ?? 8} onChange={(e) => edit((d) => void (d.guide = { ...d.guide!, seconds: Number(e.target.value) }))} />
          </Field>
        )}
      </Group>
      {!fromMenu && <VoiceGroup config={config} edit={edit} />}
      {fromMenu ? (
        <Group title={`Steder fra menuen (${(config.guide?.menuPlaces ?? places.map((p) => p.key)).filter((n) => places.some((p) => p.key === n)).length} af ${places.length})`}>
          {places.length === 0 && <p className={small}>Menuen har ingen steder i touren endnu.</p>}
          <ul className="-mx-1 divide-y divide-black/[.05]">
            {places.map((p) => {
              const picked = config.guide?.menuPlaces ? config.guide.menuPlaces.includes(p.key) : true;
              return (
                <li key={p.key} className="flex items-center gap-2 px-1 py-2">
                  <input
                    type="checkbox"
                    checked={picked}
                    className="h-4 w-4 accent-[#0071e3]"
                    onChange={(e) =>
                      edit((d) => {
                        const all = places.map((x) => x.key);
                        const now = new Set(d.guide!.menuPlaces ?? all);
                        if (e.target.checked) now.add(p.key);
                        else now.delete(p.key);
                        d.guide!.menuPlaces = now.size === all.length ? undefined : all.filter((n) => now.has(n));
                      })
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px]">{p.name}</span>
                    {p.group && <span className="block truncate text-[12px] text-[#8e8e93]">{p.group}</span>}
                  </span>
                  {picked && (
                    <select
                      value={config.guide?.menuTurns?.[p.key] ?? ""}
                      onChange={(e) =>
                        edit((d) => {
                          const turns = { ...d.guide!.menuTurns };
                          if (e.target.value) turns[p.key] = e.target.value as GuideTurn;
                          else delete turns[p.key];
                          d.guide!.menuTurns = Object.keys(turns).length ? turns : undefined;
                        })
                      }
                      className="rounded-lg bg-[#f2f2f7] px-2 py-1 text-[12px]"
                      title="Drejning ved dette stop"
                    >
                      <option value="">Som ovenfor</option>
                      {turnOptions.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  )}
                </li>
              );
            })}
          </ul>
        </Group>
      ) : (
      <Group title="Stop">
        <Rows<Stop>
          items={stops}
          onChange={setStops}
          icon={["bg-[#ff2d55]", '<path d="M8 5v14l11-7z"/>']}
          title={(s) => ("point" in s ? (config.points.find((p) => p.id === s.point)?.name ?? `Punkt: ${s.point}`) : s.title)}
          subtitle={(s) => ("point" in s ? "Punkt på luftfotoet - tekst og billeder fra punktet" : [s.audio ? (voiceState(s) === "old" ? "🔇 lav lyden igen" : "🔊") : null, s.href ? null : "Bliver stående", s.text || "Mangler tekst"].filter(Boolean).join(" · "))}
          empty='Ingen stop endnu. Gå til det første sted i forhåndsvisningen og tryk "+ Stop her".'
          editor={(s, set) =>
            "point" in s ? (
              <>
                <PointStop config={config} id={s.point} edit={edit} onEdit={onEditPoint} preview={preview} />
                <Field title="Drejning ved stoppet" hint="Om billedet drejer langsomt rundt, mens stoppet vises.">
                  <Choice value={s.turn ?? ""} options={[["", "Som de andre"], ...turnOptions]} onChange={(v) => set({ ...s, turn: v ? (v as GuideTurn) : undefined })} />
                </Field>
              </>
            ) : (
              <>
                <Field title="Titel">
                  <input className={`${input} bg-white`} value={s.title} onChange={(e) => set({ ...s, title: e.target.value })} />
                </Field>
                <Field title={s.audio ? "Tekst - det stemmen siger" : "Tekst"} hint={s.audio ? "Retter du den, holder stemmen op med at spille. Skal skærmen sige det kortere, så brug feltet herunder." : "1-2 korte sætninger."}>
                  <textarea className={`${textarea} bg-white`} value={s.text} onChange={(e) => set({ ...s, text: e.target.value })} />
                </Field>
                <Field title="Kort tekst på skærmen (valgfri)" hint="Vises på kortet i stedet for teksten ovenfor - stemmen spiller videre som før. Fx korte, konkrete sætninger med én ting i hver.">
                  <textarea className={`${textarea} bg-white`} value={s.short ?? ""} placeholder="Tom: teksten ovenfor vises" onChange={(e) => set({ ...s, short: e.target.value || undefined })} />
                </Field>
                {imageOfHref(s.href) ? (
                  <StopPicture config={config} url={imageOfHref(s.href)!} onChange={(url) => set({ ...s, href: url ? IMAGE_HREF + url : "" })} />
                ) : s.href ? (
                  <>
                    <PlacePicker href={s.href} name={s.title} preview={preview} onChange={(href) => set({ ...s, href })} />
                    <button type="button" className="text-[12px] text-[#8e8e93] hover:text-[#ff3b30]" onClick={() => set({ ...s, href: "" })}>
                      Bliv stående (intet sted - fx et afslutningskort)
                    </button>
                  </>
                ) : (
                  <PlacePicker href="" name={s.title} preview={preview} onChange={(href) => set({ ...s, href })} />
                )}
                {!imageOfHref(s.href) && <StopPicture config={config} url={null} onChange={(url) => url && set({ ...s, href: IMAGE_HREF + url })} />}
                {s.href && !imageOfHref(s.href) && (
                  <Field title="Drejning ved stoppet">
                    <Choice value={s.turn ?? ""} options={[["", "Som de andre"], ...turnOptions]} onChange={(v) => set({ ...s, turn: v ? (v as GuideTurn) : undefined })} />
                  </Field>
                )}
                <Field title="Egen knap (valgfri)" hint="Fx &quot;Se alle linjer&quot; til jeres side om linjerne. På det sidste stop står den i stedet for tourens hovedknap.">
                  <input
                    className={`${input} bg-white`}
                    placeholder="Tekst på knappen"
                    value={s.button?.label ?? ""}
                    onChange={(e) => set({ ...s, button: e.target.value || s.button?.href ? { label: e.target.value, href: s.button?.href ?? "" } : undefined })}
                  />
                  <LinkInput className="mt-1.5 bg-white" value={s.button?.href ?? ""} onChange={(href) => set({ ...s, button: href || s.button?.label ? { label: s.button?.label ?? "", href } : undefined })} />
                </Field>
                <StopVoice
                  config={config}
                  stop={s}
                  set={set}
                  upload={<UploadButton accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,.mp3,.m4a" label={s.audio ? "Upload anden lyd" : "Upload lydfil"} onDone={(audio) => set({ ...s, audio, audioText: undefined })} />}
                />
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
          {busy ? "Henter stedet…" : "Stop her"}
        </button>
        {error && <p className="px-1 text-[12px] text-[#ff3b30]">{error}</p>}
      </Group>
      )}
    </>
  );
}

/**
 * A picture as a stop (e.g. a drone photo): one the menu already opens, or a
 * new upload. Shown full screen - a 2:1 one as 360°.
 */
function StopPicture({ config, url, onChange }: { config: TourConfig; url: string | null; onChange: (url: string | null) => void }) {
  const known = [
    ...config.menu.flatMap((m): [string, string][] => ("items" in m ? m.items.map(([n, h]): [string, string] => [`${m.title}: ${n}`, h]) : [[m.title, m.href]])),
    ...(config.bento?.tiles.map((t): [string, string] => [`Flise: ${t.title.replace(/\n/g, " ")}`, t.href]) ?? []),
  ].flatMap(([label, h]) => {
    const u = imageOfHref(h);
    return u ? [{ label, url: u }] : [];
  });
  const pictures = known.filter((p, i) => known.findIndex((q) => q.url === p.url) === i);
  return (
    <Field title={url ? "Billede" : "Eller vis et billede (fx et dronefoto)"} hint={url ? "Vises i fuld skærm ved stoppet - et 2:1-billede som 360°. Hentes i baggrunden, før man når hertil." : undefined}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={config.panoCopies?.[url]?.phone ?? url} alt="" className="mb-2 max-h-40 w-full rounded-lg object-cover" />
      )}
      <div className="flex flex-wrap items-center gap-2">
        {pictures.length > 0 && (
          <select className={`${input} bg-white py-1.5 text-[13px]`} value={pictures.some((p) => p.url === url) ? url! : ""} onChange={(e) => e.target.value && onChange(e.target.value)}>
            <option value="">{url ? "Et andet fra menuen …" : "Et billede fra menuen …"}</option>
            {pictures.map((p) => (
              <option key={p.url} value={p.url}>
                {p.label}
              </option>
            ))}
          </select>
        )}
        <UploadButton accept="image/jpeg,image/png,image/webp" label={url ? "Skift billede" : "Upload billede"} onDone={(u) => onChange(u)} />
        {url && <AiImageButton src={url} onUse={(u) => onChange(u)} />}
        {url && (
          <button type="button" className="text-[13px] text-[#ff3b30] hover:underline" onClick={() => onChange(null)}>
            Fjern billedet
          </button>
        )}
      </div>
    </Field>
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
      <MenuPlace value={day.menu} onChange={(v) => edit((d) => void (d.day!.menu = v))} link="#dag" />
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

export function CardsEditor({ config, edit, preview, scanMap, mpskinsHidden }: Omit<Props, "slug"> & { scanMap: ScanMap | null; mpskinsHidden: string[] }) {
  const [busy, setBusy] = useState<number | "new" | "all" | null>(null);
  /** "Vælg på kortet": the big scan point plan, picking the points a card shows at. */
  const [picking, setPicking] = useState<{ title: string; value: number[]; apply: (ss: number[]) => void } | null>(null);
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
  /** The menu's places: name and scan point. */
  const menuPlaces = config.menu
    .flatMap((m) => ("items" in m ? m.items : [[m.title, m.href] as [string, string]]))
    .flatMap(([name, href]) => (isPlaceHref(href) && ssOfHref(href) ? [{ name, ss: ssOfHref(href)! }] : []));
  const nameAt = (ss: number) => menuPlaces.find((p) => p.ss === ss)?.name ?? null;
  /** nextviewAI writes the card for one place, with a picture of it from the preview (flown there first unless `there`). */
  async function aiCard(ss: number, there = false): Promise<CardDraft | null> {
    setError(null);
    if (!there) {
      preview.go(nameAt(ss) ?? `Punkt ${ss}`, placeHref(config, ss));
      await new Promise((r) => setTimeout(r, 3500)); // let the room's sharp pictures load
    }
    const shot = await preview.shot().catch(() => ({ image: undefined }));
    const r = await writePlaceCards(config.slug, config, [{ ss, name: nameAt(ss), image: shot.image }]);
    if (!r.ok) {
      setError(r.error);
      return null;
    }
    return r.cards[0];
  }
  /** Places in the menu that don't have a card yet. */
  const withoutCard = menuPlaces.filter((p, i) => menuPlaces.findIndex((x) => x.ss === p.ss) === i && !cards.some((c) => c.ss.includes(p.ss)));
  return (
    <>
      {picking && scanMap && (
        <ScanPointPicker
          map={scanMap}
          config={config}
          mpskinsHidden={mpskinsHidden}
          title={picking.title}
          value={picking.value}
          onClose={() => setPicking(null)}
          onDone={(ss) => {
            picking.apply(ss);
            setPicking(null);
          }}
        />
      )}
      <Group title="Stedkort">
        <p className={small}>Et lille kort, der kommer frem, når man lander et bestemt sted - med en tekst om stedet og evt. knapper. Det forsvinder selv igen.</p>
        <Field title="Størrelse" hint="Gælder alle stedkort og kortet, der kommer af sig selv. De skalerer altid med skærmen - en lille telefon får et mindre kort.">
          <Choice
            value={config.placeCardSize ?? "mellem"}
            options={[
              ["lille", "Lille"],
              ["mellem", "Mellem"],
              ["stor", "Stor"],
            ]}
            onChange={(v) => edit((d) => void (d.placeCardSize = v === "mellem" ? undefined : (v as "lille" | "stor")))}
          />
        </Field>
        <Rows<PlaceCard>
          items={cards}
          onChange={(c) => edit((d) => void (d.placeCards = c.length ? c : undefined))}
          icon={["bg-[#5856d6]", '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 10h8M8 14h5"/>']}
          title={(c) => c.title}
          subtitle={(c) => `Ved punkt ${c.ss.join(", ") || "?"}`}
          empty="Ingen stedkort endnu."
          editor={(c, set) => (
            <>
              <button
                type="button"
                disabled={busy != null || !c.ss.length}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#d97757]/10 py-2 text-[14px] font-medium text-[#b4532f] hover:bg-[#d97757]/15 disabled:opacity-50"
                onClick={async () => {
                  setBusy(cards.indexOf(c));
                  const draft = await aiCard(c.ss[0]);
                  setBusy(null);
                  if (draft) set({ ...c, title: draft.title, text: draft.text, more: draft.more ?? c.more, buttons: c.buttons ?? draft.buttons });
                }}
              >
                <Icon d={SPARK_SMALL} className="h-4 w-4" />
                {busy === cards.indexOf(c) ? "nextviewAI kigger på stedet…" : "Skriv kortet med nextviewAI"}
              </button>
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
                  {scanMap && (
                    <button
                      type="button"
                      className="rounded-full px-2.5 py-1 text-[13px] font-medium text-[#0071e3] hover:bg-[#0071e3]/10"
                      onClick={() => setPicking({ title: c.title || "Stedkort", value: c.ss, apply: (ss) => set({ ...c, ss }) })}
                    >
                      Vælg på kortet
                    </button>
                  )}
                </div>
              </Field>
              <details className="text-[13px]">
                <summary className="cursor-pointer select-none text-[#0071e3]">&quot;Læs mere&quot;-side (valgfri)</summary>
                <div className="mt-2 space-y-2">
                  <input className={`${input} bg-white`} placeholder="Knaptekst, fx Læs mere" value={c.more?.label ?? ""} onChange={(e) => set({ ...c, more: e.target.value || c.more?.text ? { label: e.target.value, text: c.more?.text ?? "" } : undefined })} />
                  <textarea className={`${textarea} bg-white`} placeholder="Den lange tekst" value={c.more?.text ?? ""} onChange={(e) => set({ ...c, more: { label: c.more?.label || "Læs mere", text: e.target.value } })} />
                </div>
              </details>
              <ButtonsEditor
                buttons={c.buttons ?? []}
                rooms={rooms}
                allowRoom
                scan={scanMap ? { pick: (title, value, apply) => setPicking({ title: `Knappen "${title}": vælg ét scanpunkt`, value: value != null ? [value] : [], apply: (ss) => ss.length && apply(ss[ss.length - 1]) }), href: (ss) => placeHref(config, ss) } : undefined}
                onChange={(b) => set({ ...c, buttons: b.length ? b : undefined })}
              />
              {c.buttons?.some((b) => "room" in b && isPlaceHref(b.room)) && (
                <p className={small}>Et scanpunkt kan også være et skjult - fx samme rum filmet opdækket. Knappen viser det, og man kommer tilbage ved at gå videre i touren.</p>
              )}
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
            // nextviewAI writes it from what the preview shows right now; without it, an empty card to fill in.
            const draft = ss ? await aiCard(ss, true) : null;
            setBusy(null);
            if (ss) edit((d) => void (d.placeCards = [...(d.placeCards ?? []), draft ?? { ss: [ss], title: "Nyt stedkort", text: "" }]));
          }}
        >
          <Icon d='<path d="M12 5v14M5 12h14"/>' className="h-4 w-4" />
          {busy === "new" ? "nextviewAI skriver kortet…" : "Nyt kort ved stedet, du ser"}
        </button>
        {withoutCard.length > 0 && (
          <button
            type="button"
            disabled={busy != null}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-[14px] font-medium text-[#b4532f] ring-1 ring-black/[.06] hover:bg-[#d97757]/5 disabled:opacity-50"
            onClick={async () => {
              setBusy("all");
              setError(null);
              const r = await writePlaceCards(config.slug, config, withoutCard.map((p) => ({ ss: p.ss, name: p.name })));
              setBusy(null);
              if (!r.ok) return setError(r.error);
              edit((d) => void (d.placeCards = [...(d.placeCards ?? []), ...r.cards]));
            }}
          >
            <Icon d={SPARK_SMALL} className="h-4 w-4" />
            {busy === "all" ? `nextviewAI skriver ${withoutCard.length} kort…` : `Lad nextviewAI skrive kort til menuens ${withoutCard.length} steder`}
          </button>
        )}
        <p className={small}>nextviewAI skriver ud fra stedet, menuen og kundens hjemmeside. Ret gerne teksten bagefter - intet gemmes, før du trykker Gem.</p>
        {error && <p className="px-1 text-[12px] text-[#ff3b30]">{error}</p>}
      </Group>

      <Group title='"Din plads venter"'>
        <Toggle
          on={Boolean(nudge)}
          onChange={(on) =>
            edit(
              (d) =>
                void (d.nudge = on
                  ? { afterSeconds: 90, title: "Din plads venter", text: "Har du set nok til at tage det næste skridt?", buttons: [] }
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
            <Toggle
              on={nudge.buttons.length === 0}
              onChange={(on) => edit((d) => void (d.nudge!.buttons = on ? [] : d.cta.filter((c) => c.primary).map((c) => ({ label: c.label, href: c.href, primary: true }))))}
              title="Brug tourens hovedknapper"
              hint="Knapperne fra Knapper og kontakt - retter du dem dér, følger kortet med. Fra: kortet får sine egne knapper."
            />
            {nudge.buttons.length > 0 && <ButtonsEditor
              buttons={nudge.buttons}
              rooms={rooms}
              allowRoom={false}
              onChange={(b) => edit((d) => void (d.nudge!.buttons = b.filter((x): x is { label: string; href: string; primary?: boolean } => "href" in x)))}
            />}
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
                  <LinkInput className="bg-white" value={t.link?.href ?? ""} onChange={(href) => set({ ...t, link: href || t.link?.label ? { label: t.link?.label || "Læs mere", href } : undefined })} />
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

/** Where a guided tour's (or the day's) button is in the menu: at the top, at the bottom, or not there. */
function MenuPlace({ value, onChange, link }: { value: "bottom" | false | undefined; onChange: (v: "bottom" | false | undefined) => void; link: string }) {
  return (
    <Field title="Knappen i menuen" hint={value === false ? `Ikke i menuen - start den fra en flise, et punkt eller en knap med linket ${link}.` : "Øverst (over menupunkterne) eller nederst (under dem)."}>
      <Choice
        value={value === false ? "ingen" : value ?? "top"}
        options={[
          ["top", "Øverst"],
          ["bottom", "Nederst"],
          ["ingen", "Ikke i menuen"],
        ]}
        onChange={(v) => onChange(v === "ingen" ? false : v === "bottom" ? "bottom" : undefined)}
      />
    </Field>
  );
}
