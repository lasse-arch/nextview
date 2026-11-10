"use client";

import { useState } from "react";
import type { CardPerson, LineDayStop, TourConfig } from "../../tours/types";
import { Rows } from "./content";
import { menuRooms } from "./map-editor";
import { isPlaceHref } from "../../tours/places";
import { LinkInput } from "./links-open";
import { Choice, Field, Group, input, Toggle, UploadButton, type PreviewApi } from "./ui";

/*
 * "En dag på din linje" in the editor: the shared stops (written once and
 * used by every line), the lines with their teachers and their day (shared
 * stops and the line's own, in order), "Lidt af det hele" and the ending.
 * A stop's place is taken from where the preview stands.
 */

type Edit = (fn: (d: TourConfig) => void) => void;
type L = NonNullable<TourConfig["lineDays"]>;
type Line = L["lines"][number];

const small = "px-1 text-[12px] leading-snug text-[#8e8e93]";
const textarea = `${input} min-h-[64px] resize-y leading-snug bg-white`;
const linkBtn = "text-[13px] font-medium text-[#0071e3] disabled:opacity-50";
const newId = (title: string) =>
  `${title
    .toLowerCase()
    .replace(/[æ]/g, "ae")
    .replace(/[ø]/g, "oe")
    .replace(/[å]/g, "aa")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24) || "stop"}-${Math.random().toString(36).slice(2, 6)}`;

/** A school day most efterskoler share - the start for the shared stops (times as at Aalestrup; change them). */
const STARTER: LineDayStop[] = [
  { id: "morgenmad", time: "07.25", place: "Spisesalen", title: "Morgenmad", text: "Dagen starter med morgenmad sammen med hele skolen." },
  { id: "morgensamling", time: "Formiddag", place: "Fællessalen", title: "Morgensamling og fag", text: "Her mødes alle elever til morgensamling - og så er der skolefag." },
  { id: "frokost", time: "Middag", place: "Spisesalen", title: "Frokost og rengøring", text: "Frokost sammen, og så en kort tur med kost og klud." },
  { id: "aftensmad", time: "18.00", place: "Spisesalen", title: "Aftensmad", text: "Alle spiser sammen." },
  { id: "aftenkaffe", time: "21.15", place: "Fællesrummet", title: "Aftenkaffe", text: "Dagen samles op over en kop te eller kaffe." },
  { id: "vaerelset", time: "22.00", place: "Værelset", title: "Her slutter dagen", text: "Kl. 22.00 er du på værelset, og kl. 23.00 slukker vi lyset.", tags: ["Lys ud kl. 23.00"] },
];

