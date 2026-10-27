"use client";

import type { TourConfig } from "../../tours/types";
import { Field, Group, Icon, Toggle, input } from "./ui";

type Finder = NonNullable<TourConfig["finder"]>;
type Edit = (fn: (d: TourConfig) => void) => void;

/** A start for a campsite - the places are ticked afterwards. */
const CAMPING: Finder = {
  title: "Find jeres plads",
  lead: "Tre hurtige spørgsmål - så viser vi jer det sted, der passer bedst.",
  button: "Find jeres plads",
  questions: [
    { q: "Hvem kommer?", options: [{ label: "Familie med børn", points: [] }, { label: "Os to", points: [] }, { label: "En gruppe venner", points: [] }] },
    { q: "Hvad bor I i?", options: [{ label: "Telt", points: [] }, { label: "Campingvogn eller autocamper", points: [] }, { label: "Hytte", points: [] }] },
    { q: "Hvad er vigtigst?", options: [{ label: "Tæt på stranden", points: [] }, { label: "Tæt på badeland og leg", points: [] }, { label: "Ro og natur", points: [] }] },
  ],
};
const BLANK: Finder = { title: "Find det rette sted", button: "Find det rette sted", questions: [{ q: "Hvad leder I efter?", options: [{ label: "Svar 1", points: [] }, { label: "Svar 2", points: [] }] }] };

/**
 * "Find din plads": the questions and, per answer, the places on the picture
 * that fit it. The place most answers point at is the one shown.
 */
export function FinderEditor({ config, edit }: { config: TourConfig; edit: Edit }) {
  const F = config.finder;
  const set = (fn: (f: Finder) => void) => edit((d) => void fn(d.finder!));
  const unticked = F ? config.points.filter((p) => !F.questions.some((q) => q.options.some((o) => o.points.includes(p.id)))) : [];
  return (
    <Group title="Find din plads">
      <Toggle
        on={Boolean(F)}
        title="Spørgsmål, der finder det rette sted"
        hint="Gæsten svarer på et par spørgsmål, og touren flyver hen til det sted på billedet, der passer bedst - med kortet og Book-knappen."
        onChange={(on) => edit((d) => void (d.finder = on ? structuredClone(/camp/i.test(`${d.brand} ${d.title}`) ? CAMPING : BLANK) : undefined))}
      />
      {F && (
        <>
          <div className="flex gap-2">
            <button type="button" className="rounded-lg bg-[#f2f2f7] px-2.5 py-1 text-[12px] font-medium text-[#0071e3]" onClick={() => edit((d) => void (d.finder = structuredClone(CAMPING)))}>
              Brug camping-spørgsmål
            </button>
          </div>
          <Field title="Overskrift">
            <input className={input} value={F.title} onChange={(e) => set((f) => void (f.title = e.target.value))} />
          </Field>
          <Field title="Kort tekst (valgfri)">
            <input className={input} value={F.lead ?? ""} onChange={(e) => set((f) => void (f.lead = e.target.value || undefined))} />
          </Field>
          <Field title="Knappen" hint='I boksen øverst på billedet. Linket "#find" åbner også spørgsmålene (fx fra menuen eller en flise).'>
            <input className={input} value={F.button} onChange={(e) => set((f) => void (f.button = e.target.value))} />
          </Field>

          {F.questions.map((q, qi) => (
            <div key={qi} className="space-y-2 rounded-xl bg-[#f7f7f9] p-3">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold text-[#8e8e93]">{qi + 1}.</span>
                <input className={`${input} bg-white font-medium`} value={q.q} onChange={(e) => set((f) => void (f.questions[qi].q = e.target.value))} />
                <button type="button" title="Fjern spørgsmålet" disabled={F.questions.length < 2} className="text-[#c7c7cc] hover:text-[#ff3b30] disabled:opacity-30" onClick={() => set((f) => void f.questions.splice(qi, 1))}>
                  <Icon d='<path d="M6 6l12 12M18 6L6 18"/>' className="h-4 w-4" />
                </button>
              </div>
              {q.options.map((o, oi) => (
                <div key={oi} className="space-y-1.5 rounded-lg bg-white p-2.5 ring-1 ring-black/[.05]">
                  <div className="flex items-center gap-2">
                    <input className={`${input} py-1.5 text-[14px]`} value={o.label} onChange={(e) => set((f) => void (f.questions[qi].options[oi].label = e.target.value))} />
                    <button type="button" title="Fjern svaret" disabled={q.options.length < 2} className="text-[#c7c7cc] hover:text-[#ff3b30] disabled:opacity-30" onClick={() => set((f) => void f.questions[qi].options.splice(oi, 1))}>
                      <Icon d='<path d="M6 6l12 12M18 6L6 18"/>' className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-[11px] text-[#8e8e93]">Steder, der passer til svaret:</p>
                  <div className="flex flex-wrap gap-1">
                    {config.points.map((p) => {
                      const on = o.points.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => set((f) => void (f.questions[qi].options[oi].points = on ? o.points.filter((x) => x !== p.id) : [...o.points, p.id]))}
                          className={`rounded-full px-2.5 py-1 text-[12px] ${on ? "bg-[#0071e3] text-white" : "bg-[#f2f2f7] text-[#1d1d1f] hover:bg-[#e9e9eb]"}`}
                        >
                          {p.name}
                        </button>
                      );
                    })}
                    {config.points.length === 0 && <span className="text-[12px] text-[#8e8e93]">Sæt først punkter på billedet.</span>}
                  </div>
                </div>
              ))}
              <button type="button" className="text-[13px] font-medium text-[#0071e3]" onClick={() => set((f) => void f.questions[qi].options.push({ label: "Nyt svar", points: [] }))}>
                + Svar
              </button>
            </div>
          ))}
          {F.questions.length < 5 && (
            <button type="button" className="w-full rounded-xl bg-white py-2 text-[13px] font-medium text-[#0071e3] ring-1 ring-black/[.06]" onClick={() => set((f) => void f.questions.push({ q: "Nyt spørgsmål", options: [{ label: "Svar 1", points: [] }, { label: "Svar 2", points: [] }] }))}>
              + Spørgsmål
            </button>
          )}
          {unticked.length > 0 && unticked.length < config.points.length && (
            <p className="px-1 text-[12px] text-[#8e8e93]">Aldrig valgt af et svar: {unticked.map((p) => p.name).join(", ")}.</p>
          )}
          {unticked.length === config.points.length && config.points.length > 0 && (
            <p className="px-1 text-[12px] text-[#ff9500]">Sæt flueben ved stederne under hvert svar - ellers kan touren ikke finde noget, og knappen vises ikke.</p>
          )}
        </>
      )}
    </Group>
  );
}
