"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createCallList, addLeadsToCallList, deleteCallList } from "@/lib/actions/call-lists";
import { updateDealStage, setMeetingDateAndStage } from "@/lib/actions/deals";
import { dealName, stageLabels } from "@/lib/labels";
import { useToast } from "@/components/toast";
import type { DealStage } from "@prisma/client";

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
  stage: DealStage;
};

function QuickAdd({ selectedListId }: { selectedListId: string | null }) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const showToast = useToast();

  function submit() {
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
      const result = await addLeadsToCallList(listId, text);
      if (!result.ok) {
        showToast(result.error);
        return;
      }
      showToast(
        `${result.created} lead${result.created === 1 ? "" : "s"} tilføjet${
          result.skipped > 0 ? ` (${result.skipped} sprunget over)` : ""
        }.`
      );
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
          onClick={submit}
          disabled={pending}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Tilføjer…" : selectedListId ? "Tilføj til liste" : "Opret liste og tilføj"}
        </button>
        <span className="text-xs text-slate-400">
          {selectedListId ? "Tilføjes til den valgte liste ovenfor." : "Der oprettes en ny liste automatisk."}
        </span>
      </div>

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

  function remove(id: string) {
    if (!confirm("Slet denne liste? Leadsene beholdes, men mister listetilknytningen.")) return;
    startTransition(async () => {
      await deleteCallList(id);
      router.push("/ringeliste");
      router.refresh();
    });
  }

  if (lists.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {lists.map((l) => (
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
            onClick={() => remove(l.id)}
            disabled={pending}
            title="Slet liste"
            className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] leading-none text-white group-hover:flex"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function QueueCard({ deal }: { deal: QueueDeal }) {
  const [busy, startTransition] = useTransition();
  const [bookingMeeting, setBookingMeeting] = useState(false);
  const [meetingDateInput, setMeetingDateInput] = useState("");
  const [gone, setGone] = useState(false);
  const showToast = useToast();

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
        await setMeetingDateAndStage(deal.id, new Date(meetingDateInput).toISOString());
        showToast("Møde booket");
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
          <Link href={`/deals/${deal.id}`} className="font-semibold text-slate-900 hover:underline">
            {dealName(deal)}
          </Link>
          <p className="mt-0.5 text-xs text-slate-500">
            {[deal.cvrNumber ? `CVR ${deal.cvrNumber}` : null, deal.address].filter(Boolean).join(" · ") || "Ingen adresse"}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {[deal.contactName, deal.contactPhone, deal.contactEmail].filter(Boolean).join(" · ") || "Ingen kontaktoplysninger endnu"}
          </p>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">{stageLabels[deal.stage]}</p>
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
              onClick={markLost}
              disabled={busy}
              className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
            >
              ❌ Tabt
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            <input
              type="datetime-local"
              value={meetingDateInput}
              onChange={(e) => setMeetingDateInput(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={bookMeeting}
              disabled={busy}
              className="rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Book
            </button>
            <button
              type="button"
              onClick={() => setBookingMeeting(false)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Annullér
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

export function RingelisteClient({
  lists,
  selectedListId,
  deals,
}: {
  lists: CallListSummary[];
  selectedListId: string | null;
  deals: QueueDeal[];
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
            <QueueCard key={deal.id} deal={deal} />
          ))}
          {selectedListId && deals.length === 0 && (
            <p className="text-sm text-slate-400">Ingen leads tilbage på denne liste - godt gået!</p>
          )}
        </ul>
      </section>
    </div>
  );
}
