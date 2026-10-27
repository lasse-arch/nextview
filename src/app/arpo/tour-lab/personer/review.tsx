"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { checkScansForPeople, decideScan, peopleFindings, peoplePlan, type ScanFinding, type ScanPlan } from "@/lib/actions/tour-people";

/*
 * "Personer i scans": nextviewAI goes through every tour's scan points and
 * flags the ones with people in them; here each one is looked at and hidden
 * from the tour or kept. Only new scans are checked the next time.
 */

const BATCH = 12;

export function PeopleReview({ initial }: { initial: ScanFinding[] }) {
  const [findings, setFindings] = useState(initial);
  const [plans, setPlans] = useState<ScanPlan[] | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [showDecided, setShowDecided] = useState(false);
  const stop = useRef(false);
  const [, start] = useTransition();

  useEffect(() => {
    peoplePlan().then(setPlans).catch((err: unknown) => setError(String(err)));
  }, []);
  const reload = async (decided = showDecided) => setFindings(await peopleFindings(decided));

  async function run(list: ScanPlan[]) {
    stop.current = false;
    setError(null);
    for (const plan of list) {
      for (let i = 0; i < plan.todo.length && !stop.current; i += BATCH) {
        setRunning(plan.slug);
        const r = await checkScansForPeople(plan.slug, plan.todo.slice(i, i + BATCH)).catch((err: unknown) => ({ ok: false as const, error: String(err) }));
        if (!r.ok) {
          setError(`${plan.name}: ${r.error}`);
          stop.current = true;
          break;
        }
        setProgress((p) => ({ ...p, [plan.slug]: Math.min(plan.todo.length, i + BATCH) }));
        if (r.found) await reload();
      }
      if (stop.current) break;
    }
    setRunning(null);
    setPlans(await peoplePlan());
    await reload();
  }

  const todo = (plans ?? []).filter((p) => p.todo.length);
  const pending = findings.filter((f) => f.status === "person");
  return (
    <div className="space-y-6" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif' }}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/arpo/tour-lab" className="text-[14px] text-[#0071e3]">
            ‹ Tours
          </Link>
          <h1 className="text-[28px] font-semibold tracking-tight text-[#1d1d1f]">Personer i scans</h1>
          <p className="max-w-2xl text-[14px] text-[#6e6e73]">
            nextviewAI ser alle scanpunkter igennem og finder dem, hvor der er mennesker med. Se hvert enkelt og vælg, om det skal skjules i touren. Kun nye scans bliver tjekket næste gang.
          </p>
        </div>
        {running ? (
          <button type="button" onClick={() => (stop.current = true)} className="rounded-full bg-[#f2f2f7] px-4 py-2 text-[14px] font-medium">
            Stop
          </button>
        ) : (
          <button type="button" disabled={!plans || !todo.length} onClick={() => run(todo)} className="rounded-full bg-[#0071e3] px-4 py-2 text-[14px] font-medium text-white disabled:opacity-40">
            {plans ? (todo.length ? `Tjek ${todo.reduce((n, p) => n + p.todo.length, 0)} scans i ${todo.length} tours` : "Alle scans er tjekket") : "Henter tours…"}
          </button>
        )}
      </div>
      {error && <p className="rounded-xl bg-[#ff3b30]/10 px-4 py-2 text-[13px] text-[#c4271d]">{error}</p>}

      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/[.05]">
        {(plans ?? []).map((p) => {
          const checked = p.total - p.todo.length + (progress[p.slug] ?? 0);
          return (
            <div key={p.slug} className="flex items-center gap-3 border-b border-black/[.05] px-4 py-2.5 text-[14px] last:border-0">
              <span className="flex-1 truncate font-medium">{p.name}</span>
              {p.error ? (
                <span className="text-[12px] text-[#8e8e93]">{p.error}</span>
              ) : (
                <>
                  <span className="w-40 text-right text-[12px] text-[#6e6e73]">{running === p.slug ? `Tjekker… ${checked}/${p.total}` : `${Math.min(checked, p.total)}/${p.total} tjekket`}</span>
                  <div className="h-1.5 w-28 overflow-hidden rounded-full bg-[#f2f2f7]">
                    <div className="h-full bg-[#34c759]" style={{ width: `${p.total ? (Math.min(checked, p.total) / p.total) * 100 : 0}%` }} />
                  </div>
                  <span className={`w-20 text-right text-[12px] font-medium ${p.found ? "text-[#ff9500]" : "text-[#8e8e93]"}`}>{p.found ? `${p.found} fund` : "-"}</span>
                  <button type="button" disabled={!!running || !p.todo.length} onClick={() => run([p])} className="w-16 rounded-full bg-[#f2f2f7] py-1 text-[12px] font-medium disabled:opacity-30">
                    Tjek
                  </button>
                </>
              )}
            </div>
          );
        })}
        {!plans && <p className="px-4 py-3 text-[13px] text-[#8e8e93]">Henter scanpunkter fra Matterport…</p>}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-[19px] font-semibold tracking-tight">{pending.length ? `${pending.length} scans venter på dig` : "Ingen scans venter"}</h2>
        <label className="flex items-center gap-2 text-[13px] text-[#6e6e73]">
          <input
            type="checkbox"
            checked={showDecided}
            onChange={(e) => {
              setShowDecided(e.target.checked);
              start(() => reload(e.target.checked));
            }}
          />
          Vis også dem, der er afgjort
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {findings.map((f) => (
          <Finding key={f.slug + f.sweepId} f={f} onDone={() => reload()} />
        ))}
      </div>
    </div>
  );
}

