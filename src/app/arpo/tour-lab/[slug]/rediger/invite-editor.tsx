"use client";

import type { TourConfig } from "../../tours/types";
import { allGuides } from "../../tours/places";
import { Field, Group, input, Toggle } from "./ui";

type Edit = (fn: (d: TourConfig) => void) => void;
const small = "px-1 text-[12px] leading-snug text-[#8e8e93]";

/** "Invitation til rundvisning" (TourConfig.invite): the card that asks "Skal jeg vise dig rundt?" when the tour starts straight in. */
export function InviteEditor({ config, edit }: { config: TourConfig; edit: Edit }) {
  const inv = config.invite;
  const set = (patch: Partial<NonNullable<TourConfig["invite"]>>) => edit((d) => void (d.invite = { ...(d.invite ?? {}), ...patch }));
  const people = (config.team?.people ?? []).filter((p) => p.image);
  const guides = allGuides(config);
  const direct = (config.design?.welcome ?? (config.cover ? "cover" : config.welcome ? "tiles" : "none")) === "none";
  return (
    <Group title="Invitation til rundvisning">
      <Toggle
        on={Boolean(inv)}
        onChange={(on) =>
          edit((d) => {
            if (!on) return void (d.invite = undefined);
            // A person from Personer by default - the first one (e.g. the centre's manager).
            const first = (d.team?.people ?? []).find((p) => p.image);
            d.invite = first ? { person: first.id } : {};
          })
        }
        title='"Skal jeg vise dig rundt?"'
        hint="Når touren starter direkte i rummet: et lille kort lidt efter, med en persons ansigt, hvor lang rundvisningen er, Vis mig rundt og Jeg kigger selv rundt. Én gang pr. besøg - og det går væk af sig selv, når gæsten begynder at kigge rundt."
      />
      {inv && (
        <>
          {!direct && <p className="rounded-xl bg-[#fff8e6] px-3 py-2 text-[12px] leading-snug text-[#8a6100]">Vises kun, når touren starter direkte (Layout → Sådan starter touren → Direkte i touren).</p>}
          {!guides.length && <p className="rounded-xl bg-[#fff8e6] px-3 py-2 text-[12px] leading-snug text-[#8a6100]">Touren har ingen rundvisning endnu - lav den ovenfor, så kommer kortet.</p>}
          <Field title="Hvem inviterer?" hint="En person fra Personer - foto, navn og rolle. Ingen: kortet uden ansigt.">
            <select className={`${input} bg-white`} value={inv.person ?? ""} onChange={(e) => set({ person: e.target.value || undefined })}>
              <option value="">Ingen person</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {[p.name, p.role].filter(Boolean).join(" - ") || p.id}
                </option>
              ))}
            </select>
          </Field>
          {guides.length > 1 && (
            <Field title="Rundvisningen">
              <select className={`${input} bg-white`} value={inv.guide ?? ""} onChange={(e) => set({ guide: e.target.value || undefined })}>
                {guides.map((g) => (
                  <option key={g.id ?? ""} value={g.id ?? ""}>
                    {g.title}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field title="Overskrift">
            <input className={`${input} bg-white`} placeholder="Skal jeg vise dig rundt?" value={inv.title ?? ""} onChange={(e) => set({ title: e.target.value || undefined })} />
          </Field>
          <Field title="Lidt tekst (valgfri)" hint="Én sætning, fx Jeg tager dig med fra træningsgulvet til Wave og holdsalen.">
            <input className={`${input} bg-white`} value={inv.text ?? ""} onChange={(e) => set({ text: e.target.value || undefined })} />
          </Field>
          <div className="flex gap-2">
            <Field title="Knappen">
              <input className={`${input} bg-white`} placeholder="Vis mig rundt" value={inv.button ?? ""} onChange={(e) => set({ button: e.target.value || undefined })} />
            </Field>
            <Field title="Nej tak-linket">
              <input className={`${input} bg-white`} placeholder="Jeg kigger selv rundt" value={inv.skip ?? ""} onChange={(e) => set({ skip: e.target.value || undefined })} />
            </Field>
          </div>
          <p className={small}>I forhåndsvisningen kommer kortet hver gang; for gæsterne én gang pr. besøg.</p>
        </>
      )}
    </Group>
  );
}
