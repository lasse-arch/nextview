"use client";

import type { ScheduleBlock, ScheduleSlot, ScheduleSubject, TourConfig } from "../../tours/types";
import { CardImages, DayPoint, MenuPlace, PlacePicker, Rows } from "./content";
import { LinkInput } from "./links-open";
import { Choice, Field, Group, input, UploadButton, type PreviewApi } from "./ui";

/*
 * "Byg dit skema" in the editor: the week (days, periods, the fixed parts of
 * every day), the choice blocks with their subjects - each shown the best way
 * there is: a place in the tour, a point on the drone scene, photos or a film
 * (a subject never needs a scan) - and the slots of the week.
 */

type Edit = (fn: (d: TourConfig) => void) => void;
type S = NonNullable<TourConfig["schedule"]>;

const small = "px-1 text-[12px] leading-snug text-[#8e8e93]";
const textarea = `${input} min-h-[64px] resize-y leading-snug bg-white`;
const linkBtn = "text-[13px] font-medium text-[#0071e3] disabled:opacity-50";
const DAYS = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag"];
const newId = (name: string) =>
  `${name
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24) || "x"}-${Math.random().toString(36).slice(2, 6)}`;

/** How a subject is shown to the visitor - the best it has. */
export function subjectShown(x: ScheduleSubject): string {
  const ways = [x.href ? (x.href.startsWith("#punkt:") ? "punkt på luftfotoet" : "sted i touren") : null, x.video ? "film" : null, x.images?.length ? `${x.images.length} ${x.images.length === 1 ? "foto" : "fotos"}` : null].filter(Boolean);
  return ways.length ? ways.join(" + ") : "kun tekst";
}

/** Which periods something is in - all, or some (checkboxes). */
function Periods({ all, value, onChange }: { all: S["periods"]; value?: string[]; onChange: (v: string[] | undefined) => void }) {
  if (!all || all.length < 2) return null;
  const on = (id: string) => !value?.length || value.includes(id);
  return (
    <Field title="Perioder" hint="Uden flueben i en periode er det ikke med i den.">
      <div className="flex flex-wrap gap-3">
        {all.map((p) => (
          <label key={p.id} className="flex items-center gap-1.5 text-[14px]">
            <input
              type="checkbox"
              checked={on(p.id)}
              onChange={(e) => {
                const cur = value?.length ? value : all.map((x) => x.id);
                const next = e.target.checked ? [...cur, p.id] : cur.filter((x) => x !== p.id);
                onChange(next.length === all.length || !next.length ? undefined : next);
              }}
            />
            {p.name}
          </label>
        ))}
      </div>
    </Field>
  );
}

/** Where a subject or a fixed slot is in the tour: a place, a point on the drone scene - or none. */
function Where({ config, href, name, preview, onChange }: { config: TourConfig; href?: string; name: string; preview: PreviewApi; onChange: (href: string | undefined) => void }) {
  const kind = href?.startsWith("#punkt:") ? "punkt" : "sted";
  return (
    <>
      {(config.points?.length ?? 0) > 0 && (
        <Field title="Hvor det er">
          <Choice<"sted" | "punkt">
            value={kind}
            options={[
              ["sted", "Sted i touren"],
              ["punkt", "Punkt på luftfotoet"],
            ]}
            onChange={(v) => onChange(v === "punkt" ? `#punkt:${config.points[0].id}` : undefined)}
          />
        </Field>
      )}
      {kind === "punkt" && href ? (
        <>
          <DayPoint config={config} href={href} onChange={onChange} />
          <button type="button" className="px-1 text-[12px] font-medium text-[#ff3b30] hover:underline" onClick={() => onChange(undefined)}>
            × Fjern stedet
          </button>
        </>
      ) : (
        <PlacePicker href={href ?? ""} name={name} preview={preview} onChange={(h) => onChange(h)} onClear={() => onChange(undefined)} />
      )}
    </>
  );
}

