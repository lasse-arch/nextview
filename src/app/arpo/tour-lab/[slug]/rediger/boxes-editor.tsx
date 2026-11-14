"use client";

import type { TourBox, TourConfig } from "../../tours/types";
import { Rows } from "./content";
import { LinkInput } from "./links-open";
import { Field, Group, input, UploadButton } from "./ui";

type Edit = (fn: (d: TourConfig) => void) => void;
const small = "px-1 text-[12px] leading-snug text-[#8e8e93]";

/** An id from the title ("Fitness United Wave" → "fitness-united-wave"), not one the tour already has. */
function boxId(title: string, taken: string[]): string {
  const base = title.toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "boks";
  let id = base;
  for (let i = 2; taken.includes(id); i++) id = `${base}-${i}`;
  return id;
}

/**
 * "Infobokse": a few words about something (Wave, the sauna, a membership …)
 * in a box over the tour - opened by a button anywhere with the link
 * "#boks:<id>", or by typing "@" and its title in a link field.
 */
export function BoxesEditor({ config, edit }: { config: TourConfig; edit: Edit }) {
  const boxes = config.boxes ?? [];
  const setBoxes = (next: TourBox[]) => edit((d) => void (d.boxes = next.length ? next : undefined));
  return (
    <Group title="Infobokse">
      <p className={small}>
        En lille boks med en overskrift, et par linjer og evt. et billede og en knap - fx &quot;Læs om Wave&quot;. Den åbnes af en knap med linket <code>#boks:&lt;id&gt;</code>: på et stop i Vis mig rundt, et stedkort, en flise eller i menuen. I et link-felt kan du også bare skrive @ og boksens titel.
      </p>
      <Rows<TourBox>
        items={boxes}
        onChange={setBoxes}
        icon={["bg-[#5ac8fa]", '<rect x="4" y="5" width="16" height="14" rx="3"/><path d="M8 10h8M8 14h5"/>']}
        title={(b) => b.title || "Ny infoboks"}
        subtitle={(b) => `#boks:${b.id}${b.image ? " · billede" : ""}${b.link?.label ? " · knap" : ""}`}
        empty="Ingen endnu."
        editor={(b, set) => (
          <>
            <Field title="Overskrift">
              <input
                className={`${input} bg-white`}
                placeholder="Fitness United Wave"
                value={b.title}
                onChange={(e) => {
                  // The id (the link's end) follows the title while nothing links to it yet - then it stays, so no link breaks.
                  const used = JSON.stringify(config).includes(`"#boks:${b.id}"`);
                  set({ ...b, title: e.target.value, id: used ? b.id : boxId(e.target.value, boxes.filter((x) => x !== b).map((x) => x.id)) });
                }}
              />
            </Field>
            <Field title="Tekst" hint="Kort - et par linjer. Tom linje = nyt afsnit.">
              <textarea rows={4} className={`${input} bg-white`} value={b.text} onChange={(e) => set({ ...b, text: e.target.value })} />
            </Field>
            <Field title="Billede (valgfrit)">
              <div className="flex flex-wrap items-center gap-2">
                {b.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.image} alt="" className="h-14 w-24 rounded-lg object-cover" />
                )}
                <UploadButton accept="image/*" shrink={1600} label={b.image ? "Skift billede" : "Upload billede"} onDone={(image) => set({ ...b, image })} />
                {b.image && (
                  <button type="button" className="text-[13px] text-[#ff3b30]" onClick={() => set({ ...b, image: undefined })}>
                    Fjern
                  </button>
                )}
              </div>
            </Field>
            <Field title="Knap i boksen (valgfri)" hint="Fx Bliv medlem - en side, eller noget i touren (skriv @).">
              <input
                className={`${input} bg-white`}
                placeholder="Tekst på knappen"
                value={b.link?.label ?? ""}
                onChange={(e) => set({ ...b, link: e.target.value || b.link?.href ? { label: e.target.value, href: b.link?.href ?? "" } : undefined })}
              />
              <LinkInput className="mt-1.5 bg-white" value={b.link?.href ?? ""} onChange={(href) => set({ ...b, link: href || b.link?.label ? { label: b.link?.label ?? "", href } : undefined })} />
            </Field>
            <p className={small}>
              Linket til boksen: <code className="select-all">#boks:{b.id}</code>
            </p>
          </>
        )}
      />
      <button
        type="button"
        className="px-1 text-left text-[13px] font-medium text-[#0071e3] hover:underline"
        onClick={() => setBoxes([...boxes, { id: boxId("boks", boxes.map((b) => b.id)), title: "", text: "" }])}
      >
        + Ny infoboks
      </button>
    </Group>
  );
}
