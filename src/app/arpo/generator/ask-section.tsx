"use client";

import { Fragment, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { askSalesHelper, deleteSalesAnswer, saveSalesAnswer, type HelperTurn, type SavedAnswer } from "@/lib/actions/sales-helper";
import type { SalesKind } from "@/lib/sales-helper";

/*
 * Salg → Generator → Spørg: ask nextviewAI about the system, the tour, the
 * prices - or how to meet an objection - and keep a good answer in the
 * team's FAQ (which nextviewAI then answers from first).
 */

const QUESTIONS = [
  "Hvad koster en tour?",
  "Hvad er \"Vis mig rundt\"?",
  "Hvordan virker Find vej?",
  "Hvordan bliver en tour til - fra scanning til live?",
  "Hvorfor ser man ikke Matterports logo i vores tours?",
  "Hvad ser kunden i kundeportalen?",
  "Hvilke roller kan kunden give i kundeportalen?",
  "Hvilke kunder kan jeg vise en efterskole?",
  "Hvordan sender jeg et eksempel på SMS?",
];
const OBJECTIONS = ["Det er for dyrt", "Vi har allerede billeder på hjemmesiden", "36 måneders binding er for lang tid", "Vi skal lige tænke over det", "Vores kunder kommer alligevel forbi", "Vi har ikke tid til det lige nu"];
const KIND_NAME: Record<SalesKind, string> = { spoergsmaal: "Spørgsmål", indvending: "Indvending" };

type Turn = HelperTurn & { kind?: SalesKind };

/** **fed** inside a line. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>));
}

/** nextviewAI's answer: short paragraphs and "- " points. */
export function Answer({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length} className="ml-4 list-disc space-y-1">{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const point = line.match(/^[-*•]\s+(.*)$/) ?? line.match(/^\d+[.)]\s+(.*)$/);
    if (point) list.push(point[1]);
    else {
      flush();
      if (line) blocks.push(<p key={blocks.length}>{inline(line.replace(/^#+\s*/, ""))}</p>);
    }
  }
  flush();
  return <div className="space-y-2 text-[14px] leading-relaxed text-slate-800">{blocks}</div>;
}

function SaveForm({ initial, onDone, onCancel }: { initial: { id?: string; kind: SalesKind; question: string; answer: string }; onDone: (msg: string) => void; onCancel: () => void }) {
  const [kind, setKind] = useState<SalesKind>(initial.kind);
  const [question, setQuestion] = useState(initial.question);
  const [answer, setAnswer] = useState(initial.answer);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="inline-flex rounded-lg bg-white p-0.5 ring-1 ring-slate-200">
        {(Object.keys(KIND_NAME) as SalesKind[]).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-md px-3 py-1 text-xs font-medium ${kind === k ? "bg-slate-900 text-white" : "text-slate-600"}`}>
            {KIND_NAME[k]}
          </button>
        ))}
      </div>
      <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Spørgsmålet eller indvendingen" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" maxLength={500} />
      <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={8} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" maxLength={6000} />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            start(async () => {
              const r = await saveSalesAnswer({ id: initial.id, kind, question, answer });
              if (r.ok) onDone(initial.id ? "Rettet." : "Gemt i FAQ'en - nextviewAI svarer ud fra det fremover.");
              else setError(r.error);
            })
          }
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? "Gemmer…" : initial.id ? "Gem rettelser" : "Gem i FAQ"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white">
          Fortryd
        </button>
      </div>
    </div>
  );
}

export function AskSection({ faq }: { faq: SavedAnswer[] }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  function ask(question: string, kind?: SalesKind) {
    const q = question.trim();
    if (!q || busy) return;
    const next: Turn[] = [...turns, { role: "user", text: q, kind }];
    setTurns(next);
    setText("");
    setError(null);
    setNote(null);
    start(async () => {
      const r = await askSalesHelper(next.map(({ role, text }) => ({ role, text })));
      if (r.ok) setTurns([...next, { role: "assistant", text: r.answer }]);
      else {
        setError(r.error);
        setTurns(turns);
        setText(q);
      }
      requestAnimationFrame(() => end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    });
  }

  const chip = "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[13px] text-slate-700 hover:border-slate-400 disabled:opacity-50";
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Spørg nextviewAI</h2>
          <p className="mt-0.5 text-sm text-slate-500">Om touren og funktionerne, Matterport, kundeportalen, Arpo og priser - eller hvordan du møder en indvending. Svarer ud fra sælger-håndbogen, vores egen hjemmeside, tour-drejebogen, /nyheder, de kunder der er online og teamets gemte svar.</p>
        </div>

        {turns.length === 0 && (
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Spørgsmål</p>
              <div className="flex flex-wrap gap-1.5">
                {QUESTIONS.map((q) => (
                  <button key={q} type="button" disabled={busy} onClick={() => ask(q, "spoergsmaal")} className={chip}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Kunden siger …</p>
              <div className="flex flex-wrap gap-1.5">
                {OBJECTIONS.map((q) => (
                  <button key={q} type="button" disabled={busy} onClick={() => ask(`Kunden siger: "${q}". Hvordan svarer jeg?`, "indvending")} className={chip}>
                    &quot;{q}&quot;
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {turns.length > 0 && (
          <div className="space-y-3">
            {turns.map((t, i) =>
              t.role === "user" ? (
                <div key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-slate-900 px-4 py-2.5 text-[14px] text-white">
                  {t.text}
                </div>
              ) : (
                <div key={i} className="space-y-2 rounded-2xl rounded-bl-md bg-slate-50 p-4">
                  <Answer text={t.text} />
                  {saving === i ? (
                    <SaveForm
                      initial={{ kind: turns[i - 1]?.kind ?? (/kunden siger/i.test(turns[i - 1]?.text ?? "") ? "indvending" : "spoergsmaal"), question: (turns[i - 1]?.text ?? "").replace(/^Kunden siger: "(.*)"\. Hvordan svarer jeg\?$/, "$1"), answer: t.text }}
                      onDone={(m) => {
                        setSaving(null);
                        setNote(m);
                      }}
                      onCancel={() => setSaving(null)}
                    />
                  ) : (
                    <div className="flex gap-3 pt-1 text-xs">
                      <button type="button" onClick={() => setSaving(i)} className="font-medium text-[#0071e3] hover:underline">
                        Gem i FAQ
                      </button>
                      <button type="button" onClick={() => void navigator.clipboard?.writeText(t.text.replace(/\*\*/g, "")).then(() => setNote("Kopieret."))} className="text-slate-500 hover:text-slate-800 hover:underline">
                        Kopiér
                      </button>
                    </div>
                  )}
                </div>
              ),
            )}
            {busy && <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />}
            <div ref={end} />
          </div>
        )}

        {note && <p className="text-xs text-emerald-700">{note}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(text);
          }}
          className="space-y-2"
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(text);
              }
            }}
            rows={3}
            maxLength={4000}
            placeholder={turns.length ? "Spørg videre …" : "Fx: Hvad svarer jeg, når en campingplads siger, de har en video på hjemmesiden?"}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
          <div className="flex items-center gap-3">
            <button type="submit" disabled={busy || !text.trim()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
              {busy ? "Tænker…" : "Spørg"}
            </button>
            {turns.length > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setTurns([]);
                  setError(null);
                  setNote(null);
                }}
                className="text-xs text-slate-500 hover:text-slate-800 hover:underline"
              >
                Ny samtale
              </button>
            )}
          </div>
        </form>
      </section>

      <Faq faq={faq} />
    </div>
  );
}

function Faq({ faq }: { faq: SavedAnswer[] }) {
  const [kind, setKind] = useState<SalesKind | "alle">("alle");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return faq.filter((f) => (kind === "alle" || f.kind === kind) && (!s || `${f.question} ${f.answer}`.toLowerCase().includes(s)));
  }, [faq, kind, q]);
  const tab = (on: boolean) => `rounded-md px-3 py-1 text-xs font-medium ${on ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`;

  return (
    <section className="space-y-3 self-start rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Teamets FAQ</h2>
        <p className="mt-0.5 text-sm text-slate-500">Svar, teamet har gemt. nextviewAI bruger dem først - skriv også selv det ind, kun I ved (fx om kameraet eller scanningen).</p>
      </div>
      {adding ? (
        <SaveForm initial={{ kind: "spoergsmaal", question: "", answer: "" }} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50">
          + Tilføj svar
        </button>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
          <button type="button" className={tab(kind === "alle")} onClick={() => setKind("alle")}>
            Alle
          </button>
          <button type="button" className={tab(kind === "spoergsmaal")} onClick={() => setKind("spoergsmaal")}>
            Spørgsmål
          </button>
          <button type="button" className={tab(kind === "indvending")} onClick={() => setKind("indvending")}>
            Indvendinger
          </button>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søg …" className="min-w-0 flex-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-sm" />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {shown.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">{faq.length ? "Intet passer på søgningen." : "Ingen gemte svar endnu. Spørg nextviewAI, og tryk \"Gem i FAQ\" ved et godt svar."}</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {shown.map((f) =>
            editing === f.id ? (
              <div key={f.id} className="py-2">
                <SaveForm initial={f} onDone={() => setEditing(null)} onCancel={() => setEditing(null)} />
              </div>
            ) : (
              <details key={f.id} className="group py-2.5">
                <summary className="flex cursor-pointer list-none items-start gap-2 text-sm font-medium text-slate-900">
                  <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${f.kind === "indvending" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}>{f.kind === "indvending" ? "Indv." : "Spm."}</span>
                  <span className="flex-1">{f.question}</span>
                  <span className="text-slate-400 transition group-open:rotate-45">+</span>
                </summary>
                <div className="mt-2 space-y-2 pl-1">
                  <Answer text={f.answer} />
                  <p className="text-[11px] text-slate-400">
                    {f.createdByName ? `Gemt af ${f.createdByName}` : "Gemt"}
                    {f.mine && (
                      <>
                        {" · "}
                        <button type="button" onClick={() => setEditing(f.id)} className="text-[#0071e3] hover:underline">
                          Ret
                        </button>
                        {" · "}
                        <button
                          type="button"
                          onClick={() => {
                            if (!confirm("Slet svaret fra FAQ'en?")) return;
                            start(async () => {
                              const r = await deleteSalesAnswer(f.id);
                              if (!r.ok) setError(r.error ?? "Kunne ikke slettes.");
                            });
                          }}
                          className="text-red-600 hover:underline"
                        >
                          Slet
                        </button>
                      </>
                    )}
                  </p>
                </div>
              </details>
            ),
          )}
        </div>
      )}
    </section>
  );
}
