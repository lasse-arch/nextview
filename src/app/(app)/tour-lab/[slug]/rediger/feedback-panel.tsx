"use client";

import { useEffect, useState, useTransition } from "react";
import { deleteFeedback, setFeedbackStatus, setTourReview, tourFeedback, type Feedback } from "@/lib/actions/tour-feedback";
import { Choice, Group, Toggle, type PreviewApi } from "./ui";

/*
 * "Feedback": Kundegennemsyn switched on and off (the secret link the customer
 * gets), and what customers have said in the tour - each with a picture of
 * the spot and "Vis stedet", which flies the preview there.
 */

const when = (iso: string) => new Date(iso).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function FeedbackPanel({ slug, token: initialToken, preview }: { slug: string; token: string | null; preview: PreviewApi }) {
  const [token, setToken] = useState(initialToken);
  const [items, setItems] = useState<Feedback[] | null>(null);
  const [filter, setFilter] = useState<"open" | "done" | "all">("open");
  const [copied, setCopied] = useState(false);
  const [big, setBig] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const reload = () => tourFeedback(slug).then(setItems);
  useEffect(() => {
    let off = false;
    tourFeedback(slug).then((f) => !off && setItems(f));
    return () => {
      off = true;
    };
  }, [slug]);

  const url = token && typeof window !== "undefined" ? `${location.origin}/p/${token}` : null;
  const shown = (items ?? []).filter((f) => filter === "all" || f.status === filter);
  const open = (items ?? []).filter((f) => f.status === "open").length;
  return (
    <>
      <Group title="Kundegennemsyn">
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