export function LineDayEditor({ config, edit, preview }: { config: TourConfig; edit: Edit; preview: PreviewApi }) {
  const L = config.lineDays;
  const set = (fn: (l: L) => void) => edit((d) => void (d.lineDays && fn(d.lineDays)));

  if (!L)
    return (
      <Group>
        <p className="text-[14px] leading-snug">
          <b>En dag på din linje</b>: gæsten vælger en linje og lever en skoledag - linjens egne steder og skolens fælles steder flettet sammen, med tidspunkt, et par ord og lærerne, man møder. Til efterskoler med linjefag.
        </p>
        <button
          type="button"
          className="flex w-full items-center justify-center rounded-xl bg-[#0071e3] py-2.5 text-[15px] font-medium text-white hover:bg-[#0077ed]"
          onClick={() =>
            edit(
              (d) =>
                void (d.lineDays = {
                  title: "Forestil dig en skoledag ...",
                  lead: "Vælg en linje og se, hvem du skal være sammen med.",
                  shared: STARTER,
                  lines: [],
                  mix: { after: "frokost" },
                })
            )
          }
        >
          Lav en dag på linjen
        </button>
        <p className={small}>Starter med en almindelig efterskoledag som fælles stop - ret tider og tekster, sæt stederne, og tilføj linjerne.</p>
      </Group>
    );

  const sharedName = (id: string) => L.shared.find((s) => s.id === id);

  return (
    <>
      <Group>
        <p className={small}>
          Åbnes med linket <b>#linjedag</b> (vælg linje) eller <b>#linjedag:&lt;linje&gt;</b> - sæt det på en flise, i menuen eller på en knap.{" "}
          <button type="button" className={linkBtn} onClick={() => preview.go("En dag på linjen", "#linjedag")}>
            Vis i forhåndsvisningen
          </button>
        </p>
        <Field title="Overskrift">
          <input className={`${input} bg-white`} value={L.title} onChange={(e) => set((l) => void (l.title = e.target.value))} />
        </Field>
        <Field title="Undertekst">
          <input className={`${input} bg-white`} value={L.lead ?? ""} onChange={(e) => set((l) => void (l.lead = e.target.value || undefined))} />
        </Field>
        <Field title="Lærerne på kortet" hint="Hvor meget personerne fylder, mens dagen kører. Alle: hele listen, hvor man møder dem første gang - derefter små ansigter. Kun én: kun den første lærer, med navn og rolle. Kun ansigter: altid små ansigter og fornavnene.">
          <Choice
            value={L.people ?? "all"}
            options={[
              ["all", "Alle"],
              ["one", "Kun én"],
              ["faces", "Kun ansigter"],
            ]}
            onChange={(v) => set((l) => void (l.people = v === "all" ? undefined : (v as "one" | "faces")))}
          />
        </Field>
      </Group>

      <Group title="Fælles stop - hele skolen">
        <p className={small}>Skrives én gang og bruges af alle linjer, der har dem i deres dag.</p>
        <Rows<LineDayStop>
          items={L.shared}
          onChange={(shared) => set((l) => void (l.shared = shared))}
          icon={["bg-[#5856d6]", '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>']}
          title={(s) => `${s.time} · ${s.title}`}
          subtitle={(s) => [s.place, s.href ? "har et sted" : "intet sted endnu", `${L.lines.filter((x) => x.day.includes(s.id)).length} linjer`].filter(Boolean).join(" · ")}
          empty="Ingen fælles stop endnu."
          editor={(s, put) => <StopEditor stop={s} onChange={put} preview={preview} />}
        />
        <button type="button" className={linkBtn} onClick={() => set((l) => void l.shared.push({ id: newId("stop"), time: "", title: "Nyt stop" }))}>
          + Fælles stop
        </button>
      </Group>

      <Group title="Linjerne">
        <Rows<Line>
          items={L.lines}
          onChange={(lines) => set((l) => void (l.lines = lines))}
          icon={["bg-[#ff9500]", '<path d="M4 20V6l8-3 8 3v14"/><path d="M9 20v-6h6v6"/>']}
          title={(l) => l.name}
          subtitle={(l) => [`${l.day.length} stop`, l.people?.length ? `${l.people.length} lærere` : null].filter(Boolean).join(" · ")}
          empty="Ingen linjer endnu."
          editor={(line, put) => <LineEditor line={line} L={L} config={config} onChange={put} preview={preview} sharedName={sharedName} />}
        />
        <button
          type="button"
          className={linkBtn}
          onClick={() => set((l) => void l.lines.push({ id: newId("linje").split("-")[0] + "-" + Math.random().toString(36).slice(2, 5), name: "Ny linje", day: l.shared.map((s) => s.id) }))}
        >
          + Linje
        </button>
      </Group>

      <Group title='"Lidt af det hele"'>
        <Toggle
          on={L.mix !== false}
          onChange={(on) => set((l) => void (l.mix = on ? { after: L.shared[2]?.id } : false))}
          title="Til dem, der er i tvivl"
          hint="Skolens fælles dag med et kort besøg på hver linje - linjens første egne stop, eller det du vælger på linjen."
        />
        {L.mix !== false && (
          <Field title="Linjerne vises efter">
            <select className={`${input} bg-white`} value={(L.mix && L.mix.after) || ""} onChange={(e) => set((l) => void (l.mix = { ...(l.mix || {}), after: e.target.value || undefined }))}>
              <option value="">Midt på dagen</option>
              {L.shared.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.time} · {s.title}
                </option>
              ))}
            </select>
          </Field>
        )}
      </Group>

      <Group title="Afslutningen">
        <p className={small}>Til sidst: hele dagen samlet, en invitation (fx besøgsaften) og de andre linjers dag.</p>
        <Field title="Overskrift">
          <input
            className={`${input} bg-white`}
            placeholder="Kom og mærk den selv"
            value={L.visit?.title ?? ""}
            onChange={(e) => set((l) => void (l.visit = e.target.value || l.visit?.label ? { title: e.target.value, text: l.visit?.text, label: l.visit?.label ?? "Se datoerne", href: l.visit?.href ?? "#kontakt" } : undefined))}
          />
        </Field>
        {L.visit && (
          <>
            <Field title="Tekst">
              <textarea className={textarea} value={L.visit.text ?? ""} onChange={(e) => set((l) => void (l.visit && (l.visit.text = e.target.value || undefined)))} />
            </Field>
            <Field title="Knap">
              <div className="flex gap-1.5">
                <input className={`${input} w-2/5 bg-white`} value={L.visit.label} onChange={(e) => set((l) => void (l.visit && (l.visit.label = e.target.value)))} />
                <LinkInput className="bg-white" value={L.visit.href} onChange={(href) => set((l) => void (l.visit && (l.visit.href = href)))} />
              </div>
            </Field>
          </>
        )}
      </Group>
      <button type="button" className="px-1 text-[13px] text-[#ff3b30]" onClick={() => confirm("Fjern hele En dag på linjen?") && edit((d) => void (d.lineDays = undefined))}>
        Fjern En dag på linjen
      </button>
    </>
  );
}