function Finding({ f, onDone }: { f: ScanFinding; onDone: () => void }) {
  const [big, setBig] = useState(0);
  const [pending, start] = useTransition();
  const decide = (d: "hide" | "keep" | "undo") =>
    start(async () => {
      await decideScan(f.slug, f.sweepId, d);
      onDone();
    });
  return (
    <div className={`overflow-hidden rounded-2xl bg-white ring-1 ring-black/[.05] ${f.status !== "person" ? "opacity-60" : ""}`}>
      {f.images.length > 0 && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.images[big]} alt="" className="aspect-square w-full bg-[#f2f2f7] object-cover" />
          <div className="grid grid-cols-4 gap-1 p-1">
            {f.images.map((src, i) => (
              <button key={src} type="button" onClick={() => setBig(i)} className={`overflow-hidden rounded-md ${big === i ? "ring-2 ring-[#0071e3]" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="aspect-square w-full object-cover" />
              </button>
            ))}
          </div>
        </>
      )}
      <div className="space-y-2 p-3">
        <div className="text-[12px] font-medium text-[#6e6e73]">
          {f.tour} · scan {f.ss}
          {f.status === "hidden" ? " · skjult" : f.status === "kept" ? " · beholdt" : ""}
        </div>
        <p className="text-[14px] leading-snug">{f.note || "En person i scannet."}</p>
        <div className="flex flex-wrap gap-2">
          {f.status === "person" ? (
            <>
              <button type="button" disabled={pending} onClick={() => decide("hide")} className="rounded-full bg-[#1d1d1f] px-3.5 py-1.5 text-[13px] font-medium text-white disabled:opacity-40">
                Skjul scan
              </button>
              <button type="button" disabled={pending} onClick={() => decide("keep")} className="rounded-full bg-[#f2f2f7] px-3.5 py-1.5 text-[13px] font-medium disabled:opacity-40">
                Behold
              </button>
            </>
          ) : (
            <button type="button" disabled={pending} onClick={() => decide("undo")} className="rounded-full bg-[#f2f2f7] px-3.5 py-1.5 text-[13px] font-medium disabled:opacity-40">
              Fortryd
            </button>
          )}
          <a href={`/arpo/tour-lab/${f.slug}?ss=${f.ss}`} target="_blank" rel="noopener" className="rounded-full px-3 py-1.5 text-[13px] font-medium text-[#0071e3] hover:bg-[#0071e3]/10">
            Se i touren ↗
          </a>
        </div>
      </div>
    </div>
  );
}
