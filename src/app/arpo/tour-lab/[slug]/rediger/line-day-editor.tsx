"use client";

import { PersonPicker } from "./people-editor";
import { useState } from "react";
import type { CardPerson, LineDayStop, LineTrip, TourConfig } from "../../tours/types";
import { CardImages, Rows } from "./content";
import { menuRooms } from "./map-editor";
import { isPlaceHref } from "../../tours/places";
import { LinkInput } from "./links-open";
import { Choice, Field, Group, input, Toggle, UploadButton, type PreviewApi } from "./ui";

/*
 * "En linje på <skolen>" (was "En dag på din linje") in the editor: the shared stops (written once and
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

/** Moments most efterskoler share - the start for the shared ones (change them). */
const STARTER: LineDayStop[] = [
  { id: "morgenmad", place: "Spisesalen", title: "Morgenmad", text: "Dagen starter med morgenmad sammen med hele skolen." },
  { id: "morgensamling", place: "Fællessalen", title: "Morgensamling og fag", text: "Her mødes alle elever til morgensamling - og så er der skolefag." },
  { id: "frokost", place: "Spisesalen", title: "Frokost og rengøring", text: "Frokost sammen, og så en kort tur med kost og klud." },
  { id: "aftensmad", place: "Spisesalen", title: "Aftensmad", text: "Alle spiser sammen." },
  { id: "aftenkaffe", place: "Fællesrummet", title: "Aftenkaffe", text: "Dagen samles op over en kop te eller kaffe." },
  { id: "vaerelset", place: "Værelset", title: "Her slutter dagen", text: "Kl. 22.00 er du på værelset, og kl. 23.00 slukker vi lyset.", tags: ["Lys ud kl. 23.00"] },
];

