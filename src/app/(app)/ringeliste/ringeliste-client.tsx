"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createCallList, addLeadsToCallList, deleteCallList, renameCallList, markVoicemail } from "@/lib/actions/call-lists";
import { updateDealStage, setMeetingDateAndStage, sendCalendarInvite, renameDeal, updateDealPhone, updateDealWebsite } from "@/lib/actions/deals";
import { addDealItem } from "@/lib/actions/deal-items";
import { dealName, stageLabels } from "@/lib/labels";
import { useToast } from "@/components/toast";
import type { DealStage } from "@prisma/client";

// Same 4 fixed products as the deal-page's own quick-add (deal-items-section.tsx)
// - kept in sync there since there's no shared source of truth for it yet.
const PRODUCT_SUGGESTIONS = ["Visitkort", "Drone-optagelse", "Nextview360 Tour", "Hjemmeside"];

type CallListSummary = { id: string; name: string; openCount: number };
type QueueDeal = {
  id: string;
  companyName: string;
  displayName: string | null;
  cvrNumber: string | null;
  address: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  websiteUrl: string | null;
  stage: DealStage;
  lastVoicemailAt: Date | string | null;
  ownerId: string;
};

type Colleague = { id: string; name: string };

/** "5. okt. kl. 14:32" for the latest "Telefonsvar" press. */
function formatVoicemailTime(at: Date | string): string {
  const d = new Date(at);
  const date = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short" }).format(d);
  const time = new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit" }).format(d);
  return `${date} kl. ${time}`;
}