function SubjectEditor({ x, config, S, preview, onChange }: { x: ScheduleSubject; config: TourConfig; S: S; preview: PreviewApi; onChange: (x: ScheduleSubject) => void }) {
  return (
    <>
      <Field title="Fag">
        <input className={`${input} bg-white`} value={x.name} onChange={(e) => onChange({ ...x, name: e.target.value })} />
      </Field>
      <Field title="Om faget" hint="Et par sætninger: hvad man laver.">
        <textarea className={textarea} value={x.text ?? ""} onChange={(e) => onChange({ ...x, text: e.target.value || undefined })} />
      </Field>
      <p className={small}>
        <b>Sådan vises faget:</b> {subjectShown(x)}. Har faget et scannet sted, kan gæsten gå derind. Har det ikke (fx klatring ude i byen), så giv det fotos eller en kort film - fra skolens fagside eller Instagram - så ser det lige så godt ud.
      </p>
      <Where config={config} href={x.href} name={x.name} preview={preview} onChange={(href) => onChange({ ...x, href })} />
      <CardImages images={x.images ?? []} hint="Vises øverst på fagets kort - tryk for fuld skærm." onChange={(images) => onChange({ ...x, images: images.length ? images : undefined })} />
      <Field title="Kort film (valgfri)" hint="En mp4 (upload), eller et YouTube-/Vimeo-link. Vises i stedet for billederne.">
        <div className="flex gap-1.5">
          <input className={`${input} bg-white`} placeholder="https://…" value={x.video ?? ""} onChange={(e) => onChange({ ...x, video: e.target.value.trim() || undefined })} />
          <UploadButton accept="video/mp4,video/webm" onDone={(url) => onChange({ ...x, video: url })} />
        </div>
      </Field>
      <Periods all={S.periods} value={x.periods} onChange={(periods) => onChange({ ...x, periods })} />
    </>
  );
}