/** One stop: time, place, text, where in the tour, small facts and the people there. */
function StopEditor({ stop, onChange, preview, peopleHint }: { stop: LineDayStop; onChange: (s: LineDayStop) => void; preview: PreviewApi; peopleHint?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <div className="flex gap-1.5">
        <Field title="Tidspunkt">
          <input className={`${input} bg-white`} placeholder="07.25" value={stop.time} onChange={(e) => onChange({ ...stop, time: e.target.value })} />
        </Field>
        <Field title="Sted (over overskriften)">
          <input className={`${input} bg-white`} placeholder="Stalden på Gården" value={stop.place ?? ""} onChange={(e) => onChange({ ...stop, place: e.target.value || undefined })} />
        </Field>
      </div>
      <Field title="Overskrift">
        <input className={`${input} bg-white`} value={stop.title} onChange={(e) => onChange({ ...stop, title: e.target.value })} />
      </Field>
      <Field title="Tekst" hint="1-3 sætninger.">
        <textarea className={textarea} value={stop.text ?? ""} onChange={(e) => onChange({ ...stop, text: e.target.value || undefined })} />
      </Field>
      <Field title="Stedet i touren">
        <div className="flex flex-col gap-1.5">
          <LinkInput className="bg-white" placeholder="@ et sted i touren" value={stop.href ?? ""} onChange={(href) => onChange({ ...stop, href: href || undefined })} />
          <button
            type="button"
            disabled={busy}
            className={`${linkBtn} self-start`}
            onClick={async () => {
              setBusy(true);
              const r = await preview.view();
              setBusy(false);
              if (r.href) onChange({ ...stop, href: r.href, place: stop.place ?? r.room ?? undefined });
            }}
          >
            {busy ? "Henter…" : "Brug stedet i forhåndsvisningen"}
          </button>
        </div>
      </Field>
      <Field title="Små fakta (valgfri)" hint="Adskilt med komma, fx Fitness, Minibiograf.">
        <input
          className={`${input} bg-white`}
          value={(stop.tags ?? []).join(", ")}
          onChange={(e) => {
            const tags = e.target.value.split(",").map((t) => t.trim()).filter(Boolean);
            onChange({ ...stop, tags: tags.length ? tags : undefined });
          }}
        />
      </Field>
      <People people={stop.people} onChange={(people) => onChange({ ...stop, people })} hint={peopleHint} />
    </>
  );
}

