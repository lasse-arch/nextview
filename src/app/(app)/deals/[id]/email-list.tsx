"use client";

import { useState, useTransition } from "react";
import { formatDateTime } from "@/lib/labels";
import { suggestNoteFromEmailAction, saveEmailNoteSuggestion } from "@/lib/actions/ai-notes";
import { useToast } from "@/components/toast";

type Email = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  fromAddress: string;
  toAddresses: string;
  ccAddresses: string | null;
  subject: string | null;
  bodyText: string | null;
  sentAt: Date;
  trackingId: string | null;
  openedAt: Date | null;
  openCount: number;
  openTimestamps: Date[];
};

/** The open count used to be hidden behind a hover-only tooltip - invisible
 * on mobile (no hover at all) and easy to miss even on desktop. The count
 * itself is now right on the badge; hovering (where available) lists every
 * individual open's exact timestamp (not just the first), and, for a Cc'ed
 * mail, a note that one shared tracking pixel can't say whose mail client
 * actually loaded it. Opens upward (bottom-full) since this badge usually
 * sits near the bottom of its card - opening downward got clipped by
 * whatever sits below it on the page. */
function OpenBadge({ openCount, openTimestamps, hasCc }: { openCount: number; openTimestamps: Date[]; hasCc: boolean }) {
  const [hovered, setHovered] = useState(false);

  return (
    <span
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/10">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Åbnet {openCount}×
      </span>
      {hovered && (
        <div className="pointer-events-none absolute bottom-full left-0 z-10 mb-1.5 w-60 whitespace-normal rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-medium text-white shadow-lg">
          <p className="font-semibold text-white">
            Åbnet {openCount} gang{openCount === 1 ? "" : "e"}
          </p>
          <ul className="mt-1 space-y-0.5 font-normal text-slate-300">
            {openTimestamps.map((t, i) => (
              <li key={i}>{formatDateTime(t)}</li>
            ))}
          </ul>
          {hasCc && (
            <p className="mt-1.5 border-t border-slate-700 pt-1.5 font-normal text-slate-300">
              Til og Cc deler samme mail - kan ikke se om det var modtageren eller en Cc'et kollega.
            </p>
          )}
        </div>
      )}
    </span>
  );
}

function DirectionAvatar({ direction }: { direction: "INBOUND" | "OUTBOUND" }) {
  const isInbound = direction === "INBOUND";
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
        isInbound ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {isInbound ? (
          <>
            <path d="M12 3v13" />
            <path d="M6 11l6 6 6-6" />
            <path d="M4 21h16" />
          </>
        ) : (
          <>
            <path d="M22 2 11 13" />
            <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
          </>
        )}
      </svg>
    </span>
  );
}

/**
 * "AI-referat" on an e-mail's body - asks Claude for a short note suggestion,
 * then shows it as an editable draft (same "review before it becomes real"
 * pattern as the inline "Gem som ny skabelon" on the e-mail-compose form)
 * rather than saving it straight away.
 */
function AiNoteSuggestion({ dealId, emailId }: { dealId: string; emailId: string }) {
  const [suggesting, startSuggest] = useTransition();
  const [saving, startSave] = useTransition();
  const [draft, setDraft] = useState<string | null>(null);
  const showToast = useToast();

  function generate() {
    startSuggest(async () => {
      const result = await suggestNoteFromEmailAction(emailId);
      if (!result.ok) {
        showToast(result.error);
        return;
      }
      setDraft(result.suggestion);
    });
  }

  function save() {
    if (draft === null) return;
    startSave(async () => {
      const result = await saveEmailNoteSuggestion(dealId, draft);
      if (!result.ok) {
        showToast(result.error);
        return;
      }
      showToast("Note gemt.");
      setDraft(null);
    });
  }

  if (draft === null) {
    return (
      <button
        type="button"
        onClick={generate}
        disabled={suggesting}
        className="mt-2.5 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        ✨ {suggesting ? "Laver referat…" : "AI-referat til note"}
      </button>
    );
  }

  return (
    <div className="mt-2.5 rounded-lg border border-violet-200 bg-violet-50/50 p-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Forslag til note</p>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={5}
        className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700"
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Gemmer…" : "Gem som note"}
        </button>
        <button
          type="button"
          onClick={() => setDraft(null)}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-white"
        >
          Annullér
        </button>
      </div>
    </div>
  );
}

function EmailRow({ dealId, email }: { dealId: string; email: Email }) {
  const [open, setOpen] = useState(false);
  const counterparty = email.direction === "INBOUND" ? email.fromAddress : email.toAddresses;

  return (
    <li className="group rounded-xl border border-slate-200 bg-white transition-colors hover:border-slate-300">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 p-3.5 text-left"
      >
        <DirectionAvatar direction={email.direction} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-sm font-semibold text-slate-900">{email.subject || "(intet emne)"}</p>
            <span className="shrink-0 text-xs text-slate-400">{formatDateTime(email.sentAt)}</span>
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            <span className="font-medium text-slate-600">{email.direction === "INBOUND" ? "Fra" : "Til"}</span>{" "}
            {counterparty}
            {email.direction === "OUTBOUND" && email.ccAddresses && <> · Cc: {email.ccAddresses}</>}
          </p>
          <div className="mt-2 flex items-center gap-2">
            {email.direction === "OUTBOUND" && email.trackingId && (
              email.openedAt ? (
                <OpenBadge
                  openCount={email.openCount}
                  // Mails opened before this field existed only have the
                  // single openedAt (first-opened) to fall back on.
                  openTimestamps={email.openTimestamps.length > 0 ? email.openTimestamps : [email.openedAt]}
                  hasCc={Boolean(email.ccAddresses)}
                />
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-inset ring-slate-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                  Ikke åbnet endnu
                </span>
              )
            )}
          </div>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`mt-1 shrink-0 text-slate-300 transition-transform group-hover:text-slate-400 ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && email.bodyText && (
        <div className="rounded-b-xl border-t border-slate-100 bg-slate-50/60 px-3.5 py-3 pl-[3.25rem]">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{email.bodyText}</p>
          <AiNoteSuggestion dealId={dealId} emailId={email.id} />
        </div>
      )}
    </li>
  );
}

export function EmailList({ dealId, emails }: { dealId: string; emails: Email[] }) {
  return (
    <ul className="mt-4 space-y-2.5">
      {emails.map((email) => (
        <EmailRow key={email.id} dealId={dealId} email={email} />
      ))}
      {emails.length === 0 && (
        <p className="text-sm text-slate-400">
          Ingen mails endnu. Forbind Gmail under Indstillinger → E-mail for at aktivere automatisk match.
        </p>
      )}
    </ul>
  );
}