function SlotEditor({ t, config, S, preview, onChange }: { t: ScheduleSlot; config: TourConfig; S: S; preview: PreviewApi; onChange: (t: ScheduleSlot) => void }) {
  const isBlock = t.block !== undefined;
  return (
    <>
      <div className="flex gap-2">
        <Field title="Dag">
          <select className={`${input} bg-white`} value={t.day} onChange={(e) => onChange({ ...t, day: Number(e.target.value) })}>
            {S.days.map((d, i) => (
              <option key={i} value={i}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field title="Fra">
          <input className={`${input} w-20 bg-white`} value={t.from} placeholder="9.15" onChange={(e) => onChange({ ...t, from: e.target.value })} />
        </Field>
        <Field title="Til">
          <input className={`${input} w-20 bg-white`} value={t.to ?? ""} placeholder="11.45" onChange={(e) => onChange({ ...t, to: e.target.value || undefined })} />
        </Field>
      </div>
      <Field title="Hvad">
        <Choice<"blok" | "fast">
          value={isBlock ? "blok" : "fast"}
          options={[
            ["blok", "En fagblok (gæsten vælger)"],
            ["fast", "Noget fast"],
          ]}
          onChange={(v) => onChange(v === "blok" ? { day: t.day, from: t.from, to: t.to, periods: t.periods, block: S.blocks[0]?.id ?? "" } : { day: t.day, from: t.from, to: t.to, periods: t.periods, title: t.title ?? "Fællestime" })}
        />
      </Field>
      {isBlock ? (
        <Field title="Fagblok">
          <select className={`${input} bg-white`} value={t.block} onChange={(e) => onChange({ ...t, block: e.target.value })}>
            {S.blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <>
          <Field title="Titel">
            <input className={`${input} bg-white`} value={t.title ?? ""} onChange={(e) => onChange({ ...t, title: e.target.value })} />
          </Field>
          <Field title="Tekst (valgfri)">
            <input className={`${input} bg-white`} value={t.text ?? ""} onChange={(e) => onChange({ ...t, text: e.target.value || undefined })} />
          </Field>
          <Where config={config} href={t.href} name={t.title ?? ""} preview={preview} onChange={(href) => onChange({ ...t, href })} />
        </>
      )}
      <Periods all={S.periods} value={t.periods} onChange={(periods) => onChange({ ...t, periods })} />
    </>
  );
}

export function ScheduleEditor({ config, edit, preview }: { config: TourConfig; edit: Edit; preview: PreviewApi }) {
  const S = config.schedule;
  const set = (fn: (s: S) => void) => edit((d) => void (d.schedule && fn(d.schedule)));

  if (!S)
    return (
      <Group>
        <p className="text-[14px] leading-snug">
          <b>Byg dit skema</b>: gæsten vælger et fag i hver fagblok og ser med det samme, hvordan ugen bliver - med de faste ting som morgensamling og frokost. Hvert fag har et kort med tekst og det bedste, der er: stedet i touren, eller fotos og film, hvis faget ikke er scannet. Til højskoler og efterskoler.
        </p>
        <button
          type="button"
          className="flex w-full items-center justify-center rounded-xl bg-[#0071e3] py-2.5 text-[15px] font-medium text-white hover:bg-[#0077ed]"
          onClick={() =>
            edit(
              (d) =>
                void (d.schedule = {
                  title: "Byg dit eget skema",
                  lead: "Vælg et fag i hver fagblok, så ser du med det samme, hvordan din uge bliver.",
                  days: DAYS,
                  daily: [
                    { time: "7.45", title: "Morgenmad" },
                    { time: "12.00", title: "Frokost" },
                    { time: "18.00", title: "Aftensmad" },
                  ],
                  blocks: [{ id: "hovedfag-a", name: "Hovedfag A", when: "Mandag og onsdag formiddag", subjects: [] }],
                  slots: [
                    { day: 0, from: "9.15", to: "11.45", block: "hovedfag-a" },
                    { day: 2, from: "9.15", to: "11.45", block: "hovedfag-a" },
                  ],
                  note: "Skemaet er vejledende.",
                })
            )
          }
        >
          Lav et skema
        </button>
        <p className={small}>Starter med en uge og én fagblok - tilføj fagene og resten af blokkene.</p>
      </Group>
    );

  const blockName = (id?: string) => S.blocks.find((b) => b.id === id)?.name ?? "?";

  return (
    <>
      <Group>
        <p className={small}>
          Åbnes med linket <b>#skema</b> og knappen i menuen.{" "}
          <button type="button" className={linkBtn} onClick={() => preview.go("Byg dit skema", "#skema")}>
            Vis i forhåndsvisningen
          </button>
        </p>
        <Field title="Overskrift">
          <input className={`${input} bg-white`} value={S.title} onChange={(e) => set((s) => void (s.title = e.target.value))} />
        </Field>
        <Field title="Undertekst">
          <input className={`${input} bg-white`} value={S.lead ?? ""} onChange={(e) => set((s) => void (s.lead = e.target.value || undefined))} />
        </Field>
        <MenuPlace value={S.menu} onChange={(v) => set((s) => void (s.menu = v))} link="#skema" />
        <Field title="Dage" hint="Med komma imellem.">
          <input
            className={`${input} bg-white`}
            defaultValue={S.days.join(", ")}
            onBlur={(e) => {
              const days = e.target.value.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 7);
              if (days.length) set((s) => void ((s.days = days), (s.slots = s.slots.filter((t) => t.day < days.length))));
            }}
          />
        </Field>
        <Field title="Under ugen (valgfri)">
          <input className={`${input} bg-white`} value={S.note ?? ""} placeholder="Skemaet er vejledende." onChange={(e) => set((s) => void (s.note = e.target.value || undefined))} />
        </Field>
        <Field title="Knap til sidst (valgfri)" hint="Fx Book en rundvisning eller Tilmeld dig.">
          <div className="flex gap-1.5">
            <input
              className={`${input} bg-white`}
              placeholder="Tekst"
              value={S.visit?.label ?? ""}
              onChange={(e) => set((s) => void (s.visit = e.target.value || s.visit?.href ? { label: e.target.value, href: s.visit?.href ?? "" } : undefined))}
            />
            <LinkInput className="bg-white" placeholder="Link" value={S.visit?.href ?? ""} onChange={(href) => set((s) => void (s.visit = href || s.visit?.label ? { label: s.visit?.label ?? "", href } : undefined))} />
          </div>
        </Field>
      </Group>

      <Group title="Perioder (valgfri)">
        <p className={small}>Fx 1. og 2. periode med forskellige fag. Uden perioder er der ét skema.</p>
        <Rows<{ id: string; name: string }>
          items={S.periods ?? []}
          onChange={(periods) => set((s) => void (s.periods = periods.length ? periods : undefined))}
          icon={["bg-[#34c759]", '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>']}
          title={(p) => p.name}
          subtitle={(p) => {
            const n = S.blocks.reduce((sum, b) => sum + b.subjects.filter((x) => !x.periods?.length || x.periods.includes(p.id)).length, 0);
            return `${n} fag`;
          }}
          empty="Ingen perioder - ét skema."
          editor={(p, put) => (
            <Field title="Navn">
              <input className={`${input} bg-white`} value={p.name} onChange={(e) => put({ ...p, name: e.target.value })} />
            </Field>
          )}
        />
        <button type="button" className={linkBtn} onClick={() => set((s) => void (s.periods = [...(s.periods ?? []), { id: newId("periode"), name: `${(s.periods?.length ?? 0) + 1}. periode` }]))}>
          + Periode
        </button>
      </Group>

      <Group title="Hver dag">
        <p className={small}>Det, der er hver dag - står øverst i ugen.</p>
        <Rows<{ time: string; title: string }>
          items={S.daily ?? []}
          onChange={(daily) => set((s) => void (s.daily = daily.length ? daily : undefined))}
          icon={["bg-[#8e8e93]", '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>']}
          title={(x) => `${x.time}  ${x.title}`}
          subtitle={() => "Hver dag"}
          empty="Intet fast hver dag."
          editor={(x, put) => (
            <div className="flex gap-2">
              <Field title="Tid">
                <input className={`${input} w-20 bg-white`} value={x.time} onChange={(e) => put({ ...x, time: e.target.value })} />
              </Field>
              <div className="flex-1">
                <Field title="Hvad">
                  <input className={`${input} bg-white`} value={x.title} onChange={(e) => put({ ...x, title: e.target.value })} />
                </Field>
              </div>
            </div>
          )}
        />
        <button type="button" className={linkBtn} onClick={() => set((s) => void (s.daily = [...(s.daily ?? []), { time: "", title: "Nyt" }]))}>
          + Fast punkt
        </button>
      </Group>

      <Group title="Fagblokke og fag">
        <p className={small}>En fagblok er et valg: gæsten vælger ét fag i den. Fagene vises med det bedste, de har - et sted i touren, eller fotos og film.</p>
        <Rows<ScheduleBlock>
          items={S.blocks}
          onChange={(blocks) => set((s) => void ((s.blocks = blocks), (s.slots = s.slots.filter((t) => t.block === undefined || blocks.some((b) => b.id === t.block)))))}
          icon={["bg-[#ff9500]", '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>']}
          title={(b) => b.name}
          subtitle={(b) => [b.when, `${b.subjects.length} fag`, `${S.slots.filter((t) => t.block === b.id).length} timer`].filter(Boolean).join(" · ")}
          empty="Ingen fagblokke endnu."
          editor={(b, put) => (
            <>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Field title="Navn">
                    <input className={`${input} bg-white`} value={b.name} onChange={(e) => put({ ...b, name: e.target.value })} />
                  </Field>
                </div>
                <div className="flex-1">
                  <Field title="Hvornår (i ord)">
                    <input className={`${input} bg-white`} value={b.when ?? ""} placeholder="Mandag og onsdag formiddag" onChange={(e) => put({ ...b, when: e.target.value || undefined })} />
                  </Field>
                </div>
              </div>
              <Rows<ScheduleSubject>
                items={b.subjects}
                onChange={(subjects) => put({ ...b, subjects })}
                icon={["bg-[#5856d6]", '<path d="M4 19V5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z"/><path d="M8 7h6"/>']}
                title={(x) => x.name}
                subtitle={(x) => subjectShown(x)}
                empty="Ingen fag i blokken endnu."
                editor={(x, putX) => <SubjectEditor x={x} config={config} S={S} preview={preview} onChange={putX} />}
              />
              <button type="button" className={linkBtn} onClick={() => put({ ...b, subjects: [...b.subjects, { id: newId("fag"), name: "Nyt fag" }] })}>
                + Fag
              </button>
            </>
          )}
        />
        <button type="button" className={linkBtn} onClick={() => set((s) => void s.blocks.push({ id: newId("blok"), name: `Fagblok ${s.blocks.length + 1}`, subjects: [] }))}>
          + Fagblok
        </button>
      </Group>

      <Group title="Ugen">
        <p className={small}>Timerne: en fagblok (gæstens valgte fag står der) eller noget fast (fx Morgensamling, Højskoleaften).</p>
        <Rows<ScheduleSlot>
          items={[...S.slots].sort((a, b) => a.day - b.day || parseFloat(a.from.replace(":", ".")) - parseFloat(b.from.replace(":", ".")))}
          onChange={(slots) => set((s) => void (s.slots = slots))}
          icon={["bg-[#0a84ff]", '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>']}
          title={(t) => `${S.days[t.day]?.slice(0, 3) ?? "?"} ${t.from}${t.to ? `-${t.to}` : ""}  ${t.block !== undefined ? blockName(t.block) : t.title ?? ""}`}
          subtitle={(t) => (t.block !== undefined ? "Fagblok - gæsten vælger" : [t.text, t.href ? "har et sted" : null].filter(Boolean).join(" · ") || "Fast")}
          empty="Ingen timer endnu."
          editor={(t, put) => <SlotEditor t={t} config={config} S={S} preview={preview} onChange={put} />}
        />
        <button type="button" className={linkBtn} onClick={() => set((s) => void s.slots.push(S.blocks[0] ? { day: 0, from: "9.15", to: "11.45", block: S.blocks[0].id } : { day: 0, from: "9.15", title: "Fællestime" }))}>
          + Time
        </button>
      </Group>

      <Group>
        <button type="button" className="px-1 text-[13px] text-[#ff3b30] hover:underline" onClick={() => edit((d) => void (d.schedule = undefined))}>
          Fjern skemaet
        </button>
      </Group>
    </>
  );
}