/** Up to 4 people: a photo, a name and a role. */
function People({ people, onChange, hint, title = "Personer her (valgfri)" }: { people?: CardPerson[]; onChange: (p: CardPerson[] | undefined) => void; hint?: string; title?: string }) {
  const list = people ?? [];
  const put = (next: CardPerson[]) => onChange(next.length ? next : undefined);
  return (
    <Field title={title} hint={hint ?? "Højst 4 - rigtige portrætter, gerne fra skolens hjemmeside."}>
      <div className="space-y-1.5">
        {list.map((p, i) => (
          <div key={i} className="flex items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.image} alt="" className="h-9 w-9 flex-none rounded-full object-cover" />
            <input className={`${input} bg-white`} placeholder="Navn" value={p.name ?? ""} onChange={(e) => put(list.map((x, k) => (k === i ? { ...x, name: e.target.value || undefined } : x)))} />
            <input className={`${input} bg-white`} placeholder="Rolle" value={p.role ?? ""} onChange={(e) => put(list.map((x, k) => (k === i ? { ...x, role: e.target.value || undefined } : x)))} />
            <button type="button" className="px-1 text-[#c7c7cc] hover:text-[#ff3b30]" aria-label="Fjern" onClick={() => put(list.filter((_, k) => k !== i))}>
              ×
            </button>
          </div>
        ))}
        {list.length < 4 && <UploadButton accept="image/*" label="+ Person (billede)" onDone={(image) => put([...list, { image }])} />}
      </div>
    </Field>
  );
}

