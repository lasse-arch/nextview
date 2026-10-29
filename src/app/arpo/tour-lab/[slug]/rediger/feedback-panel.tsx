"use client";

import { reviewUrl } from "@/lib/public-urls";
import { useEffect, useState, useTransition } from "react";
import { deleteFeedback, reviewStatus, sendForReview, setFeedbackStatus, setTourApproved, setTourReview, tourFeedback, type Feedback, type ReviewStatus } from "@/lib/actions/tour-feedback";
import { Choice, Group, Toggle, type PreviewApi } from "./ui";

/*
 * "Feedback": Kundegennemsyn switched on and off (the secret link the customer
 * gets), and what customers have said in the tour - each with a picture of
 * the spot and "Vis stedet", which flies the preview there. On top: "Send til
 * gennemgang" - the mail to the customer, reminders, and the approval (theirs,
 * or ours when they don't answer).
 */

const when = (iso: string) => new Date(iso).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function FeedbackPanel({ slug, token: initialToken, preview }: { slug: string; token: string | null; preview: PreviewApi }) {
  const [token, setToken] = useState(initialToken);
  const [items, setItems] = useState<Feedback[] | null>(null);
  const [filter, setFilter] = useState<"open" | "done" | "all">("open");
  const [copied, setCopied] = useState(false);
  const [big, setBig] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<ReviewStatus | null>(null);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const reload = () => tourFeedback(slug).then(setItems);
  const reloadStatus = () => reviewStatus(slug).then(setStatus);
  useEffect(() => {
    let off = false;
    reviewStatus(slug).then((r) => !off && setStatus(r));
    tourFeedback(slug).then((f) => !off && setItems(f));
    return () => {
      off = true;
    };
  }, [slug]);

  const url = token && typeof window !== "undefined" ? reviewUrl(token, location.origin) : null;
  const shown = (items ?? []).filter((f) => filter === "all" || f.status === filter);
  const open = (items ?? []).filter((f) => f.status === "open").length;
  function send(reminder: boolean) {
    setNote(null);
    start(async () => {
      const r = await sendForReview(slug, reminder);
      if (!r.ok) return setNote({ text: r.error, error: true });
      setNote({ text: `${reminder ? "Påmindelsen" : "Mailen"} er sendt til ${r.to}.` });
      reloadStatus();
      setToken(r.token); // the link in the mail (switched on by sending, if it was off)
    });
  }

  return (
    <>
      <Group title="Gennemgang hos kunden">
        {status?.approvedAt ? (
          <div className="rounded-xl bg-[#34c759]/10 px-3 py-2.5">
            <p className="text-[14px] font-semibold text-[#1f7a35]">✓ Godkendt {when(status.approvedAt)}</p>
            <p className="text-[12px] text-[#3a6b45]">af {status.approvedBy}{status.open ? ` · ${status.open} rettelse${status.open === 1 ? "" : "r"} stadig åben${status.open === 1 ? "" : "e"}` : ""}</p>
          </div>
        ) : status?.sentAt ? (
          <div className="rounded-xl bg-[#ff9500]/10 px-3 py-2.5">
            <p className="text-[14px] font-semibold text-[#a05a00]">Venter på kunden</p>
            <p className="text-[12px] text-[#7a5a2a]">
              Sendt {when(status.sentAt)}
              {status.reminders ? ` · ${status.reminders} påmindelse${status.reminders === 1 ? "" : "r"} (sidst ${when(status.remindedAt!)})` : ""}
              {status.open ? ` · ${status.open} rettelse${status.open === 1 ? "" : "r"} fra kunden` : ""}
            </p>
          </div>
        ) : (
          <p className="text-[13px] leading-snug text-[#6e6e73]">
            Send touren til kunden: de får én mail med touren, hvor de kan gå rundt, skrive rettelser der, hvor de står, og trykke Godkend - og deres kundeside åbnes (kontakt-e-mailen får adgang til denne kunde), med en login-knap i samme mail.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {!status?.sentAt || status.approvedAt ? (
            <button type="button" disabled={pending || !status?.to} onClick={() => send(false)} className="flex-1 rounded-xl bg-[#0071e3] py-2 text-[14px] font-medium text-white disabled:opacity-40">
              {status?.approvedAt ? "Send til ny gennemgang" : "Send til gennemgang"}
            </button>
          ) : (
            <button type="button" disabled={pending} onClick={() => send(true)} className="flex-1 rounded-xl bg-[#0071e3] py-2 text-[14px] font-medium text-white disabled:opacity-40">
              Send påmindelse
            </button>
          )}
          {status?.sentAt && !status.approvedAt && (
            <button
              type="button"
              disabled={pending}
              onClick={() => confirm("Godkend touren selv? Kunden får ikke besked.") && start(async () => (await setTourApproved(slug, true), reloadStatus()))}
              className="rounded-xl bg-white px-3 py-2 text-[14px] font-medium text-[#1f7a35] ring-1 ring-black/[.06]"
            >
              Godkend selv
            </button>
          )}
          {status?.approvedAt && (
            <button type="button" disabled={pending} onClick={() => start(async () => (await setTourApproved(slug, false), reloadStatus()))} className="rounded-xl bg-white px-3 py-2 text-[14px] font-medium text-[#0071e3] ring-1 ring-black/[.06]">
              Genåbn
            </button>
          )}
        </div>
        <p className={`text-[12px] leading-snug ${note?.error ? "text-[#ff3b30]" : note ? "text-[#34c759]" : "text-[#8e8e93]"}`}>
          {note?.text ?? (status?.to ? `Mailen går til ${status.to} (kontakt-e-mailen på dealen) fra info@nextview360.dk - svar lander der. Godkender kunden, får I besked på mail.` : status ? "Touren er ikke koblet til en kunde med kontakt-e-mail." : "")}
        </p>
      </Group>
      <Group title="Linket til gennemsyn">
        <Toggle
          on={Boolean(token)}
          onChange={(on) =>
            start(async () => {
              const r = await setTourReview(slug, on);
              setToken(r.token);
            })
          }
          title="Kunden kan se touren og give feedback"
          hint="Et hemmeligt link til touren, som den er lige nu (også før den er udgivet), hvor kunden kan skrive feedback. Vi gemmer selv, hvor i touren de stod. Slå fra, og linket virker ikke længere."
        />
        {url && (
          <div className="space-y-1.5">
            <div className="truncate rounded-xl bg-[#f2f2f7] px-3 py-2 font-mono text-[12px]">{url}</div>
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl bg-[#0071e3] py-2 text-[14px] font-medium text-white"
                onClick={() => {
                  navigator.clipboard?.writeText(url).catch(() => {});
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                }}
              >
                {copied ? "Kopieret ✓" : "Kopiér linket til kunden"}
              </button>
              <a href={url} target="_blank" rel="noopener" className="rounded-xl bg-white px-3 py-2 text-[14px] font-medium text-[#0071e3] ring-1 ring-black/[.06]">
                Åbn ↗
              </a>
            </div>
            <p className="text-[11px] leading-snug text-[#8e8e93]">Besøg på linket tæller ikke med i Resultater.</p>
          </div>
        )}
      </Group>

      <Group title={items ? `Feedback · ${open} åbne` : "Feedback"}>
        <Choice
          value={filter}
          options={[
            ["open", "Åbne"],
            ["done", "Løste"],
            ["all", "Alle"],
          ]}
          onChange={setFilter}
        />
        {items && shown.length === 0 && <p className="text-[13px] text-[#8e8e93]">{filter === "open" ? "Intet åbent. Send linket til kunden for at få feedback." : "Intet her."}</p>}
        <ul className="space-y-3">
          {shown.map((f) => (
            <li key={f.id} className={`overflow-hidden rounded-xl bg-white ring-1 ring-black/[.06] ${f.status === "done" ? "opacity-60" : ""}`}>
              {f.image && (
                <button type="button" className="block w-full" onClick={() => setBig(f.image)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.image} alt="" className="block max-h-48 w-full object-cover" />
                </button>
              )}
              <div className="space-y-1.5 p-3">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="text-[#8e8e93]">{[f.author, f.room ?? (f.ss ? `scan ${f.ss}` : null), when(f.at)].filter(Boolean).join(" · ")}</span>
                </div>
                <p className="whitespace-pre-wrap text-[14px] leading-snug">{f.text}</p>
                {f.device && <p className="truncate text-[11px] text-[#c7c7cc]" title={f.device}>{f.device}</p>}
                <div className="flex flex-wrap gap-2 pt-0.5">
                  {f.href && (
                    <button type="button" className="rounded-full bg-[#0071e3]/10 px-3 py-1 text-[12px] font-medium text-[#0071e3]" onClick={() => preview.go(f.room ?? "", f.href!)}>
                      Vis stedet
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={pending}
                    className="rounded-full bg-[#f2f2f7] px-3 py-1 text-[12px] font-medium"
                    onClick={() =>
                      start(async () => {
                        await setFeedbackStatus(f.id, f.status === "done" ? "open" : "done");
                        await reload();
                      })
                    }
                  >
                    {f.status === "done" ? "Genåbn" : "✓ Løst"}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    className="ml-auto text-[12px] text-[#c7c7cc] hover:text-[#ff3b30]"
                    onClick={() =>
                      confirm("Slet denne feedback?") &&
                      start(async () => {
                        await deleteFeedback(f.id);
                        await reload();
                      })
                    }
                  >
                    Slet
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Group>

      {big && (
        <button type="button" className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-6" onClick={() => setBig(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={big} alt="" className="max-h-full max-w-full rounded-xl" />
        </button>
      )}
    </>
  );
}
