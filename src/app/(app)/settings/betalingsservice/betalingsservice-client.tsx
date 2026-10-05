"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createBsDeliveryAction,
  deleteBsDeliveryAction,
  importBsReturnFileAction,
  markBsDeliverySubmittedAction,
  retryBsPaymentRegistrationAction,
  saveBsSettings,
} from "@/lib/actions/betalingsservice";
import { useToast } from "@/components/toast";

const inputClass = "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm";
const labelClass = "block text-[11px] font-semibold uppercase tracking-wide text-slate-500";

export function BsSettingsForm({
  initial,
}: {
  initial: {
    dataSupplierNumber: string;
    pbsNumber: string;
    debtorGroupNumber: string;
    subsystem: string;
    depositAccountNumber: string;
  };
}) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const router = useRouter();

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const result = await saveBsSettings(formData);
          showToast(result.ok ? "Gemt" : result.error);
          if (result.ok) router.refresh();
        })
      }
      className="mt-4 grid gap-4 sm:grid-cols-2"
    >
      <label className="block">
        <span className={labelClass}>Dataleverandørnummer</span>
        <input name="dataSupplierNumber" defaultValue={initial.dataSupplierNumber} inputMode="numeric" placeholder="8 cifre" className={inputClass} />
      </label>
      <label className="block">
        <span className={labelClass}>PBS-nummer (kreditornummer)</span>
        <input name="pbsNumber" defaultValue={initial.pbsNumber} inputMode="numeric" placeholder="8 cifre" className={inputClass} />
      </label>
      <label className="block">
        <span className={labelClass}>Debitorgruppenummer</span>
        <input name="debtorGroupNumber" defaultValue={initial.debtorGroupNumber} inputMode="numeric" placeholder="5 cifre" className={inputClass} />
      </label>
      <label className="block">
        <span className={labelClass}>Delsystem</span>
        <input name="subsystem" defaultValue={initial.subsystem} placeholder="BS1" className={inputClass} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Mellemregningskonto i Dinero (kontonummer)</span>
        <input
          name="depositAccountNumber"
          defaultValue={initial.depositAccountNumber}
          inputMode="numeric"
          placeholder="fx 5820 - Betalingsservice tilgodehavende"
          className={inputClass}
        />
      </label>
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Gemmer…" : "Gem"}
        </button>
      </div>
    </form>
  );
}

export function CreateDeliveryButton({ readyCount, blockedReason }: { readyCount: number; blockedReason: string | null }) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const router = useRouter();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending || readyCount === 0 || Boolean(blockedReason)}
        onClick={() =>
          startTransition(async () => {
            const result = await createBsDeliveryAction();
            if (result.ok) {
              showToast(`Betalingsfil lavet med ${result.collections} opkrævning${result.collections === 1 ? "" : "er"}.`);
              router.refresh();
            } else {
              showToast(result.error);
            }
          })
        }
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "Laver fil…" : `Lav betalingsfil (${readyCount})`}
      </button>
      {blockedReason && <p className="text-xs text-red-600">{blockedReason}</p>}
    </div>
  );
}

export function DeliveryActions({
  deliveryId,
  submittedAt,
  canDelete,
}: {
  deliveryId: string;
  submittedAt: string | null;
  canDelete: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={`/api/betalingsservice/deliveries/${deliveryId}`}
        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Download
      </a>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await markBsDeliverySubmittedAction(deliveryId, !submittedAt);
            router.refresh();
          })
        }
        className={`rounded-md border px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
          submittedAt ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"
        }`}
        title={submittedAt ? "Klik for at fortryde" : undefined}
      >
        {submittedAt
          ? `✓ Uploadet ${new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short" }).format(new Date(submittedAt))}`
          : "Markér som uploadet"}
      </button>
      {canDelete && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm("Slet filen? Fakturaerne kommer tilbage på listen og kan lægges i en ny fil.")) return;
            startTransition(async () => {
              const result = await deleteBsDeliveryAction(deliveryId);
              showToast(result.ok ? "Filen er slettet" : result.error);
              router.refresh();
            });
          }}
          className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Slet
        </button>
      )}
    </div>
  );
}

export function ReturnFileUpload() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; lines: string[] } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  return (
    <div className="mt-3">
      <form
        ref={formRef}
        action={(formData) =>
          startTransition(async () => {
            const res = await importBsReturnFileAction(formData);
            setResult(res.ok ? { ok: true, lines: res.lines } : { ok: false, lines: [res.error] });
            formRef.current?.reset();
            router.refresh();
          })
        }
        className="flex flex-wrap items-center gap-2"
      >
        <input name="file" type="file" required className="text-sm text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700" />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Indlæser…" : "Indlæs"}
        </button>
      </form>
      {result && (
        <div
          className={`mt-3 rounded-lg border p-3 text-sm ${
            result.ok ? "border-slate-200 bg-slate-50 text-slate-700" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {result.lines.map((line, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function RetryPaymentButton({ collectionId }: { collectionId: string }) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const lines = await retryBsPaymentRegistrationAction(collectionId);
          showToast(lines.join(" ") || "Intet at registrere.");
          router.refresh();
        })
      }
      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
    >
      {pending ? "Prøver…" : "Registrér i Dinero igen"}
    </button>
  );
}
