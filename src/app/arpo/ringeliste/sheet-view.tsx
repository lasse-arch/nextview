"use client";

import { Fragment, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { markVoicemail, updateLeadCell } from "@/lib/actions/call-lists";
import { addNote, renameDeal, updateDealPhone, updateDealWebsite } from "@/lib/actions/deals";
import { dealName, telHref } from "@/lib/labels";
import { useToast } from "@/components/toast";
import type { LeadPlace } from "@/lib/lead-place";

/*
 * Ringeliste → "Sheet": the same leads as the cards, as a spreadsheet - one
 * row per lead, cells typed into straight away (Enter/F2 or just start
 * typing, Enter saves and goes down, Tab right, Esc lets go), arrows to move,
 * and a note column where a new call note is written in the cell. "Mere"
 * opens the lead's own card under the row for booking a meeting, call back,
 * lost and products - so those stay in one place.
 */

export type SheetLead = {
  id: string;
  companyName: string;
  displayName: string | null;
  cvrNumber: string | null;
  address: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  websiteUrl: string | null;
  lastVoicemailAt: Date | string | null;
  lastVoicemailBy?: string | null;
  voicemailCount?: number;
  place: LeadPlace | null;
  lastCallNote?: { body: string; at: string; by: string } | null;
};

type Field = "name" | "contactName" | "phone" | "contactEmail" | "website" | "note";
type Col = { key: string; label: string; w: number; field?: Field; text: (d: SheetLead) => string };

const short = (at: Date | string) =>
  new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(at)).replace(",", "");
