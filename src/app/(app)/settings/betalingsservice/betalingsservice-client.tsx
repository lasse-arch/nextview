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
  saveBsSftpSettings,
  generateSftpKeyAction,
  testSftpConnectionAction,
  runSftpExchangeAction,
  sendBsDeliveryViaSftpAction,
  createBsTestDeliveryAction,
  saveBsInvoiceTemplate,
  switchAllCustomersToBsAction,
  createBsPreviewDraftsAction,
  saveBsSignupLink,
  previewSignupMailAction,
  sendSignupMailsAction,
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
          placeholder="fx 55100 - indbetalingskonto i Dinero"
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
              showToast(
                [`Betalingsfil lavet med ${result.collections} opkrævning${result.collections === 1 ? "" : "er"}.`, ...(result.notes ?? [])].join(" ")
              );
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
  canSendViaSftp = false,
}: {
  deliveryId: string;
  submittedAt: string | null;
  canDelete: boolean;
  canSendViaSftp?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const router = useRouter();

  function sendViaSftp() {
    if (submittedAt && !confirm("Filen er markeret som uploadet. Send den alligevel via SFTP? Send kun igen, hvis Betalingsservice har afvist den.")) return;
    startTransition(async () => {
      const result = await sendBsDeliveryViaSftpAction(deliveryId);
      showToast(result.lines.join(" "));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canSendViaSftp && (
        <button
          type="button"
          disabled={pending}
          onClick={sendViaSftp}
          className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "Sender…" : "Send via SFTP"}
        </button>
      )}
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

export function SftpPanel({
  initial,
  publicKey,
  publicKeyFileName,
  lastRunAt,
  lastError,
  ready,
}: {
  initial: { sftpUser: string; sftpHost: string; sftpPort: string; autoSend: boolean };
  publicKey: string | null;
  publicKeyFileName: string | null;
  lastRunAt: string | null;
  lastError: string | null;
  ready: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [output, setOutput] = useState<{ ok: boolean; lines: string[] } | null>(null);
  const showToast = useToast();
  const router = useRouter();

  function downloadPublicKey() {
    if (!publicKey || !publicKeyFileName) return;
    const blob = new Blob([publicKey + "\n"], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = publicKeyFileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-4 space-y-4">
      <form
        action={(formData) =>
          startTransition(async () => {
            const result = await saveBsSftpSettings(formData);
            showToast(result.ok ? "Gemt" : result.error);
            if (result.ok) router.refresh();
          })
        }
        className="grid gap-4 sm:grid-cols-3"
      >
        <label className="block">
          <span className={labelClass}>UserID (postkasse)</span>
          <input name="sftpUser" defaultValue={initial.sftpUser} placeholder="fra Mastercard Connect" className={inputClass} />
        </label>
        <label className="block">
          <span className={labelClass}>Server</span>
          <input name="sftpHost" defaultValue={initial.sftpHost} placeholder="185.96.138.21" className={inputClass} />
        </label>
        <label className="block">
          <span className={labelClass}>Port</span>
          <input name="sftpPort" defaultValue={initial.sftpPort} inputMode="numeric" className={inputClass} />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-3">
          <input type="checkbox" name="autoSend" defaultChecked={initial.autoSend} className="h-4 w-4" />
          Lav og send betalingsfilen automatisk (dagligt, når der er fakturaer klar)
        </label>
        <div className="sm:col-span-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Gem
          </button>
        </div>
      </form>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        <p className="font-medium text-slate-900">SSH-nøgle</p>
        {publicKey ? (
          <>
            <p className="mt-1 text-xs text-slate-500">
              Upload den offentlige nøgle én gang til jeres postkasse via My File Transfer i browseren (HTTPS). Der
              kommer en kvittering, der ender på <span className="font-mono">.OK</span>, når nøglen er godkendt.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={downloadPublicKey}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                Download {publicKeyFileName}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (!confirm("Lav en ny nøgle? Den nye skal uploades til postkassen igen, før SFTP virker.")) return;
                  startTransition(async () => {
                    await generateSftpKeyAction();
                    router.refresh();
                  });
                }}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-white disabled:opacity-50"
              >
                Lav ny nøgle
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await generateSftpKeyAction();
                showToast("Nøgle lavet - download den offentlige nøgle og upload den til postkassen.");
                router.refresh();
              })
            }
            className="mt-2 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Generér SSH-nøgle
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || !ready}
          onClick={() => startTransition(async () => setOutput(await testSftpConnectionAction()))}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Test forbindelse
        </button>
        <button
          type="button"
          disabled={pending || !ready}
          onClick={() =>
            startTransition(async () => {
              setOutput(await runSftpExchangeAction());
              router.refresh();
            })
          }
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Arbejder…" : "Send/hent nu"}
        </button>
        <span className="text-xs text-slate-500">
          {lastRunAt ? `Sidst kørt ${lastRunAt}` : "Ikke kørt endnu"}
          {lastError && <span className="text-red-600"> · fejl: {lastError}</span>}
        </span>
      </div>
      {output && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            output.ok ? "border-slate-200 bg-slate-50 text-slate-700" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {output.lines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Admin only - see createBsTestDelivery. */
export function CreateTestDeliveryButton() {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      title="BS 0601 med 15 fiktive testkunder og delsystem KR9 til Mastercards testforløb - rører ingen rigtige fakturaer"
      onClick={() => {
        if (!confirm("Lav en testfil med 15 fiktive kunder og delsystem KR9? Den rører ingen rigtige fakturaer eller kunder.")) return;
        startTransition(async () => {
          try {
            const result = await createBsTestDeliveryAction();
            showToast(result.ok ? "Testfil lavet - download den eller send den via SFTP." : result.error);
            router.refresh();
          } catch (err) {
            showToast(err instanceof Error ? err.message : "Kunne ikke lave testfilen.");
          }
        });
      }}
      className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
    >
      {pending ? "Laver testfil…" : "Lav testfil (KR9)"}
    </button>
  );
}

export function SwitchAllCustomersButton({ customers, other }: { customers: number; other: number }) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (
          !confirm(
            `Sæt ${customers} kunde(r) på Betalingsservice? Næste kvartal opkræves så via Betalingsservice - automatisk for dem, der er tilmeldt, ellers med indbetalingskort. De ${other} leads og åbne deals kommer også på Betalingsservice, så de er det, når de skriver under. Kunder, I bagefter sætter tilbage til almindelig faktura, bliver ved med at være det.`
          )
        )
          return;
        startTransition(async () => {
          try {
            const result = await switchAllCustomersToBsAction();
            showToast(`${result.switched} deal(s) er nu på Betalingsservice.`);
            router.refresh();
          } catch (err) {
            showToast(err instanceof Error ? err.message : "Kunne ikke skifte kunderne.");
          }
        });
      }}
      className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
    >
      {pending ? "Skifter…" : "Sæt alle kunder på Betalingsservice"}
    </button>
  );
}