export function LineDayEditor({ config, edit, preview }: { config: TourConfig; edit: Edit; preview: PreviewApi }) {
  const L = config.lineDays;
  const set = (fn: (l: L) => void) => edit((d) => void (d.lineDays && fn(d.lineDays)));

  if (!L)
    return (
      <Group>
        <p className="text-[14px] leading-snug">
          <b>En linje på {config.title || "skolen"}</b>: gæsten vælger en linje og ser, hvordan det er at gå der - 4-6 øjeblikke med linjens egne steder og skolens fælles, hver med et foto af livet dér, et par ord og lærerne, man møder. Fotoet toner over i det samme sted i touren. Til efterskoler med linjefag.
        </p>
        <button
          type="button"
          className="flex w-full items-center justify-center rounded-xl bg-[#0071e3] py-2.5 text-[15px] font-medium text-white hover:bg-[#0077ed]"
          onClick={() =>
            edit(
              (d) =>
                void (d.lineDays = {
                  title: `En linje på ${d.title || d.brand}`,
                  lead: "Vælg en linje og se, hvordan det er at gå der.",
                  shared: STARTER,
                  lines: [],
                  mix: { after: "frokost" },
                })
            )
          }
        >
          Lav &quot;En linje på&quot;
        </button>
        <p className={small}>Starter med et par fælles øjeblikke for hele skolen - ret tekster, sæt stederne og fotoene, og tilføj linjerne.</p>
      </Group>
    );

  const sharedName = (id: string) => L.shared.find((s) => s.id === id);

  return (
    <>
      <Group>
        <p className={small}>
          Åbnes med linket <b>#linjedag</b> (vælg linje) eller <b>#linjedag:&lt;linje&gt;</b> - sæt det på en flise, i menuen eller på en knap.{" "}
          <button type="button" className={linkBtn} onClick={() => preview.go("En linje på", "#linjedag")}>
            Vis i forhåndsvisningen
          </button>
        </p>
        <Field title="Overskrift" hint={`Tom = "En linje på ${config.title || config.brand}".`}>
          <input className={`${input} bg-white`} placeholder={`En linje på ${config.title || config.brand}`} value={/^en dag på din linje$/i.test(L.title) ? "" : L.title} onChange={(e) => set((l) => void (l.title = e.target.value))} />
        </Field>
        {(/^en dag på din linje$/i.test(L.title) || L.shared.concat(L.lines.flatMap((x) => x.day.filter((d): d is LineDayStop => typeof d !== "string"))).some((x) => x.time)) && (
          <p className={small}>
            Lavet som &quot;En dag på din linje&quot;?{" "}
            <button
              type="button"
              className={linkBtn}
              onClick={() =>
                edit((d) => {
                  const l = d.lineDays;
                  if (!l) return;
                  if (/^en dag på din linje$/i.test(l.title) || /skoledag/i.test(l.title)) l.title = "";
                  for (const x of [...l.shared, ...l.lines.flatMap((y) => y.day.filter((z): z is LineDayStop => typeof z !== "string"))]) delete x.time;
                  // The menu's and the welcome's buttons to it get the new name too.
                  const name = `En linje på ${d.title || d.brand}`;
                  const rename = (e: { label?: string; title?: string; href?: string }) => {
                    if (!e.href?.startsWith("#linjedag")) return;
                    if (e.label && /dag på (din )?linje/i.test(e.label)) e.label = name;
                    if (e.title && /dag på (din )?linje/i.test(e.title)) e.title = name;
                  };
                  const walk = (v: unknown) => {
                    if (Array.isArray(v)) v.forEach(walk);
                    else if (v && typeof v === "object") {
                      rename(v as { label?: string; title?: string; href?: string });
                      Object.values(v).forEach(walk);
                    }
                  };
                  walk(d.menu);
                  walk(d.welcome);
                })
              }
            >
              Gør til &quot;En linje på&quot; - fjern tiderne og omdøb knapperne
            </button>
          </p>
        )}
        <Field title="Undertekst">
          <input className={`${input} bg-white`} value={L.lead ?? ""} onChange={(e) => set((l) => void (l.lead = e.target.value || undefined))} />
        </Field>
        <Field title="Stor knap i menuen" hint='Som "Vis mig rundt": en stor knap i accentfarven med "Vælg din linje". Øverst eller nederst i menuen.'>
          <Choice<"none" | "top" | "bottom">
            value={L.menu ?? "none"}
            options={[
              ["none", "Ingen"],
              ["top", "Øverst"],
              ["bottom", "Nederst"],
            ]}
            onChange={(v) => set((l) => void (v === "none" ? delete l.menu : (l.menu = v)))}
          />
        </Field>
        <Field title="Fotos ved et sted i touren" hint="Når et øjeblik har både et sted i touren og fotos: det første foto fylder skærmen og toner over i stedet, eller stedet står frit (man kan kigge rundt), og fotoene ligger som en række på kortet, der kan åbnes store.">
          <Choice<"reveal" | "strip">
            value={L.photosAtPlace ?? "reveal"}
            options={[
              ["reveal", "Fylder skærmen først"],
              ["strip", "Række på kortet"],
            ]}
            onChange={(v) => set((l) => void (v === "reveal" ? delete l.photosAtPlace : (l.photosAtPlace = v)))}
          />
        </Field>
        <Field title="Størrelse på kortet" hint="Kortet med foto til venstre og tekst til højre (øjeblikke uden et sted i touren). Kun på computer - på mobil fylder det skærmen.">
          <Choice<"small" | "medium" | "large">
            value={L.size ?? "medium"}
            options={[
              ["small", "Lille"],
              ["medium", "Mellem"],
              ["large", "Stor"],
            ]}
            onChange={(v) => set((l) => void (v === "medium" ? delete l.size : (l.size = v)))}
          />
        </Field>
        <Field title="Touren bag linjevalget" hint="Mens man vælger linje, går touren ind på skolen bagved. Standard: tourens start (det første scan).">
          <Choice<"start" | "here" | "none">
            value={L.backdrop === false ? "none" : L.backdrop ? "here" : "start"}
            options={[
              ["start", "Tourens start"],
              ["here", "Et bestemt sted"],
              ["none", "Bliv hvor den er"],
            ]}
            onChange={async (v) => {
              if (v === "start") return set((l) => void delete l.backdrop);
              if (v === "none") return set((l) => void (l.backdrop = false));
              const r = await preview.view();
              if (r.href) set((l) => void (l.backdrop = r.href));
            }}
          />
          {L.backdrop ? (
            <button
              type="button"
              className={`${linkBtn} self-start`}
              onClick={async () => {
                const r = await preview.view();
                if (r.href) set((l) => void (l.backdrop = r.href));
              }}
            >
              Brug stedet i forhåndsvisningen
            </button>
          ) : null}
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
          title={(s) => [s.time, s.title].filter(Boolean).join(" ")}
          subtitle={(s) => [s.place, s.href ? "har et sted" : "intet sted endnu", `${L.lines.filter((x) => x.day.includes(s.id)).length} linjer`].filter(Boolean).join(" · ")}
          empty="Ingen fælles stop endnu."
          editor={(s, put) => <StopEditor stop={s} config={config} onChange={put} preview={preview} />}
        />
        <button type="button" className={linkBtn} onClick={() => set((l) => void l.shared.push({ id: newId("stop"), title: "Nyt stop" }))}>
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
                  {[s.time, s.title].filter(Boolean).join(" ")}
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
      <button type="button" className="px-1 text-[13px] text-[#ff3b30]" onClick={() => confirm("Fjern hele En linje på?") && edit((d) => void (d.lineDays = undefined))}>
        Fjern En linje på
      </button>
    </>
  );
}