const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const COLS: Col[] = [
  { key: "name", label: "Firma", w: 210, field: "name", text: (d) => dealName(d) },
  { key: "contactName", label: "Kontakt", w: 150, field: "contactName", text: (d) => d.contactName ?? "" },
  { key: "phone", label: "Telefon", w: 140, field: "phone", text: (d) => d.contactPhone ?? "" },
  { key: "contactEmail", label: "E-mail", w: 200, field: "contactEmail", text: (d) => d.contactEmail ?? "" },
  { key: "website", label: "Hjemmeside", w: 170, field: "website", text: (d) => d.websiteUrl ?? "" },
  { key: "area", label: "Område", w: 150, text: (d) => (d.place ? `${d.place.kommune} · ${Math.round(d.place.km)} km` : "") },
  { key: "address", label: "Adresse", w: 210, text: (d) => d.address ?? "" },
  { key: "voicemail", label: "Telefonsvar", w: 170, text: (d) => (d.lastVoicemailAt ? `${d.voicemailCount ?? 1}× · ${short(d.lastVoicemailAt)}${d.lastVoicemailBy ? ` · ${d.lastVoicemailBy}` : ""}` : "") },
  { key: "note", label: "Seneste note", w: 320, field: "note", text: (d) => d.lastCallNote?.body ?? "" },
  { key: "cvr", label: "CVR", w: 95, text: (d) => d.cvrNumber ?? "" },
];
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function SheetView({ deals, renderCard }: { deals: SheetLead[]; renderCard: (id: string) => ReactNode }) {
  const router = useRouter();
  const showToast = useToast();
  /** What's been saved here since the list was fetched - shown at once, until the list comes back with it. */
  const [saved, setSaved] = useState<Record<string, Partial<SheetLead>>>({});
  const [sel, setSel] = useState<{ r: number; c: number } | null>(null);
  const [edit, setEditState] = useState<{ r: number; c: number; value: string } | null>(null);
  // The cell being typed in, also as a ref: Enter, Tab, a click elsewhere and the input's blur can all end one edit - it's saved once.
  const editing = useRef<{ r: number; c: number; value: string } | null>(null);
  const setEdit = (v: { r: number; c: number; value: string } | null) => {
    editing.current = v;
    setEditState(v);
  };
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);

  const rows = deals.map((d) => ({ ...d, ...saved[d.id] }));
  const cell = sel && rows[sel.r] ? COLS[sel.c].text(rows[sel.r]) : "";

  function focusGrid() {
    requestAnimationFrame(() => grid.current?.focus({ preventScroll: true }));
  }
  function move(r: number, c: number) {
    const nr = Math.max(0, Math.min(rows.length - 1, r));
    const nc = Math.max(0, Math.min(COLS.length - 1, c));
    setSel({ r: nr, c: nc });
    grid.current?.querySelector(`[data-cell="${nr}-${nc}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  function startEdit(r: number, c: number, typed?: string) {
    const col = COLS[c];
    if (!col.field || !rows[r]) return;
    // The note cell writes a new note - it starts empty; the others start with what's there.
    setEdit({ r, c, value: typed ?? (col.field === "note" ? "" : col.text(rows[r])) });
  }

  async function save(d: SheetLead, field: Field, value: string): Promise<boolean> {
    const v = value.trim();
    const before = COLS.find((x) => x.field === field)!.text(d);
    if (field === "note" ? !v : v === before) return true;
    setBusy(d.id);
    try {
      if (field === "name") {
        if (!v) throw new Error("Navnet må ikke være tomt.");
        await renameDeal(d.id, v);
        setSaved((s) => ({ ...s, [d.id]: { ...s[d.id], displayName: v } }));
      } else if (field === "phone") {
        if (!v) throw new Error("Telefonnummeret må ikke være tomt.");
        await updateDealPhone(d.id, v);
        setSaved((s) => ({ ...s, [d.id]: { ...s[d.id], contactPhone: v } }));
      } else if (field === "website") {
        if (!v) throw new Error("Linket må ikke være tomt.");
        await updateDealWebsite(d.id, v);
        setSaved((s) => ({ ...s, [d.id]: { ...s[d.id], websiteUrl: /^https?:\/\//i.test(v) ? v : `https://${v}` } }));
      } else if (field === "note") {
        const form = new FormData();
        form.set("body", `Opkald: ${v}`);
        const r = await addNote(d.id, form);
        if (!r.ok) throw new Error(r.error);
        setSaved((s) => ({ ...s, [d.id]: { ...s[d.id], lastCallNote: { body: v, at: new Date().toISOString(), by: "dig" } } }));
        showToast("Note gemt på dealen");
      } else {
        const r = await updateLeadCell(d.id, field, v);
        if (!r.ok) throw new Error(r.error);
        setSaved((s) => ({ ...s, [d.id]: { ...s[d.id], [field]: r.value } }));
      }
      return true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Kunne ikke gemme.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function commit(then?: { dr: number; dc: number }) {
    const cur = editing.current;
    if (!cur) return;
    const { r, c, value } = cur;
    const d = rows[r];
    setEdit(null);
    if (d && COLS[c].field) await save(d, COLS[c].field!, value);
    if (then) move(r + then.dr, c + then.dc);
    focusGrid();
  }

  async function voicemail(d: SheetLead) {
    setBusy(d.id);
    try {
      const { at, by, count } = await markVoicemail(d.id);
      setSaved((s) => ({ ...s, [d.id]: { ...s[d.id], lastVoicemailAt: at, lastVoicemailBy: by, voicemailCount: count } }));
      showToast("Telefonsvar noteret - rykket ned i bunden");
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Kunne ikke gemme telefonsvar.");
    } finally {
      setBusy(null);
    }
  }

  function onGridKey(e: KeyboardEvent<HTMLDivElement>) {
    if (edit || !sel || e.target !== grid.current) return;
    const { r, c } = sel;
    const go = (dr: number, dc: number) => {
      e.preventDefault();
      move(r + dr, c + dc);
    };
    if (e.key === "ArrowDown") go(1, 0);
    else if (e.key === "ArrowUp") go(-1, 0);
    else if (e.key === "ArrowRight") go(0, 1);
    else if (e.key === "ArrowLeft") go(0, -1);
    else if (e.key === "Tab") go(0, e.shiftKey ? -1 : 1);
    else if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      startEdit(r, c);
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && COLS[c].field) {
      e.preventDefault();
      startEdit(r, c, e.key);
    } else if ((e.metaKey || e.ctrlKey) && e.key === "c") {
      navigator.clipboard?.writeText(cell).catch(() => {});
    }
  }

  if (!rows.length) return null;
  const ref = sel ? `${LETTERS[sel.c]}${sel.r + 2}` : "";

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
      {/* The formula bar: which cell, and all of what's in it (a long note is cut off in its cell). */}
      <div className="flex items-center gap-2 border-b border-slate-300 bg-slate-50 px-2 py-1 text-[13px]">
        <span className="w-14 shrink-0 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-center font-mono text-xs text-slate-600">{ref || " "}</span>
        <span className="font-serif italic text-slate-400">fx</span>
        <span className="min-w-0 flex-1 truncate text-slate-800" title={cell}>
          {sel && rows[sel.r] ? (COLS[sel.c].key === "note" && rows[sel.r].lastCallNote ? `${cell}  —  ${rows[sel.r].lastCallNote!.by}, ${short(rows[sel.r].lastCallNote!.at)}` : cell) : ""}
        </span>
        <span className="hidden shrink-0 text-[11px] text-slate-400 md:inline">Enter retter · Tab/pile flytter · Esc fortryder</span>
      </div>

      <div ref={grid} tabIndex={0} onKeyDown={onGridKey} className="max-h-[72vh] overflow-auto outline-none" aria-label="Ringeliste som regneark">
        <table className="table-fixed border-separate border-spacing-0 text-[13px]" style={{ width: 44 + COLS.reduce((n, c) => n + c.w, 0) + 150 }}>
          <colgroup>
            <col style={{ width: 44 }} />
            {COLS.map((c) => (
              <col key={c.key} style={{ width: c.w }} />
            ))}
            <col style={{ width: 150 }} />
          </colgroup>
          <thead>
            <tr className="sticky top-0 z-20">
              <th className="sticky left-0 z-30 border-b border-r border-slate-300 bg-slate-100" />
              {COLS.map((c, i) => (
                <th key={c.key} className={`border-b border-r border-slate-300 px-2 py-0.5 text-center text-[11px] font-normal ${i === 0 ? "sticky left-[44px] z-30" : ""} ${sel?.c === i ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-500"}`}>
                  {LETTERS[i]}
                </th>
              ))}
              <th className="sticky right-0 z-30 border-b border-l border-slate-300 bg-slate-100" />
            </tr>
            <tr className="sticky top-[21px] z-20">
              <th className="sticky left-0 z-30 border-b border-r border-slate-300 bg-slate-100 text-center text-[11px] font-normal text-slate-500">1</th>
              {COLS.map((c, i) => (
                <th key={c.key} className={`border-b border-r border-slate-300 bg-slate-50 px-2 py-1.5 text-left text-xs font-semibold text-slate-700 ${i === 0 ? "sticky left-[44px] z-30" : ""}`}>
                  {c.label}
                </th>
              ))}
              <th className="sticky right-0 z-30 border-b border-l border-slate-300 bg-slate-50 px-2 py-1.5 text-left text-xs font-semibold text-slate-700">Handling</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d, r) => (
              <Fragment key={d.id}>
                <tr className={busy === d.id ? "opacity-60" : ""}>
                  <td className={`sticky left-0 z-10 border-b border-r border-slate-300 text-center text-[11px] ${sel?.r === r ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-500"}`}>{r + 2}</td>
                  {COLS.map((col, c) => {
                    const isSel = sel?.r === r && sel?.c === c;
                    const typing = edit?.r === r && edit?.c === c;
                    return (
                      <td
                        key={col.key}
                        data-cell={`${r}-${c}`}
                        onMouseDown={() => {
                          if (typing) return;
                          void commit();
                          setSel({ r, c });
                          focusGrid();
                        }}
                        onDoubleClick={() => startEdit(r, c)}
                        className={`relative h-9 border-b border-r border-slate-200 px-2 align-middle ${c === 0 ? "sticky left-[44px] z-10 font-medium text-slate-900" : "text-slate-700"} ${
                          d.lastVoicemailAt ? "bg-amber-50" : "bg-white"
                        } ${isSel ? "outline outline-2 -outline-offset-2 outline-sky-600" : ""} ${col.field ? "cursor-cell" : "cursor-default"}`}
                      >
                        {typing && edit ? (
                          <input
                            autoFocus
                            value={edit.value}
                            placeholder={col.field === "note" ? "Ny note fra opkaldet…" : ""}
                            onChange={(e) => setEdit({ ...edit, value: e.target.value })}
                            onBlur={() => void commit()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void commit({ dr: 1, dc: 0 });
                              } else if (e.key === "Tab") {
                                e.preventDefault();
                                void commit({ dr: 0, dc: e.shiftKey ? -1 : 1 });
                              } else if (e.key === "Escape") {
                                e.preventDefault();
                                setEdit(null);
                                focusGrid();
                              }
                            }}
                            className="absolute inset-0 z-20 w-full border-2 border-sky-600 bg-white px-2 text-[13px] shadow-lg outline-none"
                            style={col.field === "note" ? { width: Math.max(col.w, 420) } : undefined}
                          />
                        ) : (
                          <CellBody col={col} d={d} />
                        )}
                      </td>
                    );
                  })}
                  <td className="sticky right-0 z-10 border-b border-l border-slate-200 border-l-slate-300 bg-white px-1.5">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={busy === d.id}
                        onClick={() => void voicemail(d)}
                        className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        title="Ingen svar - rykkes ned i bunden"
                      >
                        Telefonsvar
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpen(open === d.id ? null : d.id)}
                        className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${open === d.id ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}
                        aria-expanded={open === d.id}
                        title="Book møde, ring tilbage, tabt, produkter …"
                      >
                        {open === d.id ? "Luk" : "Mere"}
                      </button>
                    </div>
                  </td>
                </tr>
                {open === d.id && (
                  <tr>
                    <td colSpan={COLS.length + 2} className="border-b border-slate-300 bg-slate-50 p-3">
                      <ul className="sticky left-3 max-w-3xl list-none">{renderCard(d.id)}</ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CellBody({ col, d }: { col: Col; d: SheetLead }) {
  const text = col.text(d);
  if (col.key === "phone" && d.contactPhone)
    return (
      <span className="flex items-center justify-between gap-1">
        <span className="truncate tabular-nums">{text}</span>
        <a href={telHref(d.contactPhone)} onMouseDown={(e) => e.stopPropagation()} className="shrink-0 rounded px-1 text-xs text-emerald-700 hover:bg-emerald-50" title="Ring op">
          Ring
        </a>
      </span>
    );
  if (col.key === "website" && d.websiteUrl)
    return (
      <span className="flex items-center justify-between gap-1">
        <span className="truncate">{host(d.websiteUrl)}</span>
        <a href={d.websiteUrl} target="_blank" rel="noopener noreferrer" onMouseDown={(e) => e.stopPropagation()} className="shrink-0 rounded px-1 text-xs text-sky-700 hover:bg-sky-50" title="Åbn hjemmesiden">
          ↗
        </a>
      </span>
    );
  if (col.key === "note" && d.lastCallNote)
    return (
      <span className="flex items-baseline gap-1.5" title={`${d.lastCallNote.body} — ${d.lastCallNote.by}, ${short(d.lastCallNote.at)}`}>
        <span className="truncate">{d.lastCallNote.body}</span>
        <span className="shrink-0 text-[11px] text-slate-400">{short(d.lastCallNote.at)}</span>
      </span>
    );
  if (col.key === "note") return <span className="text-slate-300">Skriv en note…</span>;
  return (
    <span className="block truncate" title={text}>
      {text}
    </span>
  );
}