function QuickAdd({ selectedListId }: { selectedListId: string | null }) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  // Set after a submit finds existing deals it skipped, so "Tilføj alligevel"
  // can re-run the exact same paste with force=true - kept separate from the
  // (ephemeral, 3s) toast since the person needs time to actually read the
  // names and decide, not just a flash of text.
  const [forcePrompt, setForcePrompt] = useState<{ listId: string; text: string; names: string[] } | null>(null);
  const router = useRouter();
  const showToast = useToast();

  function submit(force = false) {
    if (!text.trim()) {
      showToast("Indsæt mindst ét link eller navn.");
      return;
    }
    startTransition(async () => {
      let listId = selectedListId;
      if (!listId) {
        const list = await createCallList(name);
        listId = list.id;
      }
      const result = await addLeadsToCallList(listId, text, force);
      if (!result.ok) {
        showToast(result.error);
        return;
      }
      const parts = [`${result.created} lead${result.created === 1 ? "" : "s"} tilføjet`];
      if (result.moved > 0) parts.push(`${result.moved} eksisterende flyttet hertil`);
      if (result.skipped > 0) parts.push(`${result.skipped} sprunget over`);
      let message = parts.join(", ") + ".";
      if (result.alreadyExisting.length > 0) {
        const names = result.alreadyExisting
          .slice(0, 3)
          .map((e) => `${e.name} (${e.stage})`)
          .join(", ");
        const more = result.alreadyExisting.length > 3 ? ` +${result.alreadyExisting.length - 3} mere` : "";
        message += ` ⚠️ ${result.alreadyExisting.length} fandtes allerede som deal og blev IKKE flyttet hertil: ${names}${more}.`;
        setForcePrompt({ listId, text, names: result.alreadyExisting.map((e) => e.name) });
      } else {
        setForcePrompt(null);
        setText("");
      }
      showToast(message);
      router.push(`/ringeliste?list=${listId}`);
      router.refresh();
    });
  }

  function forceAdd() {
    if (!forcePrompt) return;
    const { listId, text: pendingText } = forcePrompt;
    startTransition(async () => {
      const result = await addLeadsToCallList(listId, pendingText, true);
      if (!result.ok) {
        showToast(result.error);
        return;
      }
      showToast(`${result.moved} eksisterende deal${result.moved === 1 ? "" : "s"} flyttet hertil.`);
      setForcePrompt(null);
      setText("");
      router.push(`/ringeliste?list=${listId}`);
      router.refresh();
    });
  }

  function newList() {
    startTransition(async () => {
      const list = await createCallList(name);
      setName("");
      router.push(`/ringeliste?list=${list.id}`);
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Tilføj leads</h2>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={"Indsæt links - ét pr. linje\nhttps://datacvr.virk.dk/enhed/virksomhed/12345678\nhttps://www.facebook.com/eksempelvirksomhed\nhttps://eksempel.dk"}
        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => submit(false)}
          disabled={pending}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Tilføjer…" : selectedListId ? "Tilføj til liste" : "Opret liste og tilføj"}
        </button>
        <span className="text-xs text-slate-400">
          {selectedListId ? "Tilføjes til den valgte liste ovenfor." : "Der oprettes en ny liste automatisk."}
        </span>
      </div>

      {forcePrompt && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span>
            {forcePrompt.names.length} fandtes allerede som deal ({forcePrompt.names.slice(0, 3).join(", ")}
            {forcePrompt.names.length > 3 ? ` +${forcePrompt.names.length - 3} mere` : ""}) og blev ikke flyttet.
          </span>
          <button
            type="button"
            onClick={forceAdd}
            disabled={pending}
            className="rounded-md border border-amber-400 bg-white px-2 py-1 font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            {pending ? "Flytter…" : "Tilføj alligevel"}
          </button>
          <button
            type="button"
            onClick={() => {
              setForcePrompt(null);
              setText("");
            }}
            className="text-amber-700 hover:underline"
          >
            Nej tak
          </button>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Navn til ny liste (valgfrit, fx dagens dato bruges ellers)"
          className="min-w-[220px] flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
        />
        <button
          type="button"
          onClick={newList}
          disabled={pending}
          className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          + Ny liste
        </button>
      </div>
    </section>
  );
}

function ListPicker({ lists, selectedListId }: { lists: CallListSummary[]; selectedListId: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const showToast = useToast();

  function remove(id: string) {
    if (!confirm("Slet denne liste? Leadsene beholdes, men mister listetilknytningen.")) return;
    startTransition(async () => {
      await deleteCallList(id);
      router.push("/ringeliste");
      router.refresh();
    });
  }

  function startEdit(l: CallListSummary) {
    setEditingId(l.id);
    setNameInput(l.name);
  }

  function saveRename(id: string) {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    startTransition(async () => {
      const result = await renameCallList(id, trimmed);
      if (!result.ok) {
        showToast(result.error);
        return;
      }
      setEditingId(null);
      router.refresh();
    });
  }

  if (lists.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {lists.map((l) =>
        editingId === l.id ? (
          <span key={l.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1">
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveRename(l.id);
                if (e.key === "Escape") setEditingId(null);
              }}
              autoFocus
              className="w-36 rounded border border-slate-300 px-1.5 py-0.5 text-xs"
            />
            <button
              type="button"
              onClick={() => saveRename(l.id)}
              disabled={pending}
              className="text-xs font-medium text-slate-900 hover:underline"
            >
              Gem
            </button>
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Annullér
            </button>
          </span>
        ) : (
          <div key={l.id} className="group relative">
            <Link
              href={`/ringeliste?list=${l.id}`}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                l.id === selectedListId
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {l.name}
              <span className={l.id === selectedListId ? "text-slate-300" : "text-slate-400"}>{l.openCount} tilbage</span>
            </Link>
            <button
              type="button"
              onClick={() => startEdit(l)}
              title="Omdøb liste"
              className="absolute -left-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-slate-500 text-[10px] leading-none text-white group-hover:flex"
            >
              ✎
            </button>
            <button
              type="button"
              onClick={() => remove(l.id)}
              disabled={pending}
              title="Slet liste"
              className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] leading-none text-white group-hover:flex"
            >
              ×
            </button>
          </div>
        )
      )}
    </div>
  );
}