export function PreviewDraftsButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (
            !confirm(
              "Lav 2 prøvekladder i jeres rigtige Dinero (til Nextview360 ApS selv)? De bliver hverken bogført eller sendt - slet dem i Dinero, når I har kigget på dem."
            )
          )
            return;
          setMessage(null);
          startTransition(async () => {
            const result = await createBsPreviewDraftsAction();
            setMessage(
              result.ok
                ? `${result.count} prøvekladder lavet i Dinero under Fakturaer → Kladder (kunde: Nextview360 ApS). Den ene bruger Betalingsservice-skabelonen, den anden standardskabelonen.`
                : result.error
            );
          });
        }}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? "Laver kladder…" : "Lav prøvekladder i Dinero"}
      </button>
      {message && <p className="mt-2 text-xs text-slate-600">{message}</p>}
    </div>
  );
}

export function InvoiceTemplatePicker({
  templates,
  selectedId,
  error,
}: {
  templates: { id: string; name: string; isDefault: boolean }[];
  selectedId: string | null;
  error: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const router = useRouter();
  if (error) return <p className="mt-2 text-xs text-red-600">Kunne ikke hente skabeloner fra Dinero: {error}</p>;
  return (
    <label className="mt-4 block">
      <span className={labelClass}>Fakturaskabelon i Dinero til Betalingsservice-fakturaer</span>
      <select
        defaultValue={selectedId ?? ""}
        disabled={pending}
        onChange={(e) => {
          const value = e.target.value || null;
          startTransition(async () => {
            await saveBsInvoiceTemplate(value);
            showToast("Gemt");
            router.refresh();
          });
        }}
        className={inputClass}
      >
        <option value="">Dineros standardskabelon</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
            {t.isDefault ? " (standard)" : ""}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-slate-500">
        Vælg en skabelon uden betalingsbetingelser/bankoplysninger, så fakturaen ikke opfordrer til bankoverførsel.
      </span>
    </label>
  );
}

export function SignupLinkForm({ initial }: { initial: string }) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(initial);
  const showToast = useToast();
  const router = useRouter();
  return (
    <div className="mt-4">
      <label className="block">
        <span className={labelClass}>Tilmeldingslink (BS Tilmeldingslink)</span>
        <div className="mt-1 flex gap-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://… (fra Mastercard Connect)"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={pending || value.trim() === initial}
            onClick={() =>
              startTransition(async () => {
                const result = await saveBsSignupLink(value);
                showToast(result.ok ? "Gemt" : result.error);
                if (result.ok) router.refresh();
              })
            }
            className="shrink-0 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Gem
          </button>
        </div>
      </label>
      <p className="mt-1 text-xs text-slate-500">
        Lav linket i Mastercard Connect → BS Customer Portal → Tilmeldingslink og indsæt det her. Det kommer i
        tilmeldingsmailen og på fakturaerne, så kunden kan tilmelde sig med MitID. Har linket plads til kundenummeret,
        så skriv <span className="font-mono">{"{kundenr}"}</span> dér - så udfyldes det for hver kunde.
      </p>
    </div>
  );
}

