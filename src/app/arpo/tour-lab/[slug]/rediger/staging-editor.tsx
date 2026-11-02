"use client";

import { useState } from "react";
import type { Point3, StagingItem, TourConfig, YearWheel } from "../../tours/types";
import { Rows } from "./content";
import { LinkInput } from "./links-open";
import { Choice, Field, Group, Icon, input, UploadButton, ssOfHref, type PreviewApi } from "./ui";
import { cornersOf, movePlace } from "../staging";

/*
 * Virtual staging: a video, a picture, a web page, a sign or the year wheel
 * laid onto a surface in the tour (a TV, a wall, a whiteboard). Placed by
 * clicking its four corners in the live preview; shown only from the scan
 * points it was placed from (and any added), so it never shows through a wall.
 */

type Edit = (fn: (draft: TourConfig) => void) => void;
type Kind = StagingItem["kind"];

const KINDS: [Kind, string][] = [
  ["video", "Video"],
  ["image", "Billede"],
  ["iframe", "Hjemmeside"],
  ["sign", "Skilt"],
  ["yearwheel", "Årshjul"],
];
const KIND_NAME = Object.fromEntries(KINDS) as Record<Kind, string>;
const CORNER = ["øverste venstre", "øverste højre", "nederste højre", "nederste venstre"];
const MONTHS = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];
const small = "px-1 text-[12px] leading-snug text-[#8e8e93]";
const textarea = `${input} min-h-[72px] resize-y leading-snug`;
const primary = "flex w-full items-center justify-center gap-2 rounded-xl bg-[#0071e3] py-2.5 text-[15px] font-medium text-white hover:bg-[#0077ed] disabled:opacity-50";
const linkBtn = "text-[13px] font-medium text-[#0071e3] disabled:opacity-50";

type Place = NonNullable<StagingItem["place"]>;
/** A new surface's size (metres): about a TV, in the shape its kind usually has. */
const START_SIZE: Record<Kind, [number, number]> = { video: [1.2, 0.675], iframe: [1.2, 0.675], yearwheel: [1.6, 0.9], image: [1.2, 0.8], sign: [1, 0.6] };

/** One click in the preview, in the middle of the surface: where, and which way the surface faces. */
function usePlacer(preview: PreviewApi) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function place(size: [number, number]): Promise<{ place: Place; ss: number | null } | null> {
    setError(null);
    setBusy(true);
    const r = await preview.pick();
    setBusy(false);
    if (r.error || !r.position) {
      if (r.error !== "Annulleret.") setError(r.error ?? "Intet punkt valgt.");
      return null;
    }
    if (!r.normal) {
      setError("Forhåndsvisningen sendte ikke fladens retning - genindlæs den, og prøv igen.");
      return null;
    }
    return { place: { center: r.position, normal: r.normal, w: size[0], h: size[1] }, ss: r.ss ?? null };
  }
  return { place, busy, status: busy ? "Klik midt på fladen i forhåndsvisningen (fx midt på tv'et) - Esc fortryder." : null, error };
}

/** The width/height of a picture or video, for "Tilpas højden". */
function mediaRatio(kind: Kind, src: string): Promise<number | null> {
  return new Promise((resolve) => {
    if (kind === "image") {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? img.naturalHeight / img.naturalWidth : null);
      img.onerror = () => resolve(null);
      img.src = src;
    } else if (kind === "video") {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => resolve(v.videoWidth && v.videoHeight ? v.videoHeight / v.videoWidth : null);
      v.onerror = () => resolve(null);
      v.src = src;
    } else resolve(null);
  });
}

const round = (n: number) => Math.round(n * 100) / 100;
const stepBtn = "h-8 w-8 rounded-lg bg-white text-[16px] font-semibold text-[#0071e3] ring-1 ring-black/[.06] hover:bg-[#0071e3]/5 disabled:opacity-40";

