"use client";

import { useMemo, useRef, useState } from "react";
import { prepareCall, type CallCard } from "@/lib/actions/call-prep";
import { stageLabels } from "@/lib/labels";
import { Answer } from "./ask-section";

/*
 * Generator → "Første opkald": 1-10 links in, and for each company a short
 * card to call from (lib/call-prep.ts) - done one after the other, each
 * shown the moment it's ready.
 */

const MAX = 10;
const linksOf = (text: string) => [...new Set(text.split(/[\s,;]+/).map((s) => s.trim()).filter((s) => /\.[a-z]{2,}/i.test(s)))].slice(0, MAX);

function Card({ c }: { c: CallCard }) {
  const [open, setOpen] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const sections = useMemo(
    () =>
      c.ok
        ? c.body
            .split(/^##\s+/m)
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => {
              const [head, ...rest] = s.split("\n");
              return { head: head.trim(), text: rest.join("\n").trim() };
            })
        : [],
    [c],
  );
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className={`h-2 w-2 flex-none rounded-full ${c.ok ? "bg-emerald-500" : "bg-red-500"}`} aria-hidden />
        <b className="min-w-0 flex-1 truncate text-[15px] text-slate-900">{c.site}</b>
        {c.ok && c.deal && (
          <a href={`/arpo/deals/${c.deal.id}`} onClick={(e) => e.stopPropagation()} className="flex-none rounded-full bg-slate-100 px-2.5 py-0.5 text-[12px] font-medium text-slate-700 hover:bg-slate-200">
            I Arpo: {c.deal.name} · {stageLabels[c.deal.stage] ?? c.deal.stage}
          </a>
        )}
        <span className="flex-none text-slate-400">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 px-4 pb-4 pt-3">
          {!c.ok ? (
            <p className="text-sm text-red-700">{c.error}</p>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                {sections.map((s, i) => (
                  <div key={i} className={`rounded-lg bg-slate-50 p-3 ${s.head === "Sådan åbner du" || s.head === "Det nyeste" ? "md:col-span-2" : ""}`}>
                    <h3 className="mb-1.5 text-[13px] font-semibold uppercase tracking-wide text-slate-500">{s.head}</h3>
                    <Answer text={s.text} />
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    navigator.clipboard.writeText(`${c.site}\n\n${c.body.replace(/\*\*/g, "")}`).then(
                      () => setNote("Kopieret."),
                      () => setNote("Kunne ikke kopiere."),
                    )
                  }
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:border-slate-400"
                >
                  Kopiér
                </button>
                {note && <span className="text-[13px] text-emerald-700">{note}</span>}
              </div>
              {c.sources.length > 0 && (
                <details>
                  <summary className="cursor-pointer select-none text-[12px] text-slate-500">Kilder ({c.sources.length})</summary>
                  <ul className="mt-1 space-y-0.5 text-[12px]">
                    {c.sources.map((s) => (
                      <li key={s.url} className="truncate">
                        <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="text-blue-700 hover:underline">
                          {s.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

export function CallPrep() {
  const [text, setText] = useState("");
  const [cards, setCards] = useState<CallCard[]>([]);
  const [at, setAt] = useState<{ n: number; of: number; site: string } | null>(null);
  const stop = useRef(false);
  const links = linksOf(text);

  async function run() {
    if (!links.length || at) return;
    stop.current = false;
    setCards([]);
    for (const [i, link] of links.entries()) {
      if (stop.current) break;
      setAt({ n: i + 1, of: links.length, site: link.replace(/^https?:\/\//i, "").replace(/\/.*$/, "") });
      const card = await prepareCall(link).catch((err: unknown): CallCard => ({ ok: false, site: link, error: err instanceof Error ? err.message : String(err) }));
      setCards((cs) => [...cs, card]);
    }
    setAt(null);
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">📞 Første opkald</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Sæt 1-{MAX} hjemmesider ind - én pr. linje. nextviewAI læser forsiden og søger efter det nyeste om hver (nyheder, artikler, opslag), og du får et kort kort at ringe ud fra: hvem de er, hvad der er nyt, hvem du skal spørge efter, hvordan du åbner, og hvad du siger, hvis de siger nej.</p>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder={"fx\naalborgzoo.dk\nhttps://www.skyum.dk"} className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-[13px]" />
        <div className="flex flex-wrap items-center gap-2">
          {at ? (
            <>
              <span className="flex items-center gap-2 text-sm text-blue-900">
                <span className="h-4 w-4 flex-none animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" aria-hidden />
                {at.n}/{at.of}: {at.site} …
              </span>
              <button type="button" onClick={() => (stop.current = true)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-medium text-slate-700">
                Stop efter denne
              </button>
            </>
          ) : (
            <button type="button" disabled={!links.length} onClick={run} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
              {links.length ? `Forbered ${links.length} ${links.length === 1 ? "opkald" : "opkald"}` : "Forbered opkald"}
            </button>
          )}
          <span className="text-[12px] text-slate-400">Ca. 30-60 sek. pr. hjemmeside.</span>
        </div>
      </section>
      {cards.map((c, i) => (
        <Card key={c.site + i} c={c} />
      ))}
    </div>
  );
}
