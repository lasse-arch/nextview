"use client";

import { useEffect, useState, useTransition } from "react";
import { addTourAiMemory, forgetTourAiMemory, tourAiMemories, type AiMemory } from "@/lib/actions/tour-ai";

/*
 * What nextviewAI remembers - what it has learned from us (for every tour) and
 * about this customer. It is given back to nextviewAI every time, so it gets
 * better with each tour. Here it can be read, taught by hand and forgotten.
 */
export function AiMemoryPanel({ slug, refresh }: { slug: string; refresh: number }) {
  const [items, setItems] = useState<AiMemory[] | null>(null);
  const [text, setText] = useState("");
  const [scope, setScope] = useState<"all" | "tour">("all");
  const [pending, start] = useTransition();
  useEffect(() => {
    let off = false;
    tourAiMemories(slug).then((m) => !off && setItems(m)).catch(() => {});
    return () => {
      off = true;
    };
  }, [slug, refresh]);
  const reload = () => tourAiMemories(slug).then(setItems);
  const list = (s: "all" | "tour", title: string) => {
    const rows = (items ?? []).filter((m) => m.scope === s);
    return (
      <div>
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#8e8e93]">{title}</div>
        {rows.length ? (
          <ul className="space-y-1">
            {rows.map((m) => (
              <li key={m.id} className="group flex items-start gap-2 text-[12.5px] leading-snug">
                <span className="mt-[5px] h-1.5 w-1.5 flex-none rounded-full bg-[#d97757]" />
                <span className="flex-1">{m.text}</span>
                <button type="button" title="Glem" className="text-[#c7c7cc] opacity-0 transition group-hover:opacity-100 hover:text-[#ff3b30]" onClick={() => start(async () => (await forgetTourAiMemory(m.id), await reload()))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-[#8e8e93]">Intet endnu.</p>
        )}
      </div>
    );
  };
  return (
    <details className="mx-2 mb-2 rounded-2xl bg-white px-3 py-2 ring-1 ring-black/[.06]">
      <summary className="cursor-pointer select-none text-[13px] font-medium text-[#1d1d1f]">
        Det husker nextviewAI {items ? <span className="text-[#8e8e93]">({items.length})</span> : null}
      </summary>
      <div className="mt-2 max-h-64 space-y-3 overflow-y-auto">
        {list("all", "Alle tours - det, vi har lært den")}
        {list("tour", "Om denne kunde")}
      </div>
      <form
        className="mt-3 space-y-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await addTourAiMemory(slug, scope, text);
            if (r.ok) {
              setText("");
              await reload();
            }
          });
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Lær den noget, fx: Vi bruger aldrig Matterports egne fotos" className="w-full rounded-lg bg-[#f2f2f7] px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30" />
        <div className="flex items-center gap-2 text-[12px]">
          <select value={scope} onChange={(e) => setScope(e.target.value as "all" | "tour")} className="rounded-lg bg-[#f2f2f7] px-2 py-1">
            <option value="all">Alle tours</option>
            <option value="tour">Kun denne kunde</option>
          </select>
          <button type="submit" disabled={pending || !text.trim()} className="ml-auto rounded-lg bg-[#1d1d1f] px-3 py-1 font-medium text-white disabled:opacity-40">
            Husk
          </button>
        </div>
      </form>
    </details>
  );
}
