"use client";

import type { CardPerson, TeamPerson, TourConfig } from "../../tours/types";
import { personId, pickOf } from "../../tours/people";
import { Rows } from "./content";
import { Field, Group, input, UploadButton, type PreviewApi } from "./ui";

type Edit = (fn: (d: TourConfig) => void) => void;
const small = "px-1 text-[12px] leading-snug text-[#8e8e93]";
const linkBtn = "px-1 text-left text-[13px] font-medium text-[#0071e3] hover:underline disabled:opacity-50";

/*
 * "Personer": the tour's people, made once - photo, name, role, a few words,
 * a quote, what to ask them about and where you meet them - and picked
 * everywhere the tour shows people (place cards, "Vis mig rundt", a line's
 * teachers …), see tours/people.ts. They're also "Mød os" ("#mod").
 */
export function PeopleEditor({ config, edit, preview }: { config: TourConfig; edit: Edit; preview: PreviewApi }) {
  const people = config.team?.people ?? [];
  const setPeople = (next: TeamPerson[]) => edit((d) => void (d.team = next.length ? { ...(d.team ?? {}), people: next } : undefined));
  const inMenu = config.menu.some((m) => ("items" in m ? m.items.some(([, h]) => h.startsWith("#mod")) : m.href.startsWith("#mod")));
  const loose = loosePeople(config);

  /** "Hent personer fra touren": the people written on cards, stops and lines (not yet in the list) - into it, and picked there. */
  function gather() {
    edit((d) => {
      const list = [...(d.team?.people ?? [])];
      const byImage = new Map(list.map((p) => [p.image, p.id]));
      eachPeople(d, (arr) => {
        arr.forEach((p, i) => {
          if (p.id || !p.image) return;
          let id = byImage.get(p.image);
          if (!id) {
            id = personId(p.name || "person", list.map((x) => x.id));
            list.push({ id, name: p.name?.trim() || "Uden navn", ...(p.role ? { role: p.role } : {}), image: p.image });
            byImage.set(p.image, id);
          }
          arr[i] = { ...p, id };
        });
      });
      d.team = { ...(d.team ?? {}), people: list };
    });
  }

  return (
    <div className="space-y-6">
      <Group title="Personer">
        <p className={small}>
          Personerne laves her én gang - og vælges alle steder, touren viser personer: stedkort, Vis mig rundt, linjernes lærere. Ret et foto eller en rolle her, så skifter det overalt. De er også &quot;Mød os&quot;: en profil med stort foto, lidt om dem, et citat og &quot;Se hvor du møder …&quot;.
        </p>
        <Rows<TeamPerson>
          items={people}
          onChange={setPeople}
          icon={["bg-[#af52de]", '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/>']}
          title={(p) => p.name || "Ny person"}
          subtitle={(p) => [p.role, p.image ? null : "mangler foto", p.bio ? null : "ingen tekst", p.href ? "har et sted" : null].filter(Boolean).join(" · ") || "-"}
          empty="Ingen endnu."
          editor={(p, set) => <PersonFields p={p} set={set} preview={preview} />}
        />
        <UploadButton
          accept="image/*"
          shrink={1600}
          label="+ Ny person (vælg et foto)"
          className={linkBtn}
          onDone={(image) => setPeople([...people, { id: personId("person", people.map((x) => x.id)), name: "", image }])}
        />
        {loose > 0 && (
          <button type="button" className={linkBtn} onClick={gather}>
            Hent {loose} person{loose === 1 ? "" : "er"} fra touren ind i listen (fra stedkort, rundvisning og linjer)
          </button>
        )}
      </Group>

      {people.length > 0 && (
        <Group title="Mød os">
          <Field title="Overskrift" hint='Tom: "Mød os". Fx "Mød Per og Enrico".'>
            <input className={`${input} bg-white`} placeholder="Mød os" value={config.team?.title ?? ""} onChange={(e) => edit((d) => void (d.team = { ...(d.team ?? { people: [] }), title: e.target.value || undefined }))} />
          </Field>
          <p className={small}>Åbnes fra et menupunkt, en flise eller en knap med linket &quot;#mod&quot; (alle) eller &quot;#mod:{people[0].id}&quot; (én). Personerne på stedkort og i rundvisningen åbner også deres profil.</p>
          {!inMenu && (
            <button
              type="button"
              className={linkBtn}
              onClick={() => edit((d) => void d.menu.push({ title: d.team?.title || (people.length <= 2 ? `Mød ${people.map((p) => p.name.split(/\s+/)[0]).filter(Boolean).join(" og ")}` : "Mød os"), href: "#mod" }))}
            >
              + Læg &quot;Mød os&quot; i menuen
            </button>
          )}
        </Group>
      )}
    </div>
  );
}