export function SignupMailPanel({ unsent, withoutEmail, hasLink }: { unsent: number; withoutEmail: string[]; hasLink: boolean }) {
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<{ to: string; subject: string; bodyText: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  function sendAll() {
    if (!confirm(`Send tilmeldingsmailen fra lasse@nextview360.dk til ${unsent} kunde(r), der ikke er tilmeldt og ikke har fået den endnu?`)) return;
    setMessage(null);
    startTransition(async () => {
      let total = 0;
      const failed: string[] = [];
      for (;;) {
        const result = await sendSignupMailsAction();
        if (!result.ok) {
          failed.push(result.error);
          break;
        }
        total += result.sent;
        failed.push(...result.failed.map((f) => `${f.name}: ${f.error}`));
        setMessage(`Sendt ${total} af ${unsent}…`);
        if (result.remaining === 0) break;
      }
      setMessage(`${total} mail(s) sendt.${failed.length > 0 ? ` Fejl: ${failed.join(" · ")}` : ""}`);
      router.refresh();
    });
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
      <p className="font-medium text-slate-900">Tilmeldingsmail</p>
      <p className="mt-1 text-xs text-slate-500">
        Sendes fra lasse@nextview360.dk til kunder, der ikke er tilmeldt endnu - med en knap til tilmeldingslinket og
        kundens eget kundenummer. Afdelinger, der faktureres samlet, får den via hovedkunden.
      </p>
      {!hasLink ? (
        <p className="mt-2 text-xs text-amber-700">Indsæt tilmeldingslinket ovenfor først.</p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await previewSignupMailAction();
                if ("error" in result) setMessage(result.error);
                else setPreview(preview ? null : result);
              })
            }
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {preview ? "Skjul mailen" : "Se mailen"}
          </button>
          <button
            type="button"
            disabled={pending || unsent === 0}
            onClick={sendAll}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {pending ? "Sender…" : unsent > 0 ? `Send til ${unsent} kunde(r)` : "Ingen mangler mailen"}
          </button>
        </div>
      )}
      {preview && (
        <div className="mt-3 rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-700">
          <p>
            <span className="text-slate-400">Til:</span> {preview.to} <span className="text-slate-400">(eksempel)</span>
          </p>
          <p>
            <span className="text-slate-400">Emne:</span> {preview.subject}
          </p>
          <pre className="mt-2 whitespace-pre-wrap font-sans">{preview.bodyText}</pre>
        </div>
      )}
      {withoutEmail.length > 0 && (
        <p className="mt-2 text-xs text-amber-700">Ingen e-mail på dealen: {withoutEmail.join(", ")}</p>
      )}
      {message && <p className="mt-2 text-xs text-slate-600">{message}</p>}
    </div>
  );
}

export function SendSignupMailButton({ dealId, sentAt }: { dealId: string; sentAt: string | null }) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const router = useRouter();
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-400">
      {sentAt && <span>Mail sendt {sentAt}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await sendSignupMailsAction(dealId);
            showToast(
              !result.ok ? result.error : result.failed.length > 0 ? result.failed[0].error : "Tilmeldingsmail sendt"
            );
            router.refresh();
          })
        }
        className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? "Sender…" : sentAt ? "Send igen" : "Send mail"}
      </button>
    </span>
  );
}