/** Size and position with buttons: width and height (aspect kept, unless unlocked) and 5 cm moves along the surface. */
function SizeControls({ item, set }: { item: StagingItem; set: (i: StagingItem) => void }) {
  const [locked, setLocked] = useState(true);
  const [fitting, setFitting] = useState(false);
  const p = item.place;
  if (!p) return <p className={small}>Placeret med fire hjørner. Tryk "Placér igen" og klik midt på fladen, så kan størrelsen ændres med knapper.</p>;
  const put = (next: Place) => set({ ...item, place: next, corners: cornersOf(next) });
  const resize = (w: number, h: number) => put({ ...p, w: Math.min(10, Math.max(0.1, round(w))), h: Math.min(10, Math.max(0.1, round(h))) });
  const width = (w: number) => resize(w, locked ? (w * p.h) / p.w : p.h);
  const height = (h: number) => resize(locked ? (h * p.w) / p.h : p.w, h);
  const row = (title: string, v: number, on: (v: number) => void) => (
    <div className="flex items-center gap-1.5">
      <span className="w-14 text-[13px] text-[#6e6e73]">{title}</span>
      <button type="button" className={stepBtn} aria-label={`${title} mindre`} onClick={() => on(v - 0.05)}>
        −
      </button>
      <span className="w-20 flex-none">
        <input type="number" step={0.05} min={0.1} max={10} className={`${input} bg-white text-center`} value={v} onChange={(e) => Number(e.target.value) > 0 && on(Number(e.target.value))} />
      </span>
      <span className="text-[13px] text-[#8e8e93]">m</span>
      <button type="button" className={stepBtn} aria-label={`${title} større`} onClick={() => on(v + 0.05)}>
        +
      </button>
    </div>
  );
  const move = (dx: number, dy: number) => put(movePlace(p, dx, dy));
  return (
    <Field title="Størrelse og placering" hint="Ret størrelsen, til den dækker fladen - og skub den på plads 5 cm ad gangen.">
      <div className="space-y-2">
        {row("Bredde", p.w, width)}
        {row("Højde", p.h, height)}
        <label className="flex items-center gap-2 text-[13px] text-[#6e6e73]">
          <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} /> Lås forholdet mellem bredde og højde
        </label>
        {(item.kind === "image" || item.kind === "video") && item.src && (
          <button
            type="button"
            disabled={fitting}
            className={linkBtn}
            onClick={async () => {
              setFitting(true);
              const ratio = await mediaRatio(item.kind, item.src!);
              setFitting(false);
              if (ratio) resize(p.w, p.w * ratio);
            }}
          >
            {fitting ? "Måler…" : item.kind === "video" ? "Tilpas højden til videoen" : "Tilpas højden til billedet"}
          </button>
        )}
        <div className="flex items-center gap-1.5">
          <span className="w-14 text-[13px] text-[#6e6e73]">Flyt</span>
          <button type="button" className={stepBtn} aria-label="Flyt til venstre" onClick={() => move(-0.05, 0)}>
            ←
          </button>
          <button type="button" className={stepBtn} aria-label="Flyt op" onClick={() => move(0, 0.05)}>
            ↑
          </button>
          <button type="button" className={stepBtn} aria-label="Flyt ned" onClick={() => move(0, -0.05)}>
            ↓
          </button>
          <button type="button" className={stepBtn} aria-label="Flyt til højre" onClick={() => move(0.05, 0)}>
            →
          </button>
        </div>
      </div>
    </Field>
  );
}

