"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addLeadCandidateAsDeal, dismissLeadCandidate } from "@/lib/actions/lead-generation";
import { useToast } from "@/components/toast";

export type LeadCandidateData = {
  id: string;
  companyName: string;
  cvrNumber: string;
  address: string | null;
  industryText: string | null;
  foundedDate: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  sourceLabel: string | null;
  createdAt: string;
};

function formatDate(iso: string | null): string {
  if (!iso) return "–";
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" }).format(new Date(iso));
}

function CandidateCard({ candidate }: { candidate: LeadCandidateData }) {
  const [pending, startTransition] = useTransition();
  const [hidden, setHidden] = useState(false);
  const showToast = useToast();
  const router = useRouter();

  function addAsDeal() {
    startTransition(async () => {
      const result = await addLeadCandidateAsDeal(candidate.id);
      if (!result.ok) {
        showToast(result.error);
        return;
      }
      setHidden(true);
      router.push(result.duplicateId ? `/deals/${result.dealId}?dup=${result.duplicateId}` : `/deals/${result.dealId}`);
    });
  }

  function dismiss() {
    startTransition(async () => {
      await dismissLeadCandidate(candidate.id);
      setHidden(true);
    });
  }

  if (hidden) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-slate-900">{candidate.companyName}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            CVR {candidate.cvrNumber}
            {candidate.industryText && <> · {candidate.industryText}</>}
            {candidate.address && <> · {candidate.address}</>}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            Stiftet {formatDate(candidate.foundedDate)}
            {candidate.sourceLabel && <> · Fundet via &quot;{candidate.sourceLabel}&quot;</>}
          </p>
          {(candidate.contactEmail || candidate.contactPhone) && (
            <p className="mt-0.5 text-xs text-slate-400">
              {[candidate.contactEmail, candidate.contactPhone].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={dismiss}
            disabled={pending}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Afvis
          </button>
          <button
            type="button"
            onClick={addAsDeal}
            disabled={pending}
            className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {pending ? "Tilføjer…" : "Tilføj som deal"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function LeadCandidateSection({ candidates }: { candidates: LeadCandidateData[] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Fundne leads</h2>
      <div className="mt-3 space-y-2">
        {candidates.map((c) => (
          <CandidateCard key={c.id} candidate={c} />
        ))}
        {candidates.length === 0 && (
          <p className="py-4 text-center text-sm text-slate-400">
            Ingen fundne leads endnu - opret et filter og tryk &quot;Kør nu&quot;.
          </p>
        )}
      </div>
    </section>
  );
}