function PersonFields({ p, set, preview }: { p: TeamPerson; set: (next: TeamPerson) => void; preview: PreviewApi }) {
  const put = (patch: Partial<TeamPerson>) => set({ ...p, ...patch });
  return (
    <>
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {p.image ? <img src={p.image} alt="" className="h-16 w-16 rounded-full object-cover object-[50%_20%]" /> : <div className="h-16 w-16 rounded-full bg-[#f2f2f7]" />}
        <UploadButton accept="image/*" shrink={1600} label="Skift foto" onDone={(image) => put({ image })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field title="Navn">
          <input className={`${input} bg-white`} placeholder="Per Muldbjerg" value={p.name} onChange={(e) => put({ name: e.target.value })} />
        </Field>
        <Field title="Rolle">
          <input className={`${input} bg-white`} placeholder="Medejer og direktør" value={p.role ?? ""} onChange={(e) => put({ role: e.target.value || undefined })} />
        </Field>
      </div>
      <Field title="Om personen" hint="Et par korte afsnit - tom linje imellem.">
        <textarea rows={5} className={`${input} bg-white`} value={p.bio ?? ""} onChange={(e) => put({ bio: e.target.value || undefined })} />
      </Field>
      <Field title="Citat (valgfrit)" hint='Deres egne ord, fx "Vi sælger kvalitet til de rigtige penge."'>
        <input className={`${input} bg-white`} value={p.quote ?? ""} onChange={(e) => put({ quote: e.target.value || undefined })} />
      </Field>
      <Field title="Spørg mig om (valgfrit)" hint='Står efter "Spørg Per, …", fx "når du skal finde den franske flaske til middagen."'>
        <input className={`${input} bg-white`} value={p.ask ?? ""} onChange={(e) => put({ ask: e.target.value || undefined })} />
      </Field>
      <Field title="Her møder du mig (valgfrit)" hint='Giver knappen "Se hvor du møder …" i profilen.'>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-[#6e6e73]">{p.href ? "Et sted i touren er valgt" : "Intet sted"}</span>
          <button
            type="button"
            className={linkBtn}
            onClick={async () => {
              const r = await preview.view();
              if (r.href) put({ href: r.href });
              else alert(r.error ?? "Gå ind i touren i forhåndsvisningen og stil dig, hvor man møder personen.");
            }}
          >
            Brug stedet i forhåndsvisningen
          </button>
          {p.href && (
            <button type="button" className="text-[13px] text-[#ff3b30]" onClick={() => put({ href: undefined })}>
              Fjern
            </button>
          )}
        </div>
      </Field>
      <p className={small}>Id: {p.id} - linket til kun denne person er &quot;#mod:{p.id}&quot;.</p>
    </>
  );
}

/** Every "people" list in a tour (place cards, stops, lines, the schedule …), to change in place. */
function eachPeople(d: TourConfig, fn: (arr: CardPerson[]) => void) {
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    for (const [k, x] of Object.entries(v)) {
      if (k === "team") continue;
      if (k === "people" && Array.isArray(x) && x.every((p) => p && typeof p === "object")) fn(x as CardPerson[]);
      else walk(x);
    }
  };
  walk(d);
}

/** How many people in the tour are written on a card/stop/line only (not picked from the list) - different photos. */
function loosePeople(c: TourConfig): number {
  const known = new Set((c.team?.people ?? []).map((p) => p.image));
  const seen = new Set<string>();
  eachPeople(c, (arr) => arr.forEach((p) => !p.id && p.image && !known.has(p.image) && seen.add(p.image)));
  return seen.size;
}

/**
 * "Vælg fra Personer": the tour's people as small faces to tick - used
 * wherever people are put on something (a place card, a stop, a line). A
 * picked one shows from the list (its photo, name and role as they are there).
 */
export function PersonPicker({ config, people, onChange, max }: { config: TourConfig; people: CardPerson[]; onChange: (p: CardPerson[]) => void; max: number }) {
  const team = config.team?.people ?? [];
  if (!team.length) return <p className={small}>Lav personerne under fanen Personer - så kan de vælges her og alle andre steder.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {team.map((t) => {
        const on = people.some((p) => p.id === t.id);
        return (
          <button
            key={t.id}
            type="button"
            disabled={!on && people.length >= max}
            onClick={() => onChange(on ? people.filter((p) => p.id !== t.id) : [...people, pickOf(t)])}
            className={`flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-[13px] ring-1 disabled:opacity-40 ${on ? "bg-[#0071e3] text-white ring-[#0071e3]" : "bg-white ring-black/[.08]"}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.image} alt="" className="h-6 w-6 rounded-full object-cover object-[50%_20%]" />
            {t.name || "Uden navn"}
          </button>
        );
      })}
    </div>
  );
}