export function StagingEditor({ config, edit, preview }: { config: TourConfig; edit: Edit; preview: PreviewApi }) {
  const items = config.staging ?? [];
  const setItems = (next: StagingItem[]) => edit((d) => void (d.staging = next.length ? next : undefined));
  const [kind, setKind] = useState<Kind>("video");
  const placer = usePlacer(preview);
  const [ssBusy, setSsBusy] = useState(false);

  return (
    <>
      <Group>
        <p className="text-[14px] leading-snug">
          Læg en video, et billede, en hjemmeside, et skilt eller årshjulet på en flade i rummet - et tv, en væg, en tavle. Det følger perspektivet, når man drejer, og kan trykkes på.
        </p>
        <Choice value={kind} options={KINDS} onChange={setKind} />
        <button
          type="button"
          disabled={placer.busy}
          className={primary}
          onClick={async () => {
            const at = await placer.place(START_SIZE[kind]);
            if (!at) return;
            const item: StagingItem = { id: `vs-${Date.now().toString(36)}`, kind, title: `${KIND_NAME[kind]} ${items.length + 1}`, place: at.place, corners: cornersOf(at.place), ss: at.ss ? [at.ss] : [] };
            if (kind === "sign") item.text = "Velkommen";
            if (kind === "yearwheel" && !config.yearWheel) edit((d) => void (d.yearWheel = { title: "Et år. Én årgang.", months: [] }));
            setItems([...items, item]);
          }}
        >
          <Icon d='<path d="M4 4h16v16H4z"/><path d="M4 4l16 16"/>' className="h-4 w-4" />
          {placer.busy ? "Klik i forhåndsvisningen…" : `Placér ${KIND_NAME[kind].toLowerCase()} på en flade`}
        </button>
        {placer.status && <p className={small}>{placer.status}</p>}
        {placer.error && <p className="px-1 text-[12px] text-[#ff3b30]">{placer.error}</p>}
      </Group>
      <Group title="På fladerne">
        <Rows<StagingItem>
          items={items}
          onChange={setItems}
          icon={["bg-[#5856d6]", '<rect x="3" y="5" width="18" height="12" rx="1.5"/><path d="M8 21h8M12 17v4"/>']}
          title={(i) => i.title ?? KIND_NAME[i.kind]}
          subtitle={(i) => [KIND_NAME[i.kind], i.action?.label, i.ss.length ? `ses fra punkt ${i.ss.join(", ")}` : "ses ikke nogen steder"].filter(Boolean).join(" · ")}
          empty="Intet på fladerne endnu."
          editor={(i, set) => (
            <>
              <Field title="Navn" hint="Kun til jer - ses ikke i touren.">
                <input className={`${input} bg-white`} value={i.title ?? ""} onChange={(e) => set({ ...i, title: e.target.value || undefined })} />
              </Field>
              {(i.kind === "video" || i.kind === "image") && (
                <Field title={i.kind === "video" ? "Video" : "Billede"} hint={i.kind === "video" ? "Upload en mp4, eller et YouTube-/Vimeo-link. Kører uden lyd - et tryk slår lyden til." : "Upload, eller et https-link."}>
                  <div className="flex gap-1.5">
                    <input className={`${input} bg-white`} placeholder="https://…" value={i.src ?? ""} onChange={(e) => set({ ...i, src: e.target.value || undefined })} />
                    <UploadButton accept={i.kind === "video" ? "video/mp4,video/webm" : "image/*"} onDone={(url) => set({ ...i, src: url })} />
                  </div>
                </Field>
              )}
              {i.kind === "iframe" && (
                <Field title="Hjemmeside" hint="Et https-link (fx en Instagram-side eller en kalender). Siden kører afskærmet fra touren; nogle sider tillader ikke at blive vist i andres sider.">
                  <input className={`${input} bg-white`} placeholder="https://…" value={i.src ?? ""} onChange={(e) => set({ ...i, src: e.target.value || undefined })} />
                </Field>
              )}
              {i.kind === "sign" && (
                <Field title="Tekst" hint="Kort - fx en velkomst. Linjeskift bliver vist.">
                  <textarea className={`${textarea} bg-white`} value={i.text ?? ""} onChange={(e) => set({ ...i, text: e.target.value })} />
                </Field>
              )}
              {i.kind === "yearwheel" && <p className={small}>Viser årshjulet herunder - interaktivt, lige på fladen.</p>}
              {(i.kind === "video" || i.kind === "image") && (
                <Field title="Udfyld fladen">
                  <Choice
                    value={i.fit ?? "cover"}
                    options={[
                      ["cover", "Fyld (beskær)"],
                      ["contain", "Hele billedet"],
                    ]}
                    onChange={(fit) => set({ ...i, fit: fit === "cover" ? undefined : fit })}
                  />
                </Field>
              )}
              {i.kind !== "iframe" && i.kind !== "yearwheel" && (
                <Field title="Knap (valgfri)" hint="Et tryk på fladen åbner linket - fx jeres Instagram, en tilmelding eller #kontakt.">
                  <div className="flex gap-1.5">
                    <input className={`${input} w-2/5 bg-white`} placeholder="Fx Følg os" value={i.action?.label ?? ""} onChange={(e) => set({ ...i, action: e.target.value || i.action?.href ? { label: e.target.value, href: i.action?.href ?? "" } : undefined })} />
                    <LinkInput className="bg-white" value={i.action?.href ?? ""} onChange={(href) => set({ ...i, action: href || i.action?.label ? { label: i.action?.label || "Se mere", href } : undefined })} />
                  </div>
                </Field>
              )}
              <Field title="Ses fra punkt" hint="Vises kun fra disse scanpunkter, så det aldrig ses gennem en væg.">
                <div className="flex flex-wrap items-center gap-1.5">
                  {i.ss.map((n) => (
                    <span key={n} className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[13px] ring-1 ring-black/[.06]">
                      {n}
                      <button type="button" className="text-[#c7c7cc] hover:text-[#ff3b30]" onClick={() => set({ ...i, ss: i.ss.filter((x) => x !== n) })} aria-label="Fjern">
                        ×
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    disabled={ssBusy}
                    className="rounded-full px-2.5 py-1 text-[13px] font-medium text-[#0071e3] hover:bg-[#0071e3]/10"
                    onClick={async () => {
                      setSsBusy(true);
                      const r = await preview.view();
                      setSsBusy(false);
                      const ss = r.href ? ssOfHref(r.href) : null;
                      if (ss && !i.ss.includes(ss)) set({ ...i, ss: [...i.ss, ss] });
                    }}
                  >
                    + Punktet i forhåndsvisningen
                  </button>
                </div>
              </Field>
              <SizeControls item={i} set={set} />
              <button
                type="button"
                disabled={placer.busy}
                className={`${linkBtn} mr-4 block`}
                onClick={async () => {
                  const at = await placer.place(i.place ? [i.place.w, i.place.h] : START_SIZE[i.kind]);
                  if (at) set({ ...i, place: at.place, corners: cornersOf(at.place), ss: at.ss && !i.ss.includes(at.ss) ? [...i.ss, at.ss] : i.ss });
                }}
              >
                {placer.busy ? "Klik i forhåndsvisningen…" : "Placér igen (ét klik midt på fladen)"}
              </button>
            </>
          )}
        />
      </Group>
      <YearWheelEditor config={config} edit={edit} preview={preview} />
    </>
  );
}

/**
 * Årshjulet: the school year as a turning wheel - the opening line, every
 * month with what happens, and an ending with a button. Opened with the link
 * #aarshjul (a menu item, a button, a tile) or laid onto a surface above.
 */
function YearWheelEditor({ config, edit, preview }: { config: TourConfig; edit: Edit; preview: PreviewApi }) {
  const w = config.yearWheel;
  const set = (fn: (w: YearWheel) => void) => edit((d) => void (d.yearWheel && fn(d.yearWheel)));
  const [month, setMonth] = useState<number | null>(null);

  if (!w)
    return (
      <Group title="Årshjul">
        <p className="text-[14px] leading-snug">Året som et hjul, der drejer: hver måned med det, der sker - lejrskole, gallafest, rejser. Afspiller sig selv og kan trykkes på. Erstatter en færdig årshjuls-video og kan rettes og oversættes som resten.</p>
        <button type="button" className={primary} onClick={() => edit((d) => void (d.yearWheel = { title: "Et år. Én årgang.", subtitle: "Det sker på et år hos os", startMonth: 8, months: [] }))}>
          Lav et årshjul
        </button>
      </Group>
    );

  const eventsOf = (m: number) => w.months.find((x) => x.month === m)?.events ?? [];
  const setEvents = (m: number, events: YearWheel["months"][number]["events"]) =>
    set((y) => {
      y.months = [...y.months.filter((x) => x.month !== m), ...(events.length ? [{ month: m, events }] : [])].sort((a, b) => a.month - b.month);
    });
  const start = w.startMonth ?? 8;
  const order = Array.from({ length: 12 }, (_, i) => ((start - 1 + i) % 12) + 1);

  return (
    <Group
      title="Årshjul"
      more={
        <button type="button" className="text-[13px] font-medium text-[#ff3b30]" onClick={() => edit((d) => void ((d.yearWheel = undefined), (d.staging = d.staging?.filter((s) => s.kind !== "yearwheel"))))}>
          Fjern årshjulet
        </button>
      }
    >
      <p className={small}>
        Åbnes med linket <b>#aarshjul</b> (i menuen, på en knap eller en flise) - eller læg det på en flade ovenfor.{" "}
        <button type="button" className={linkBtn} onClick={() => preview.go("Årshjul", "#aarshjul")}>
          Vis i forhåndsvisningen
        </button>
      </p>
      <Field title="Overskrift">
        <input className={`${input} bg-white`} value={w.title} onChange={(e) => set((y) => void (y.title = e.target.value))} />
      </Field>
      <Field title="Undertekst (valgfri)">
        <input className={`${input} bg-white`} value={w.subtitle ?? ""} onChange={(e) => set((y) => void (y.subtitle = e.target.value || undefined))} />
      </Field>
      <Field title="Baggrundsbillede (valgfri)">
        <div className="flex gap-1.5">
          <input className={`${input} bg-white`} placeholder="https://…" value={w.image ?? ""} onChange={(e) => set((y) => void (y.image = e.target.value || undefined))} />
          <UploadButton accept="image/*" onDone={(url) => set((y) => void (y.image = url))} />
        </div>
      </Field>
      <div className="flex gap-3">
        <Field title="Året starter i">
          <select className={`${input} bg-white`} value={start} onChange={(e) => set((y) => void (y.startMonth = Number(e.target.value)))}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field title="Sekunder pr. måned">
          <input type="number" min={2} max={15} className={`${input} bg-white`} value={w.seconds ?? 4} onChange={(e) => set((y) => void (y.seconds = Math.min(15, Math.max(2, Number(e.target.value) || 4))))} />
        </Field>
      </div>
      <div className="-mx-4 divide-y divide-black/[.05] border-y border-black/[.05]">
        {order.map((m) => {
          const events = eventsOf(m);
          const open = month === m;
          return (
            <div key={m}>
              <button type="button" onClick={() => setMonth(open ? null : m)} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${open ? "bg-[#f2f2f7]" : "hover:bg-[#f9f9fb]"}`}>
                <span className="w-24 text-[15px] capitalize">{MONTHS[m - 1]}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-[#8e8e93]">{events.map((e) => e.title).join(" · ") || "Intet"}</span>
                <Icon d={open ? '<path d="M6 9l6 6 6-6"/>' : '<path d="M9 6l6 6-6 6"/>'} className="h-4 w-4 flex-none text-[#c7c7cc]" />
              </button>
              {open && (
                <div className="space-y-3 bg-[#f2f2f7] px-4 pb-3">
                  {events.map((ev, n) => {
                    const put = (next: typeof ev | null) => setEvents(m, next ? events.map((x, k) => (k === n ? next : x)) : events.filter((_, k) => k !== n));
                    return (
                      <div key={n} className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-black/[.04]">
                        <input className={input} placeholder="Fx Introtur" value={ev.title} onChange={(e) => put({ ...ev, title: e.target.value })} />
                        <textarea className={textarea} placeholder="Kort - én sætning." value={ev.text ?? ""} onChange={(e) => put({ ...ev, text: e.target.value || undefined })} />
                        <div className="flex gap-1.5">
                          <input className={input} placeholder="Billede (valgfrit)" value={ev.image ?? ""} onChange={(e) => put({ ...ev, image: e.target.value || undefined })} />
                          <UploadButton accept="image/*" onDone={(url) => put({ ...ev, image: url })} />
                        </div>
                        <LinkInput value={ev.href ?? ""} placeholder="Link (valgfrit) - fx et sted i touren" onChange={(href) => put({ ...ev, href: href || undefined })} />
                        <button type="button" className="text-[13px] text-[#ff3b30]" onClick={() => put(null)}>
                          Fjern
                        </button>
                      </div>
                    );
                  })}
                  {events.length < 4 && (
                    <button type="button" className={linkBtn} onClick={() => setEvents(m, [...events, { title: "" }])}>
                      + Noget der sker i {MONTHS[m - 1]}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Field title="Afslutning (valgfri)" hint="Til sidst: en linje og en knap - fx Book et besøg.">
        <div className="space-y-1.5">
          <input
            className={`${input} bg-white`}
            placeholder="Fx Bliv en del af næste årgang"
            value={w.cta?.title ?? ""}
            onChange={(e) => set((y) => void (y.cta = e.target.value || y.cta?.href ? { title: e.target.value, label: y.cta?.label || "Book et besøg", href: y.cta?.href ?? "#kontakt" } : undefined))}
          />
          {w.cta && (
            <div className="flex gap-1.5">
              <input className={`${input} w-2/5 bg-white`} value={w.cta.label} onChange={(e) => set((y) => void (y.cta && (y.cta.label = e.target.value)))} />
              <LinkInput className="bg-white" value={w.cta.href} onChange={(href) => set((y) => void (y.cta && (y.cta.href = href)))} />
            </div>
          )}
        </div>
      </Field>
    </Group>
  );
}
