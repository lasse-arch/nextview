"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { briefToNote, getMeetingBrief, prepareMeeting, type Brief, type PrepMeeting } from "@/lib/actions/meeting-prep";
import { Answer } from "./ask-section";

/*
 * Generator → Spørg → "Gør mig klar til møde": pick a meeting from the
 * calendar (CRM and Google), and nextviewAI reads the customer, their site,
 * the news, who we meet and what they post - and writes the brief
 * (lib/meeting-prep.ts). Briefs are kept, so the team can open them again.
 */

const STEPS = ["Læser det, vi ved om kunden …", "Læser kundens hjemmeside …", "Søger efter nyt om stedet …", "Finder dem, du skal mødes med …", "Kigger på deres opslag på sociale medier …", "Finder vinklen og funktionerne …", "Skriver spørgsmål og indvendinger …", "Lægger planen for mødet …"];
const ICON: Record<string, string> = {
  "Kort om kunden": "🏫",
  "Hvem du mødes med": "🤝",
  "Det har de gang i": "📰",
  Vinklen: "🎯",
  "Det skal du vise": "✨",
  "Kunder du kan nævne": "⭐",
  "Gode spørgsmål": "❓",
  "Indvendinger og svar": "🛡️",
  "Plan for mødet": "🗓️",
};

/** "I dag", "I morgen" … - `today` is the day in Copenhagen, from the server. */
/** The sections that get the whole width (the others go two by two). */
const WIDE = new Set(["Det har de gang i", "Vinklen", "Det skal du vise", "Indvendinger og svar", "Plan for mødet"]);

const dayName = (dayKey: string, today: string) => {
  const d = new Date(`${dayKey}T12:00:00Z`);
  const key = (x: Date) => x.toISOString().slice(0, 10);
  const t = new Date(`${today}T12:00:00Z`);
  if (dayKey === today) return "I dag";
  if (dayKey === key(new Date(t.getTime() + 864e5))) return "I morgen";
  if (dayKey === key(new Date(t.getTime() - 864e5))) return "I går";
  return d.toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
};
const clock = (m: { hour: number; minute: number }) => (m.hour < 0 ? "Hele dagen" : `${String(m.hour).padStart(2, "0")}:${String(m.minute).padStart(2, "0")}`);