function QueueCard({ deal, users }: { deal: QueueDeal; users: Colleague[] }) {
  const [busy, startTransition] = useTransition();
  const [bookingMeeting, setBookingMeeting] = useState(false);
  const [meetingDateInput, setMeetingDateInput] = useState("");
  const [duration, setDuration] = useState(30);
  const [inviteEmail, setInviteEmail] = useState(deal.contactEmail ?? "");
  const [sendInvite, setSendInvite] = useState(true);
  const [selectedColleagues, setSelectedColleagues] = useState<string[]>([]);
  const colleagues = users.filter((u) => u.id !== deal.ownerId);
  const [gone, setGone] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(dealName(deal));
  const [displayedName, setDisplayedName] = useState(dealName(deal));
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState(deal.contactPhone ?? "");
  const [displayedPhone, setDisplayedPhone] = useState(deal.contactPhone);
  const [editingWebsite, setEditingWebsite] = useState(false);
  const [websiteInput, setWebsiteInput] = useState(deal.websiteUrl ?? "");
  const [displayedWebsite, setDisplayedWebsite] = useState(deal.websiteUrl);
  const [addedProducts, setAddedProducts] = useState<string[]>([]);
  const [voicemailAt, setVoicemailAt] = useState(deal.lastVoicemailAt);
  const router = useRouter();
  const showToast = useToast();

  function saveName() {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === displayedName) {
      setEditingName(false);
      return;
    }
    startTransition(async () => {
      try {
        await renameDeal(deal.id, trimmed);
        setDisplayedName(trimmed);
        setEditingName(false);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Kunne ikke omdøbe.");
      }
    });
  }

  function savePhone() {
    const trimmed = phoneInput.trim();
    if (!trimmed) {
      setEditingPhone(false);
      return;
    }
    startTransition(async () => {
      try {
        await updateDealPhone(deal.id, trimmed);
        setDisplayedPhone(trimmed);
        setEditingPhone(false);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Kunne ikke gemme telefonnummeret.");
      }
    });
  }

  function saveWebsite() {
    const trimmed = websiteInput.trim();
    if (!trimmed) {
      setEditingWebsite(false);
      return;
    }
    startTransition(async () => {
      try {
        await updateDealWebsite(deal.id, trimmed);
        setDisplayedWebsite(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
        setEditingWebsite(false);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Kunne ikke gemme linket.");
      }
    });
  }

  function addProduct(product: string) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("productType", product);
      const result = await addDealItem(deal.id, formData);
      if (!result.ok) {
        showToast(result.error);
        return;
      }
      setAddedProducts((prev) => [...prev, product]);
      showToast(`${product} tilføjet`);
      router.refresh();
    });
  }

  function voicemail() {
    startTransition(async () => {
      try {
        const { at } = await markVoicemail(deal.id);
        setVoicemailAt(at);
        showToast("Telefonsvar noteret - rykket ned i listen");
        // Re-sorts the queue so the lead moves to the back.
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Kunne ikke gemme telefonsvar.");
      }
    });
  }

  function markLost() {
    if (!confirm(`Markér ${dealName(deal)} som tabt?`)) return;
    startTransition(async () => {
      try {
        await updateDealStage(deal.id, "LOST");
        setGone(true);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Kunne ikke opdatere dealen.");
      }
    });
  }

  function bookMeeting() {
    if (!meetingDateInput) {
      showToast("Vælg en dato/tid for mødet.");
      return;
    }
    startTransition(async () => {
      try {
        await setMeetingDateAndStage(deal.id, meetingDateInput);
        if (sendInvite) {
          const result = await sendCalendarInvite(
            deal.id,
            selectedColleagues,
            meetingDateInput,
            undefined,
            duration,
            inviteEmail
          );
          showToast(
            result.synced
              ? "Møde booket og kalenderinvitation sendt."
              : `Møde booket. ${result.reason ?? "Kalenderinvitation kunne ikke sendes."}`
          );
        } else {
          showToast("Møde booket");
        }
        setGone(true);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Kunne ikke booke mødet.");
      }
    });
  }

  if (gone) return null;

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {editingName ? (
            <div className="flex items-center gap-1.5">
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") setEditingName(false);
                }}
                autoFocus
                className="rounded-md border border-slate-300 px-2 py-1 text-sm font-semibold text-slate-900"
              />
              <button type="button" onClick={saveName} disabled={busy} className="text-xs font-medium text-slate-900 hover:underline">
                Gem
              </button>
              <button type="button" onClick={() => setEditingName(false)} className="text-xs text-slate-400 hover:text-slate-600">
                Annullér
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Link href={`/deals/${deal.id}`} className="font-semibold text-slate-900 hover:underline">
                {displayedName}
              </Link>
              <button
                type="button"
                onClick={() => {
                  setNameInput(displayedName);
                  setEditingName(true);
                }}
                title="Skift navn"
                className="text-slate-300 hover:text-slate-600"
              >
                ✏️
              </button>
            </div>
          )}
          <p className="mt-0.5 text-xs text-slate-500">
            {[deal.cvrNumber ? `CVR ${deal.cvrNumber}` : null, deal.address].filter(Boolean).join(" · ") || "Ingen adresse"}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500">
            {[deal.contactName, deal.contactEmail].filter(Boolean).length > 0 && (
              <span>{[deal.contactName, deal.contactEmail].filter(Boolean).join(" · ")}</span>
            )}
            {editingPhone ? (
              <span className="inline-flex items-center gap-1">
                <input
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") savePhone();
                    if (e.key === "Escape") setEditingPhone(false);
                  }}
                  autoFocus
                  placeholder="Telefonnummer"
                  className="w-32 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs"
                />
                <button type="button" onClick={savePhone} disabled={busy} className="font-medium text-slate-900 hover:underline">
                  Gem
                </button>
                <button type="button" onClick={() => setEditingPhone(false)} className="text-slate-400 hover:text-slate-600">
                  Annullér
                </button>
              </span>
            ) : displayedPhone ? (
              // Once a phone number is added it's shown "marked" (a filled green
              // badge) instead of plain text, so it's visibly done during a fast
              // calling session - click it to correct a typo.
              <button
                type="button"
                onClick={() => {
                  setPhoneInput(displayedPhone);
                  setEditingPhone(true);
                }}
                title="Ret telefonnummer"
                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/10 hover:bg-emerald-100"
              >
                ☎ {displayedPhone}
              </button>
            ) : (
              <button type="button" onClick={() => setEditingPhone(true)} className="text-xs text-slate-400 underline hover:text-slate-600">
                + Tilføj telefon
              </button>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
            {editingWebsite ? (
              <span className="inline-flex items-center gap-1">
                <input
                  value={websiteInput}
                  onChange={(e) => setWebsiteInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveWebsite();
                    if (e.key === "Escape") setEditingWebsite(false);
                  }}
                  autoFocus
                  placeholder="firma.dk"
                  className="w-40 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs"
                />
                <button type="button" onClick={saveWebsite} disabled={busy} className="font-medium text-slate-900 hover:underline">
                  Gem
                </button>
                <button type="button" onClick={() => setEditingWebsite(false)} className="text-slate-400 hover:text-slate-600">
                  Annullér
                </button>
              </span>
            ) : displayedWebsite ? (
              // Marked (a filled blue badge) once a link exists, same idea as the
              // phone badge - click the link to open the site, or the pencil to
              // correct it.
              <span className="inline-flex items-center gap-1">
                <a
                  href={displayedWebsite}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={displayedWebsite}
                  className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 ring-1 ring-inset ring-sky-600/10 hover:bg-sky-100"
                >
                  🔗 Link
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setWebsiteInput(displayedWebsite);
                    setEditingWebsite(true);
                  }}
                  title="Ret link"
                  className="text-slate-300 hover:text-slate-600"
                >
                  ✏️
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setEditingWebsite(true)} className="text-slate-400 underline hover:text-slate-600">
                + Tilføj link
              </button>
            )}
          </div>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
            {stageLabels[deal.stage]}
            {voicemailAt && (
              <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 normal-case tracking-normal text-amber-700 ring-1 ring-inset ring-amber-600/15">
                📞 Telefonsvar {formatVoicemailTime(voicemailAt)}
              </span>
            )}
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {PRODUCT_SUGGESTIONS.map((product) => {
              const added = addedProducts.includes(product);
              return (
                <button
                  key={product}
                  type="button"
                  onClick={() => addProduct(product)}
                  disabled={busy || added}
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium disabled:opacity-60 ${
                    added
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {added ? "✓ " : "+ "}
                  {product}
                </button>
              );
            })}
          </div>
        </div>

        {!bookingMeeting ? (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setBookingMeeting(true)}
              disabled={busy}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              📅 Book møde
            </button>
            <button
              type="button"
              onClick={voicemail}
              disabled={busy}
              title="Ringet uden svar - noterer tidspunktet og rykker leadet bagerst i listen"
              className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
            >
              📞 Telefonsvar
            </button>
            <button
              type="button"
              onClick={markLost}
              disabled={busy}
              className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
            >
              ❌ Tabt
            </button>
          </div>
        ) : null}
      </div>

      {bookingMeeting && (
        <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Mødetidspunkt</span>
              <input
                type="datetime-local"
                value={meetingDateInput}
                onChange={(e) => setMeetingDateInput(e.target.value)}
                autoFocus
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Varighed</span>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value={15}>15 minutter</option>
                <option value={30}>30 minutter</option>
                <option value={45}>45 minutter</option>
                <option value={60}>60 minutter</option>
                <option value={90}>90 minutter</option>
              </select>
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={sendInvite}
              onChange={(e) => setSendInvite(e.target.checked)}
              className="h-4 w-4"
            />
            Send kalenderinvitation
          </label>

          {sendInvite && (
            <>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Kundens e-mail (gemmes på dealen)
                </span>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="navn@firma.dk"
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                />
              </label>
              {colleagues.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Inviter også</p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {colleagues.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={selectedColleagues.includes(c.id)}
                          onChange={() =>
                            setSelectedColleagues((prev) =>
                              prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]
                            )
                          }
                          className="h-4 w-4"
                        />
                        {c.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={bookMeeting}
              disabled={busy}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {busy ? "Booker…" : "Book møde"}
            </button>
            <button
              type="button"
              onClick={() => setBookingMeeting(false)}
              className="text-sm text-slate-400 hover:text-slate-600"
            >
              Annullér
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

export function RingelisteClient({
  lists,
  selectedListId,
  deals,
  users,
}: {
  lists: CallListSummary[];
  selectedListId: string | null;
  deals: QueueDeal[];
  users: Colleague[];
}) {
  return (
    <div className="space-y-6">
      <QuickAdd selectedListId={selectedListId} />

      <ListPicker lists={lists} selectedListId={selectedListId} />

      <section>
        <h2 className="text-sm font-semibold text-slate-900">
          {selectedListId ? `Tilbage at ringe (${deals.length})` : "Vælg eller opret en liste ovenfor"}
        </h2>
        <ul className="mt-3 space-y-2.5">
          {deals.map((deal) => (
            <QueueCard key={deal.id} deal={deal} users={users} />
          ))}
          {selectedListId && deals.length === 0 && (
            <p className="text-sm text-slate-400">Ingen leads tilbage på denne liste - godt gået!</p>
          )}
        </ul>
      </section>
    </div>
  );
}
