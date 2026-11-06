"use client";

import { useState, useTransition } from "react";
import { deleteContestList, drawContestWinner, type ContestEntryRow } from "@/lib/actions/tour-contest";

/*
 * "Lodtrækning" on the customer page: one treasure chest's draw - how many
 * entered, and (for those who may see personal data) the list, "Træk en
 * vinder", the list as a spreadsheet, and deleting it.
 */

type Props = {
  slug: string;
  itemId: string;
  tour: string;
  prize: string;
  ends: string;
  keepDays: number;
  count: number;
  /** The list - null for those who may only see the number. */
  entries: ContestEntryRow[] | null;
  lang: "da" | "en";
};

const when = (iso: string, lang: string) => new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const day = (ymd: string, lang: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString(lang === "en" ? "en-GB" : "da-DK", { day: "numeric", month: "long", year: "numeric" });

/** The list as a CSV file (opens in Excel; semicolons, as Danish Excel expects). */
function csv(rows: ContestEntryRow[]): string {
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const head = ["Navn", "E-mail", "Telefon", "Klassetrin", "Må få information", "Vinder", "Tilmeldt"];
  const body = rows.map((r) => [r.name, r.email, r.phone, r.grade ? `${r.grade}. klasse` : "", r.infoOk ? "Ja" : "Nej", r.winner ? "Ja" : "", new Date(r.at).toLocaleString("da-DK")].map(cell).join(";"));
  return `﻿${[head.map(cell).join(";"), ...body].join("\r\n")}`;
}

export function ContestPanel({ slug, itemId, tour, prize, ends, keepDays, count, entries, lang }: Props) {
  const da = lang === "da";
  const [rows, setRows] = useState(entries);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const real = (rows ?? []).filter((r) => !r.test);
  const winners = real.filter((r) => r.winner);
  const info = real.filter((r) => r.infoOk).length;
  const open = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" }) <= ends;

  const download = () => {
    if (!rows) return;
    const url = URL.createObjectURL(new Blob([csv(rows)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `lodtraekning-${slug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-3xl bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-bold tracking-tight">{da ? `Skattejagt · ${tour}` : `Treasure hunt · ${tour}`}</h2>
          <p className="mt-1 text-[14px] text-[#6e6e73]">
            {da ? `Præmie: ${prize} · ${open ? "Vinderen trækkes" : "Sluttede"} ${day(ends, lang)}` : `Prize: ${prize} · ${open ? "Drawn" : "Ended"} ${day(ends, lang)}`}
          </p>
        </div>
        <div className="rounded-2xl bg-[#f3f3f5] px-4 py-2 text-center">
          <div className="text-[24px] font-bold leading-none">{rows ? real.length : count}</div>
          <div className="mt-1 text-[12px] text-[#6e6e73]">{da ? "er med" : "entered"}</div>
        </div>
      </div>

      {rows && (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || !real.some((r) => !r.winner)}
              className="rounded-full bg-[#0071e3] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-40"
              onClick={() =>
                confirm(da ? "Træk en vinder nu?" : "Draw a winner now?") &&
                start(async () => {
                  const r = await drawContestWinner(slug, itemId);
                  if (!r.ok) return setMsg(r.error);
                  setRows((list) => (list ?? []).map((x) => (x.id === r.winner.id ? { ...x, winner: true } : x)));
                  setMsg(da ? `Vinderen er ${r.winner.name} (${r.winner.email}, ${r.winner.phone}). Kontakt vedkommende direkte.` : `The winner is ${r.winner.name} (${r.winner.email}, ${r.winner.phone}).`);
                })
              }
            >
              {winners.length ? (da ? "Træk en vinder mere" : "Draw another winner") : da ? "Træk en vinder" : "Draw a winner"}
            </button>
            <button type="button" disabled={!rows.length} onClick={download} className="rounded-full bg-[#f3f3f5] px-4 py-2 text-[14px] font-semibold disabled:opacity-40">
              {da ? "Hent som Excel" : "Download (Excel)"}
            </button>
            <button
              type="button"
              disabled={pending || !rows.length}
              className="rounded-full px-4 py-2 text-[14px] font-semibold text-[#c4314b] disabled:opacity-40"
              onClick={() =>
                confirm(da ? "Slet hele listen? Det kan ikke fortrydes." : "Delete the whole list? This can't be undone.") &&
                start(async () => {
                  const r = await deleteContestList(slug, itemId);
                  if (r.ok) setRows([]);
                })
              }
            >
              {da ? "Slet listen" : "Delete the list"}
            </button>
          </div>
          {msg && <p className="mt-3 rounded-2xl bg-[#e8f8ec] px-4 py-3 text-[14px] text-[#1d7a35]">{msg}</p>}
          <p className="mt-3 text-[12px] leading-snug text-[#8e8e93]">
            {da
              ? `${info} har sagt ja til at få information fra jer. Listen slettes af sig selv ${keepDays} dage efter, at vinderen er trukket. Oplysningerne må kun bruges til lodtrækningen - og til information til dem, der har sagt ja.`
              : `${info} said yes to information from you. The list is deleted by itself ${keepDays} days after the winner is drawn.`}
          </p>
          {rows.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[14px]">
                <thead className="text-[12px] text-[#6e6e73]">
                  <tr>
                    <th className="py-2 pr-3 font-medium">{da ? "Navn" : "Name"}</th>
                    <th className="py-2 pr-3 font-medium">E-mail</th>
                    <th className="py-2 pr-3 font-medium">{da ? "Telefon" : "Phone"}</th>
                    <th className="py-2 pr-3 font-medium">{da ? "Klasse" : "Grade"}</th>
                    <th className="py-2 pr-3 font-medium">{da ? "Information" : "Info"}</th>
                    <th className="py-2 font-medium">{da ? "Tilmeldt" : "Entered"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f0f2]">
                  {rows.map((r) => (
                    <tr key={r.id} className={r.winner ? "bg-[#fff8e1]" : ""}>
                      <td className="py-2 pr-3 font-medium">
                        {r.name}
                        {r.winner && <span className="ml-2 rounded-full bg-[#ffcc00] px-2 py-0.5 text-[11px] font-bold">{da ? "Vinder" : "Winner"}</span>}
                        {r.test && <span className="ml-2 rounded-full bg-[#f3f3f5] px-2 py-0.5 text-[11px] text-[#6e6e73]">test</span>}
                      </td>
                      <td className="py-2 pr-3">{r.email}</td>
                      <td className="whitespace-nowrap py-2 pr-3 tabular-nums">{r.phone}</td>
                      <td className="py-2 pr-3">{r.grade ? `${r.grade}.` : ""}</td>
                      <td className="py-2 pr-3">{r.infoOk ? (da ? "Ja" : "Yes") : ""}</td>
                      <td className="whitespace-nowrap py-2 text-[#6e6e73]">{when(r.at, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-[14px] text-[#6e6e73]">{da ? "Ingen har fundet skatten endnu." : "Nobody has found the treasure yet."}</p>
          )}
        </>
      )}
      {!rows && <p className="mt-3 text-[13px] text-[#8e8e93]">{da ? "Listen med navne kan ses af ejere og medarbejdere." : "Owners and staff can see the list of names."}</p>}
    </section>
  );
}
