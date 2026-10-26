"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { previewLiveData, setupLiveData } from "@/lib/actions/tour-ai";
import type { LiveUnit } from "@/lib/availability/live";
import type { TourConfig } from "../../tours/types";
import { Field, Group, Icon, input, type PreviewApi } from "./ui";

/*
 * "Live data": free pitches, rooms, storage units … read live off the
 * customer's own page. Claude reads the page once and writes the recipe
 * (shown here with what it finds); after that the tour reads the page itself
 * every 10 minutes. Units can be left out one by one - or many at once by
 * holding the mouse down and dragging over the list.
 */

type Edit = (fn: (draft: TourConfig) => void) => void;

export function LiveDataEditor({ config, edit, slug, preview }: { config: TourConfig; edit: Edit; slug: string; preview: PreviewApi }) {
  const live = config.live;
  const [url, setUrl] = useState(live?.url ?? "");
  const [what, setWhat] = useState("");
  const [units, setUnits] = useState<LiveUnit[] | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const paint = useRef<boolean | null>(null);

  // The units the saved setup finds right now.
  useEffect(() => {
    if (!live) return;
    let off = false;
    previewLiveData(live).then((r) => !off && (r.ok ? setUnits(r.units) : setError(r.error)));
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.url, live?.pattern, live?.flags]);
  useEffect(() => {
    const up = () => (paint.current = null);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  function read() {
    setError(null);
    start(async () => {
      const r = await setupLiveData(slug, url, what).catch((err: unknown) => ({ ok: false as const, error: String(err) }));
      if (!r.ok) return setError(r.error);
      setUnits(r.units);
      setExplanation(r.explanation);
      edit((d) => void (d.live = { ...r.spec, exclude: d.live?.exclude, bookLabel: d.live?.bookLabel }));
    });
  }

  const excluded = new Set(live?.exclude ?? []);
  const setShown = (names: string[], show: boolean) =>
    edit((d) => {
      if (!d.live) return;
      const ex = new Set(d.live.exclude ?? []);
      names.forEach((n) => (show ? ex.delete(n) : ex.add(n)));
      d.live.exclude = ex.size ? [...ex] : undefined;
    });

  return (
    <>
      <Group>
        <p className="text-[14px] leading-snug">Vis ledige pladser, rum eller boliger direkte fra kundens egen side - fx ledige campingpladser eller depotrum. Touren viser dem live og opdaterer selv hvert 10. minut.</p>
        <Field title="Siden med de ledige" hint="Den side på kundens hjemmeside, hvor listen står.">
          <input className={input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://kunden.dk/ledige-pladser" />
        </Field>
        <Field title="Hvad skal læses? (valgfrit)">
          <input className={input} value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Fx ledige campingpladser med nummer, størrelse og pris" />
        </Field>
        <button type="button" disabled={pending || !url.trim()} onClick={read} className="w-full rounded-xl bg-[#0071e3] py-2.5 text-[15px] font-medium text-white disabled:opacity-40">
          {pending ? "Claude læser siden…" : live ? "Læs siden igen med Claude" : "Læs siden med Claude"}
        </button>
        {error && <p className="px-1 text-[12px] text-[#ff3b30]">{error}</p>}
        {explanation && <p className="px-1 text-[12px] leading-snug text-[#6e6e73]">{explanation}</p>}
      </Group>

      {live && (
        <>
          <Group title="I touren">
            <Field title="Titel">
              <input className={input} value={live.title} onChange={(e) => edit((d) => void (d.live!.title = e.target.value))} />
            </Field>
            <Field title="Hent nye data" hint="Hvor tit Arpo læser kundens side igen. Touren venter aldrig på det - den viser de seneste data med det samme.">
              <select className={input} value={live.refreshMinutes ?? 10} onChange={(e) => edit((d) => void (d.live!.refreshMinutes = Number(e.target.value)))}>
                {[
                  [5, "Hvert 5. minut"],
                  [10, "Hvert 10. minut"],
                  [30, "Hver halve time"],
                  [60, "Hver time"],
                  [360, "Hver 6. time"],
                  [1440, "Én gang i døgnet"],
                ].map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field title="Knaptekst ved hver enhed">
              <input className={input} value={live.bookLabel ?? ""} placeholder="Book" onChange={(e) => edit((d) => void (d.live!.bookLabel = e.target.value || undefined))} />
            </Field>
            <details className="text-[12px] text-[#8e8e93]">
              <summary className="cursor-pointer select-none">Opskriften (for de øvede)</summary>
              <textarea className={`${input} mt-1.5 h-24 resize-y bg-white font-mono text-[11px]`} value={live.pattern} onChange={(e) => edit((d) => void (d.live!.pattern = e.target.value))} />
            </details>
            <button type="button" className="text-[13px] text-[#ff3b30] hover:underline" onClick={() => edit((d) => void (d.live = undefined))}>
              Fjern live data
            </button>
          </Group>

          <Group title={units ? `Fundet nu: ${units.length} · vises: ${units.filter((u) => !excluded.has(u.name)).length}` : "Henter…"}>
            {units && units.length > 0 && (
              <>
                <div className="flex gap-2">
                  <button type="button" className="rounded-full bg-[#f2f2f7] px-3 py-1 text-[12px] font-medium" onClick={() => setShown(units.map((u) => u.name), true)}>
                    Vis alle
                  </button>
                  <button type="button" className="rounded-full bg-[#f2f2f7] px-3 py-1 text-[12px] font-medium" onClick={() => setShown(units.map((u) => u.name), false)}>
                    Skjul alle
                  </button>
                </div>
                <p className="text-[11px] text-[#8e8e93]">Klik for at slå en til/fra - eller hold musen nede og træk hen over flere. 📍: stå ved enheden i forhåndsvisningen og tryk - så får den en &quot;Se&quot;-knap i touren, der viser den.</p>
                <ul className="-mx-4 max-h-[420px] touch-none select-none divide-y divide-black/[.05] overflow-y-auto border-y border-black/[.05]">
                  {units.map((u) => {
                    const on = !excluded.has(u.name);
                    return (
                      <li
                        key={u.name}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          paint.current = !on;
                          setShown([u.name], !on);
                        }}
                        onPointerEnter={(e) => {
                          if (paint.current == null || e.buttons !== 1) return;
                          if (on !== paint.current) setShown([u.name], paint.current);
                        }}
                        className={`flex cursor-pointer items-center gap-3 px-4 py-2 ${on ? "" : "opacity-45"}`}
                      >
                        <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-md text-[12px] text-white ${on ? "bg-[#34c759]" : "bg-[#d1d1d6]"}`}>{on ? "✓" : ""}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium">{u.name}</span>
                          <span className="block truncate text-[12px] text-[#8e8e93]">{[live.places?.[u.name] ? "📍 sted sat" : null, u.size, u.price, u.from && (/^(ledig|nu)\b/i.test(u.from) ? "ledig nu" : `ledig fra ${u.from}`)].filter(Boolean).join(" · ") || (u.link ? "med link" : "")}</span>
                        </span>
                        <button
                          type="button"
                          title={live.places?.[u.name] ? "Flyt stedet til det, forhåndsvisningen viser (Alt-klik: fjern)" : "Sæt stedet: det, forhåndsvisningen viser nu"}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (e.altKey) return edit((d) => void (d.live!.places && delete d.live!.places[u.name]));
                            const r = await preview.view();
                            if (!r.href) return setError(r.error ?? "Forhåndsvisningen svarede ikke.");
                            edit((d) => void (d.live!.places = { ...d.live!.places, [u.name]: r.href! }));
                          }}
                          className={`flex h-7 w-7 flex-none items-center justify-center rounded-full ${live.places?.[u.name] ? "bg-[#34c759] text-white" : "bg-[#f2f2f7] text-[#8e8e93] hover:text-[#0071e3]"}`}
                        >
                          <Icon d='<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>' className="h-4 w-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {units?.length === 0 && <p className="text-[13px] text-[#8e8e93]">Ingen ledige på siden lige nu - eller opskriften passer ikke længere. Prøv &quot;Læs siden igen med Claude&quot;.</p>}
          </Group>
        </>
      )}
    </>
  );
}