/** One stop: time, place, text, where in the tour, small facts and the people there. */
function StopEditor({ stop, onChange, preview, peopleHint, config }: { stop: LineDayStop; onChange: (s: LineDayStop) => void; preview: PreviewApi; peopleHint?: string; config?: TourConfig }) {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <div className="flex gap-1.5">
        <Field title="Tidspunkt (valgfrit)" hint="Lad den stå tom - linjen fortælles som øjeblikke, ikke som et skema.">
          <input className={`${input} bg-white`} placeholder="Ingen" value={stop.time ?? ""} onChange={(e) => onChange({ ...stop, time: e.target.value || undefined })} />
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
      <CardImages
        images={stop.images ?? []}
        max={3}
        shrink={1600}
        hint="1-3 fotos af livet dér. Med et sted i touren: det første fylder skærmen og toner over i stedet (tag det gerne fra samme sted som scanningen). Uden et sted (fx golfbanen eller åen): fotoene står stort med touren sløret bagved."
        onChange={(images) => onChange({ ...stop, images: images.length ? images : undefined })}
      />
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
      <People config={config} people={stop.people} onChange={(people) => onChange({ ...stop, people })} hint={peopleHint} />
    </>
  );
}

/** Up to 4 people: a photo, a name and a role. */
function People({ config, people, onChange, hint, title = "Personer her (valgfri)" }: { config?: TourConfig; people?: CardPerson[]; onChange: (p: CardPerson[] | undefined) => void; hint?: string; title?: string }) {
  const list = people ?? [];
  const put = (next: CardPerson[]) => onChange(next.length ? next : undefined);
  const team = config?.team?.people ?? [];
  return (
    <Field title={title} hint={hint ?? "Højst 4 - rigtige portrætter, gerne fra skolens hjemmeside."}>
      <div className="space-y-1.5">
        {config && <PersonPicker config={config} people={list} onChange={put} max={4} />}
        {list.map((p, i) => team.some((t) => t.id === p.id) ? null : (
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
        {list.length < 4 && <UploadButton accept="image/*" label="+ Personer (billeder)" onMany={(urls) => put([...list, ...urls.map((image) => ({ image }))].slice(0, 4))} />}
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
  const addRooms = (rooms: [string, string][]) => onChange({ ...line, day: [...line.day, ...rooms.map(([name, href]): LineDayStop => ({ id: newId(name), place: name, title: name, href }))] });
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
      <Field title="Overblik i starten" hint='Vises først, før øjeblikkene - hvordan linjen er over en uge og et år. Med et sted i touren (fx ridehallen) står det dér uden foto; ellers med linjens foto og touren sløret bagved. Fx overskrift "En uge på Fiskelinjen" og skolens egen tekst. Tom tekst = intet overblik.'>
        <input className={`${input} bg-white`} placeholder={`Overskrift (tom = ${line.name})`} value={line.intro?.title ?? ""} onChange={(e) => onChange({ ...line, intro: { text: line.intro?.text ?? "", ...line.intro, title: e.target.value || undefined } })} />
        <textarea className={`${textarea} mt-1.5`} placeholder="Du har en hel formiddag og en hel eftermiddag hver uge, hvor det kun handler om fiskeri ..." value={line.intro?.text ?? ""} onChange={(e) => onChange({ ...line, intro: e.target.value || line.intro?.title || line.intro?.facts?.length ? { ...line.intro, text: e.target.value } : undefined })} />
        <FactsInput key={line.id} facts={line.intro?.facts ?? []} onChange={(facts) => onChange({ ...line, intro: { text: line.intro?.text ?? "", ...line.intro, facts: facts.length ? facts : undefined } })} />
        <IntroPlace href={line.intro?.href ?? ""} preview={preview} onChange={(href) => onChange({ ...line, intro: { text: line.intro?.text ?? "", ...line.intro, href: href || undefined } })} />
      </Field>
      <Field title="Linjens foto" hint="Vises som flisen, når man vælger linje - linjens bedste billede. Tom = det første foto i linjens egne øjeblikke.">
        <div className="flex items-center gap-3">
          {line.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={line.image} alt="" className="h-12 w-16 rounded-lg object-cover ring-1 ring-black/[.06]" />
          )}
          <UploadButton accept="image/*" shrink={1400} label={line.image ? "Skift" : "+ Foto"} onDone={(image) => onChange({ ...line, image })} />
          {line.image && (
            <button type="button" className={linkBtn} onClick={() => onChange({ ...line, image: undefined })}>
              Fjern
            </button>
          )}
        </div>
      </Field>
      <People config={config} title="Linjens lærere" people={line.people} onChange={(people) => onChange({ ...line, people })} hint="Vises ved linjen og på linjens egne stop - højst 4." />
      <Field title="Dagen" hint="I rækkefølge. Fælles stop er skolens; linjens egne ligger imellem.">
        <div className="-mx-1 divide-y divide-black/[.05] rounded-xl bg-white ring-1 ring-black/[.05]">
          {line.day.map((d, i) => {
            const s = typeof d === "string" ? sharedName(d) : d;
            return (
              <div key={(typeof d === "string" ? d : d.id) + i}>
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${typeof d === "string" ? "bg-[#5856d6]/10 text-[#5856d6]" : "bg-[#ff9500]/15 text-[#c76a00]"}`}>{typeof d === "string" ? "Fælles" : "Linjen"}</span>
                  <button type="button" className="min-w-0 flex-1 truncate text-left text-[14px]" onClick={() => typeof d !== "string" && setOpen(open === i ? null : i)}>
                    {s ? [s.time, s.title].filter(Boolean).join(" ") : `Mangler (${String(d)})`}
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
                    <StopEditor stop={d} config={config} preview={preview} peopleHint="Tom = linjens lærere." onChange={(next) => onChange({ ...line, day: line.day.map((x, k) => (k === i ? next : x)) })} />
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
              const stop: LineDayStop = { id: newId(line.name), title: "Nyt stop på linjen" };
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
                {[s.time, s.title].filter(Boolean).join(" ")}
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
                {[s.time, s.title].filter(Boolean).join(" ")}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field title="Afslutning (valgfri)" hint='Fx "Linjen fylder 7 timer om ugen - resten af tiden er du sammen med hele skolen."'>
        <input className={`${input} bg-white`} value={line.outro ?? ""} onChange={(e) => onChange({ ...line, outro: e.target.value || undefined })} />
      </Field>
      <TripsEditor trips={line.trips ?? []} onChange={(trips) => onChange({ ...line, trips: trips.length ? trips : undefined })} />
    </>
  );
}

/** "Linjens rejser": the trips shown when the line's day ends ("Det venter dig også") - up to 6. */
function TripsEditor({ trips, onChange }: { trips: LineTrip[]; onChange: (t: LineTrip[]) => void }) {
  const put = (i: number, t: Partial<LineTrip>) => onChange(trips.map((x, k) => (k === i ? { ...x, ...t } : x)));
  return (
    <Field title="Linjens rejser (valgfri)" hint='Vises, når dagen er slut, under "Det venter dig også" - fx "Uge 44 · Gåsejagt i Vadehavet". Højst 6.'>
      <div className="space-y-2">
        {trips.map((t, i) => (
          <div key={i} className="space-y-1.5 rounded-xl bg-white p-2.5 ring-1 ring-black/[.05]">
            <div className="flex gap-1.5">
              <input className={`${input} w-28 flex-none bg-white`} placeholder="Uge 44" value={t.when ?? ""} onChange={(e) => put(i, { when: e.target.value || undefined })} />
              <input className={`${input} bg-white`} placeholder="Gåsejagt i Vadehavet" value={t.title} onChange={(e) => put(i, { title: e.target.value })} />
              <button type="button" aria-label="Fjern rejsen" className="px-1 text-[#c7c7cc] hover:text-[#ff3b30]" onClick={() => onChange(trips.filter((_, k) => k !== i))}>
                ×
              </button>
            </div>
            <textarea className={textarea} placeholder="Et par ord om turen (valgfri)" value={t.text ?? ""} onChange={(e) => put(i, { text: e.target.value || undefined })} />
            <div className="flex items-center gap-2">
              {t.image && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.image} alt="" className="h-12 w-16 rounded-lg object-cover ring-1 ring-black/[.06]" />
                  <button type="button" className={linkBtn} onClick={() => put(i, { image: undefined })}>
                    Fjern billedet
                  </button>
                </>
              )}
              {!t.image && <UploadButton accept="image/*" shrink={1400} label="+ Billede" onDone={(image) => put(i, { image })} />}
            </div>
          </div>
        ))}
        {trips.length < 6 && (
          <button type="button" className={linkBtn} onClick={() => onChange([...trips, { title: "" }])}>
            + Rejse eller oplevelse
          </button>
        )}
      </div>
    </Field>
  );
}

/** The overview's facts as one line, comma between - kept as typed while writing, saved as a list when the field is left. */
function FactsInput({ facts, onChange }: { facts: string[]; onChange: (facts: string[]) => void }) {
  const [text, setText] = useState(facts.join(", "));
  return (
    <input
      className={`${input} mt-1.5 bg-white`}
      placeholder="Fakta, adskilt med komma: 1 formiddag + 1 eftermiddag om ugen, 2 linjefagsuger om året"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onChange(text.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 6))}
    />
  );
}

/** Where the overview stands in the tour (e.g. the riding hall) - from the preview, or a link. Empty: the line's photo instead. */
function IntroPlace({ href, preview, onChange }: { href: string; preview: PreviewApi; onChange: (href: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      <LinkInput className="bg-white" placeholder="@ stedet i touren (tom = linjens foto)" value={href} onChange={onChange} />
      <button
        type="button"
        disabled={busy}
        className={`${linkBtn} self-start`}
        onClick={async () => {
          setBusy(true);
          const r = await preview.view();
          setBusy(false);
          if (r.href) onChange(r.href);
        }}
      >
        {busy ? "Henter…" : "Overblikket står i stedet i forhåndsvisningen"}
      </button>
    </div>
  );
}