/** A line: its name and teachers, and its day - shared stops and its own, in order. */
function LineEditor({ line, L, config, onChange, preview, sharedName }: { line: Line; L: L; config: TourConfig; onChange: (l: Line) => void; preview: PreviewApi; sharedName: (id: string) => LineDayStop | undefined }) {
  const [open, setOpen] = useState<number | null>(null);
  // The tour's places not yet in this line's day - one at a time, or a whole menu group at once (e.g. all the line's simulators).
  const inDay = new Set(line.day.map((d) => (typeof d === "string" ? sharedName(d)?.href : d.href)).filter(Boolean));
  const free = menuRooms(config).filter(([, h]) => !inDay.has(h));
  const groups = config.menu
    .filter((m): m is Extract<typeof m, { items: [string, string][] }> => "items" in m)
    .map((m) => ({ title: m.title, rooms: m.items.filter(([, h]) => isPlaceHref(h) && !inDay.has(h)) }))
    .filter((g) => g.rooms.length > 1);
  const addRooms = (rooms: [string, string][]) => onChange({ ...line, day: [...line.day, ...rooms.map(([name, href]): LineDayStop => ({ id: newId(name), time: "", place: name, title: name, href }))] });
  const move = (i: number, by: number) => {
    const day = [...line.day];
    const j = i + by;
    if (j < 0 || j >= day.length) return;
    [day[i], day[j]] = [day[j], day[i]];
    onChange({ ...line, day });
  };
  const own = line.day.filter((d): d is LineDayStop => typeof d !== "string");
  return (
    <>
      <Field title="Navn">
        <input className={`${input} bg-white`} value={line.name} onChange={(e) => onChange({ ...line, name: e.target.value })} />
      </Field>
      <Field title="Startsætning (valgfri)" hint='Fx "... der starter i stalden, før du har åbnet en bog."'>
        <input className={`${input} bg-white`} value={line.teaser ?? ""} onChange={(e) => onChange({ ...line, teaser: e.target.value || undefined })} />
      </Field>
      <People title="Linjens lærere" people={line.people} onChange={(people) => onChange({ ...line, people })} hint="Vises ved linjen og på linjens egne stop - højst 4." />
      <Field title="Dagen" hint="I rækkefølge. Fælles stop er skolens; linjens egne ligger imellem.">
        <div className="-mx-1 divide-y divide-black/[.05] rounded-xl bg-white ring-1 ring-black/[.05]">
          {line.day.map((d, i) => {
            const s = typeof d === "string" ? sharedName(d) : d;
            return (
              <div key={(typeof d === "string" ? d : d.id) + i}>
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${typeof d === "string" ? "bg-[#5856d6]/10 text-[#5856d6]" : "bg-[#ff9500]/15 text-[#c76a00]"}`}>{typeof d === "string" ? "Fælles" : "Linjen"}</span>
                  <button type="button" className="min-w-0 flex-1 truncate text-left text-[14px]" onClick={() => typeof d !== "string" && setOpen(open === i ? null : i)}>
                    {s ? `${s.time} · ${s.title}` : `Mangler (${String(d)})`}
                  </button>
                  <button type="button" aria-label="Op" className="px-1 text-[#8e8e93]" onClick={() => move(i, -1)}>
                    ↑
                  </button>
                  <button type="button" aria-label="Ned" className="px-1 text-[#8e8e93]" onClick={() => move(i, 1)}>
                    ↓
                  </button>
                  <button type="button" aria-label="Fjern" className="px-1 text-[#c7c7cc] hover:text-[#ff3b30]" onClick={() => onChange({ ...line, day: line.day.filter((_, k) => k !== i) })}>
                    ×
                  </button>
                </div>
                {open === i && typeof d !== "string" && (
                  <div className="space-y-2 bg-[#f9f9fb] px-3 pb-3 pt-1">
                    <StopEditor stop={d} preview={preview} peopleHint="Tom = linjens lærere." onChange={(next) => onChange({ ...line, day: line.day.map((x, k) => (k === i ? next : x)) })} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={linkBtn}
            onClick={() => {
              const stop: LineDayStop = { id: newId(line.name), time: "", title: "Nyt stop på linjen" };
              onChange({ ...line, day: [...line.day, stop] });
              setOpen(line.day.length);
            }}
          >
            + Linjens eget stop
          </button>
          <select
            className="rounded-lg bg-white px-2 py-1 text-[13px] text-[#0071e3] ring-1 ring-black/[.06]"
            value=""
            onChange={(e) => e.target.value && onChange({ ...line, day: [...line.day, e.target.value] })}
          >
            <option value="">+ Fælles stop …</option>
            {L.shared.map((s) => (
              <option key={s.id} value={s.id}>
                {s.time} · {s.title}
              </option>
            ))}
          </select>
          {free.length > 0 && (
            <select
              className="rounded-lg bg-white px-2 py-1 text-[13px] text-[#0071e3] ring-1 ring-black/[.06]"
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (v.startsWith("gruppe:")) addRooms(groups.find((g) => g.title === v.slice(7))?.rooms ?? []);
                else if (v) addRooms(free.filter(([, h]) => h === v).slice(0, 1));
              }}
            >
              <option value="">+ Sted fra touren …</option>
              {groups.length > 0 && (
                <optgroup label="Hele menugruppen">
                  {groups.map((g) => (
                    <option key={g.title} value={`gruppe:${g.title}`}>
                      {g.title} ({g.rooms.length} steder)
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Ét sted">
                {free.map(([name, href]) => (
                  <option key={href} value={href}>
                    {name}
                  </option>
                ))}
              </optgroup>
            </select>
          )}
        </div>
      </Field>
      {own.length > 1 && L.mix !== false && (
        <Field title='Vises i "Lidt af det hele"'>
          <select className={`${input} bg-white`} value={line.signature ?? ""} onChange={(e) => onChange({ ...line, signature: e.target.value || undefined })}>
            <option value="">Linjens første egne stop</option>
            {own.map((s) => (
              <option key={s.id} value={s.id}>
                {s.time} · {s.title}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field title="Afslutning (valgfri)" hint='Fx "Linjen fylder 7 timer om ugen - resten af tiden er du sammen med hele skolen."'>
        <input className={`${input} bg-white`} value={line.outro ?? ""} onChange={(e) => onChange({ ...line, outro: e.target.value || undefined })} />
      </Field>
    </>
  );
}
