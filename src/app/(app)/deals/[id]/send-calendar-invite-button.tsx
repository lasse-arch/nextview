"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { sendCalendarInvite } from "@/lib/actions/deals";
import { searchMentionableCustomers, type MentionSuggestion } from "@/lib/customer-mentions";
import { useToast } from "@/components/toast";

/** Finds the "@word" mention currently being typed right before the cursor,
 * if any - e.g. for "Se @stid|" (cursor at |) this returns { start: 3, query: "stid" }.
 * No match if the cursor isn't inside an unbroken @-token (nothing typed
 * yet, or a space/newline already ended it). */
function activeMentionAt(value: string, cursor: number): { start: number; query: string } | null {
  const upToCursor = value.slice(0, cursor);
  const at = upToCursor.lastIndexOf("@");
  if (at === -1) return null;
  const between = upToCursor.slice(at + 1);
  if (/\s/.test(between)) return null;
  return { start: at, query: between };
}

/**
 * Sends the meeting's Google Calendar invite on demand - it's never sent
 * automatically anymore. Whoever clicks it can also pull in colleagues as
 * extra guests (e.g. Gustav inviting Victor along), on top of the deal
 * owner and the customer contact, who are always invited.
 */
export function SendCalendarInviteButton({
  dealId,
  colleagues,
}: {
  dealId: string;
  colleagues: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [customBody, setCustomBody] = useState("");
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const searchSeq = useRef(0);

  useEffect(() => {
    if (mention === null) {
      setSuggestions([]);
      return;
    }
    const seq = ++searchSeq.current;
    const timer = setTimeout(() => {
      searchMentionableCustomers(mention.query).then((results) => {
        if (searchSeq.current === seq) {
          setSuggestions(results);
          setActiveSuggestion(0);
        }
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [mention]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setCustomBody(value);
    setMention(activeMentionAt(value, e.target.selectionStart));
  }

  function insertMention(suggestion: MentionSuggestion) {
    if (!mention || !textareaRef.current) return;
    const cursor = textareaRef.current.selectionStart;
    const before = customBody.slice(0, mention.start);
    const after = customBody.slice(cursor);
    const inserted = `@${suggestion.token} `;
    setCustomBody(before + inserted + after);
    setMention(null);
    requestAnimationFrame(() => {
      const pos = before.length + inserted.length;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(pos, pos);
    });
  }

  function handleBodyKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mention === null || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggestion((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggestion((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(suggestions[activeSuggestion]);
    } else if (e.key === "Escape") {
      setMention(null);
    }
  }

  function send() {
    // The mødedato field sits right next to this button but belongs to the
    // separate "Gem ændringer" form - read its current on-screen value
    // directly rather than whatever's already saved, so a date typed in but
    // not yet saved still gets used for the invite.
    const dateInput = rootRef.current?.closest("form")?.querySelector<HTMLInputElement>('input[name="meetingDate"]');
    startTransition(async () => {
      const result = await sendCalendarInvite(dealId, selected, dateInput?.value || undefined, customBody);
      showToast(result.synced ? "Kalenderinvitation sendt." : result.reason ?? "Kunne ikke sende invitationen.");
      if (result.synced) setOpen(false);
    });
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        disabled={pending}
        onClick={() => setOpen((o) => !o)}
        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        Send kalender invitation
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 w-64 rounded-md border border-slate-200 bg-white p-3 text-sm shadow-lg">
          {colleagues.length > 0 && (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Inviter også</p>
              <div className="mt-1.5 max-h-40 space-y-1 overflow-y-auto">
                {colleagues.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-slate-700">
                    <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} />
                    {c.name}
                  </label>
                ))}
              </div>
            </>
          )}
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Ekstra besked (valgfri)
          </p>
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={customBody}
              onChange={handleBodyChange}
              onKeyDown={handleBodyKeyDown}
              onBlur={() => setTimeout(() => setMention(null), 150)}
              placeholder="Tilføjes lige under standardteksten"
              rows={3}
              className="mt-1.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
            />
            {mention !== null && suggestions.length > 0 && (
              <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-md border border-slate-200 bg-white py-1 text-xs shadow-lg">
                {suggestions.map((s, i) => (
                  <button
                    key={s.token}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertMention(s);
                    }}
                    className={`flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left ${
                      i === activeSuggestion ? "bg-slate-100" : "hover:bg-slate-50"
                    }`}
                  >
                    <span className="truncate">{s.label}</span>
                    {!s.hasLink && <span className="shrink-0 text-[10px] text-amber-600">intet link endnu</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="mt-1 text-[10px] text-slate-400">
            Skriv @kundenavn for automatisk at indsætte et link til en live kundes tour/hjemmeside, fx @stidsholt
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={send}
            className="mt-3 w-full rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {pending ? "Sender…" : "Send"}
          </button>
        </div>
      )}
    </div>
  );
}