/** The brief in sections (## …), each its own card. */
function BriefView({ brief }: { brief: Brief }) {
  const sections = useMemo(
    () =>
      brief.body
        .split(/^##\s+/m)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const [head, ...rest] = s.split("\n");
          return { head: head.trim(), text: rest.join("\n").trim() };
        }),
    [brief.body],
  );
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {sections.map((s, i) => (
          <section key={i} className={`rounded-xl border border-slate-200 bg-white p-4 ${s.head === "Vinklen" ? "border-blue-200 bg-blue-50/40" : ""} ${WIDE.has(s.head) ? "md:col-span-2" : ""}`}>
            <h3 className="mb-2 flex items-center gap-2 text-[15px] font-semibold text-slate-900">
              <span aria-hidden>{ICON[s.head] ?? "•"}</span>
              {s.head}
            </h3>
            <Answer text={s.text} />
          </section>
        ))}
      </div>
      {brief.sources.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer select-none text-[13px] font-medium text-slate-700">Kilder nextviewAI læste ({brief.sources.length})</summary>
          <ul className="mt-2 space-y-1 text-[13px]">
            {brief.sources.map((s) => (
              <li key={s.url} className="truncate">
                <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="text-blue-700 hover:underline">
                  {s.title}
                </a>{" "}
                <span className="text-slate-400">{new URL(s.url).hostname.replace(/^www\./, "")}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-[12px] text-slate-400">
        Lavet af nextviewAI for {brief.createdByName ?? "en kollega"} {new Date(brief.createdAt).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" })} - tjek altid fakta fra nettet, før du bruger dem.
      </p>
    </div>
  );
}

export function MeetingPrep({ meetings, recent, today }: { meetings: PrepMeeting[]; recent: Brief[]; today: string }) {
  const [all, setAll] = useState(!meetings.some((m) => m.mine));
  const [picked, setPicked] = useState<string | null>(null);
  const [wish, setWish] = useState("");
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [busy, start] = useTransition();
  const [opening, open] = useTransition();
  const [saving, save] = useTransition();

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 9000);
    return () => clearInterval(t);
  }, [busy]);

  const shown = meetings.filter((m) => all || m.mine);
  const days = [...new Set(shown.map((m) => m.dayKey))];
  const current = meetings.find((m) => m.key === picked) ?? null;

  function run() {
    if (!current || busy) return;
    setError(null);
    setNote(null);
    setBrief(null);
    setStep(0);
    start(async () => {
      const r = await prepareMeeting(current.key, wish);
      if (r.ok) setBrief(r.brief);
      else setError(r.error);
    });
  }

  function show(id: string) {
    setError(null);
    setNote(null);
    open(async () => {
      const b = await getMeetingBrief(id);
      if (b) setBrief(b);
      else setError("Forberedelsen findes ikke længere.");
    });
  }

  const tab = (on: boolean) => `rounded-md px-3 py-1 text-xs font-medium ${on ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`;
  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">🗓️ Gør mig klar til møde</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Vælg et møde i kalenderen. nextviewAI læser kunden i Arpo og deres hjemmeside, søger efter nyt om dem, dem du mødes med og deres opslag - og giver dig vinklen, funktionerne, spørgsmål, indvendinger og en plan.</p>
        </div>
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
          <button type="button" className={tab(!all)} onClick={() => setAll(false)}>
            Mine møder
          </button>
          <button type="button" className={tab(all)} onClick={() => setAll(true)}>
            Alle møder
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">{all ? "Ingen kundemøder i kalenderen de næste tre uger." : "Du har ingen kundemøder i kalenderen de næste tre uger."}</p>
      ) : (
        <div className="max-h-[340px] space-y-3 overflow-y-auto pr-1">
          {days.map((d) => (
            <div key={d}>
              <p className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-slate-400 first-letter:uppercase">{dayName(d, today)}</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {shown
                  .filter((m) => m.dayKey === d)
                  .map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setPicked(m.key === picked ? null : m.key)}
                      className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-left transition ${m.key === picked ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white hover:border-slate-400"}`}
                    >
                      <span className={`w-12 flex-none pt-0.5 text-[13px] font-semibold tabular-nums ${m.key === picked ? "text-white" : "text-slate-900"}`}>{clock(m)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium">{m.label}</span>
                        <span className={`block truncate text-[12px] ${m.key === picked ? "text-white/70" : "text-slate-500"}`}>
                          {m.ownerName}
                          {m.inArpo ? "" : " · kun i Google Kalender"}
                          {m.briefId ? " · forberedt ✓" : ""}
                        </span>
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {current && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm text-slate-700">
            <b>{current.label}</b> · {dayName(current.dayKey, today)} {clock(current)}
          </p>
          <input value={wish} onChange={(e) => setWish(e.target.value)} maxLength={600} placeholder="Noget særligt, du vil have styr på? (valgfrit - fx &quot;de har sagt, det er for dyrt&quot;)" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy} onClick={run} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
              {busy ? "Gør dig klar …" : current.briefId ? "Lav en ny forberedelse" : "Gør mig klar"}
            </button>
            {current.briefId && !busy && (
              <button type="button" disabled={opening} onClick={() => show(current.briefId!)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400">
                Åbn den seneste
              </button>
            )}
            <span className="text-[12px] text-slate-400">Tager 1-3 minutter.</span>
          </div>
        </div>
      )}

      {busy && (
        <div className="flex items-center gap-3 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <span className="h-4 w-4 flex-none animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" aria-hidden />
          {STEPS[step]}
        </div>
      )}
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {brief && !busy && (
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[16px] font-semibold text-slate-900">{brief.title}</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(brief.body.replace(/\*\*/g, "")).then(
                    () => setNote("Kopieret."),
                    () => setNote("Kunne ikke kopiere."),
                  );
                }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:border-slate-400"
              >
                Kopiér
              </button>
              {brief.dealId && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    save(async () => {
                      const r = await briefToNote(brief.id);
                      setNote(r.ok ? "Gemt som note på dealen." : (r.error ?? "Kunne ikke gemme."));
                    })
                  }
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:border-slate-400 disabled:opacity-50"
                >
                  Gem som note på dealen
                </button>
              )}
              {brief.dealId && (
                <a href={`/arpo/deals/${brief.dealId}`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:border-slate-400">
                  Åbn dealen
                </a>
              )}
            </div>
          </div>
          {note && <p className="text-[13px] text-emerald-700">{note}</p>}
          <BriefView brief={brief} />
        </div>
      )}

      {recent.length > 0 && (
        <details className="border-t border-slate-100 pt-3">
          <summary className="cursor-pointer select-none text-[13px] font-medium text-slate-600">Teamets seneste forberedelser ({recent.length})</summary>
          <ul className="mt-2 space-y-1">
            {recent.map((b) => (
              <li key={b.id}>
                <button type="button" onClick={() => show(b.id)} className="text-left text-[13px] text-slate-700 hover:underline">
                  <b>{b.title}</b>{" "}
                  <span className="text-slate-400">
                    · {b.createdByName ?? "-"}, {new Date(b.createdAt).toLocaleDateString("da-DK", { day: "numeric", month: "short", timeZone: "Europe/Copenhagen" })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
