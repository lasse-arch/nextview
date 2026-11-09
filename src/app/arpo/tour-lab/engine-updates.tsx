"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { republishAllTours } from "@/lib/actions/tour-publish";
import type { EngineChange } from "./tours/engine-changes";

/*
 * Tours → "Tour-motoren": what the latest engine update brought, which
 * published tours still run an older engine - and one button that puts the
 * newest engine on all of them, with exactly the content they have out there.
 */

type Row = { slug: string; name: string; version: number; at: string; upToDate: boolean };

const KIND: Record<EngineChange["kind"], [string, string]> = {
  ny: ["Ny", "bg-[#0071e3]/10 text-[#0071e3]"],
  sikkerhed: ["Sikkerhed", "bg-[#ff3b30]/10 text-[#d70015]"],
  hastighed: ["Hastighed", "bg-[#34c759]/12 text-[#248a3d]"],
  rettelse: ["Rettelse", "bg-black/[.05] text-[#6e6e73]"],
};
const date = (d: string) => new Date(d).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });

export function EngineUpdates({ changes, tours, ready }: { changes: EngineChange[]; tours: Row[]; ready: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string; skipped?: { slug: string; why: string }[] } | null>(null);
  const old = tours.filter((t) => !t.upToDate);
  const latest = changes[0];
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-black/[.05]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold text-[#1d1d1f]">Tour-motoren</h2>
          {latest && (
            <p className="mt-1 text-[14px] text-[#3a3a3c]">
              Seneste opdatering {date(latest.date)}: {latest.text}
            </p>
          )}
          <p className="mt-1 text-[13px] text-[#6e6e73]">
            {tours.length === 0
              ? "Ingen tours er udgivet på tour.nextview360.dk endnu."
              : old.length === 0
                ? `Alle ${tours.length} udgivne tours kører den nyeste motor.`
                : `${tours.length - old.length} af ${tours.length} udgivne tours kører den nyeste motor - ${old.length} kører en ældre.`}
          </p>
        </div>
        {old.length > 0 && (
          <button
            type="button"
            disabled={busy || !ready}
            onClick={() => {
              if (!confirm(`Udgiv ${old.length} ${old.length === 1 ? "tour" : "tours"} igen med den nyeste motor?\n\nIndholdet er det samme, som de har ude nu - ændringer i editoren, der ikke er udgivet, kommer ikke med.`)) return;
              setResult(null);
              start(async () => {
                const r = await republishAllTours();
                if (!r.ok) setResult({ ok: false, text: r.error });
                else {
                  setResult({ ok: true, text: r.value.updated.length ? `${r.value.updated.length} ${r.value.updated.length === 1 ? "tour er" : "tours er"} udgivet igen med den nyeste motor.` : "Ingen tours skulle opdateres.", skipped: r.value.skipped });
                  router.refresh();
                }
              });
            }}
            className="rounded-full bg-[#0071e3] px-4 py-2 text-[14px] font-medium text-white hover:bg-[#0077ed] disabled:opacity-50"
          >
            {busy ? "Udgiver … (kan tage et par minutter)" : `Opdater alle udgivne tours (${old.length})`}
          </button>
        )}
      </div>
      {!ready && old.length > 0 && <p className="mt-2 text-[13px] text-[#ff9500]">Cloudflare er ikke sat op her, så tours kan ikke udgives.</p>}
      {result && (
        <div className={`mt-3 rounded-xl px-3 py-2 text-[13px] ${result.ok ? "bg-[#34c759]/10 text-[#248a3d]" : "bg-[#ff3b30]/10 text-[#d70015]"}`}>
          {result.text}
          {result.skipped?.length ? (
            <ul className="mt-1 list-disc pl-5 text-[#6e6e73]">
              {result.skipped.map((s) => (
                <li key={s.slug}>
                  <b>{s.slug}</b>: {s.why}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
      <details className="mt-3">
        <summary className="cursor-pointer select-none text-[13px] font-medium text-[#0071e3]">Se hvad der er nyt{old.length ? `, og hvilke tours der kører en ældre motor` : ""}</summary>
        <ul className="mt-2 space-y-1.5">
          {changes.slice(0, 20).map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px] leading-snug text-[#3a3a3c]">
              <span className="w-16 flex-none text-[#8e8e93]">{date(c.date).replace(/\s\d{4}$/, "")}</span>
              <span className={`flex-none rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${KIND[c.kind][1]}`}>{KIND[c.kind][0]}</span>
              <span>{c.text}</span>
            </li>
          ))}
        </ul>
        {old.length > 0 && (
          <>
            <p className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-[#8e8e93]">Kører en ældre motor</p>
            <ul className="mt-1 space-y-1 text-[13px] text-[#3a3a3c]">
              {old.map((t) => (
                <li key={t.slug}>
                  <a href={`/arpo/tour-lab/${t.slug}/rediger`} className="font-medium hover:underline">
                    {t.name}
                  </a>{" "}
                  <span className="text-[#8e8e93]">
                    · version {t.version}, udgivet {date(t.at)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </details>
    </section>
  );
}
