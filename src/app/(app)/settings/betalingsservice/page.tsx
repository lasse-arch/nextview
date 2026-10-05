import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { dealName, formatDKK } from "@/lib/labels";
import { getBsSettings, listPendingBsCollections, missingBsSettings } from "@/lib/betalingsservice/service";
import { deliveryDeadline } from "@/lib/betalingsservice/banking-days";
import {
  BsSettingsForm,
  CreateDeliveryButton,
  DeliveryActions,
  ReturnFileUpload,
  RetryPaymentButton,
} from "./betalingsservice-client";

const COLLECTION_STATUS: Record<string, { label: string; className: string }> = {
  IN_FILE: { label: "Afventer resultat", className: "bg-sky-50 text-sky-700" },
  PAID: { label: "Betalt", className: "bg-emerald-50 text-emerald-700" },
  REJECTED: { label: "Afvist", className: "bg-red-50 text-red-700" },
  CANCELLED: { label: "Annulleret", className: "bg-red-50 text-red-700" },
  CHARGED_BACK: { label: "Tilbageført", className: "bg-red-50 text-red-700" },
};

function day(d: Date): string {
  return new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}

function deadline(d: Date): string {
  return new Intl.DateTimeFormat("da-DK", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Copenhagen",
  }).format(d);
}

function kr(ore: number): string {
  return `${(ore / 100).toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;
}

/**
 * Betalingsservice, with the CRM as its own data supplier: make the BS 0601
 * collection file from the Betalingsservice customers' Dinero invoices,
 * upload it at Betalingsservice by hand, and read the BS 0602/0603 result
 * files back in to mark invoices paid (registered in Dinero against the
 * mellemregningskonto) and keep track of who has signed up for automatic
 * payment. See src/lib/betalingsservice/service.ts.
 */
export default async function BetalingsservicePage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (!currentUser.canAccessBilling) redirect("/");

  const now = new Date();
  const [settings, pending, deliveries, results, customers, imports] = await Promise.all([
    getBsSettings(),
    listPendingBsCollections(now),
    prisma.bsDelivery.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        sequence: true,
        fileName: true,
        collectionCount: true,
        totalOre: true,
        firstDueDate: true,
        submittedAt: true,
        createdAt: true,
        createdBy: { select: { name: true } },
        collections: { select: { status: true } },
      },
    }),
    prisma.bsCollection.findMany({
      orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
      take: 50,
      include: {
        deal: { select: { id: true, companyName: true, displayName: true } },
        invoices: { select: { dineroInvoiceNumber: true, bsPaymentError: true } },
      },
    }),
    prisma.deal.findMany({
      where: { paymentMethod: "BETALINGSSERVICE" },
      orderBy: { bsCustomerNumber: "asc" },
      select: {
        id: true,
        companyName: true,
        displayName: true,
        bsCustomerNumber: true,
        bsMandateStatus: true,
        bsMandateChangedAt: true,
      },
    }),
    prisma.bsReturnImport.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  const missing = missingBsSettings(settings);
  const ready = pending.filter((p) => p.problems.length === 0 && !p.notYet);
  const nextDeadline = ready.length > 0 ? new Date(Math.min(...ready.map((p) => p.deadline.getTime()))) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Betalingsservice</h1>
        <p className="mt-1 text-sm text-slate-500">
          Kunder på Betalingsservice får stadig deres faktura fra Dinero, men beløbet opkræves via Betalingsservice -
          automatisk når de er tilmeldt, ellers med indbetalingskort. Lav betalingsfilen her, upload den hos
          Betalingsservice, og indlæs resultatfilerne, så fakturaerne bliver markeret betalt - også i Dinero.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Aftale</h2>
        <p className="mt-1 text-xs text-slate-500">
          Fra jeres dataleverandøraftale med Betalingsservice. Mellemregningskontoen er kontoen i Dinero, betalingerne
          registreres på - den samlede indbetaling fra Betalingsservice afstemmes bagefter mod den.
        </p>
        <BsSettingsForm
          initial={{
            dataSupplierNumber: settings.dataSupplierNumber ?? "",
            pbsNumber: settings.pbsNumber ?? "",
            debtorGroupNumber: settings.debtorGroupNumber ?? "",
            subsystem: settings.subsystem,
            depositAccountNumber: settings.depositAccountNumber ? String(settings.depositAccountNumber) : "",
          }}
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Klar til betalingsfil ({ready.length})</h2>
            <p className="mt-1 text-xs text-slate-500">
              Fakturaer til Betalingsservice-kunder, som endnu ikke er i en fil. Filen skal være uploadet senest kl.
              11:00 på 6.-sidste bankdag i måneden før opkrævningen.
              {nextDeadline && (
                <>
                  {" "}
                  Næste frist: <span className="font-semibold text-slate-700">{deadline(nextDeadline)}</span>.
                </>
              )}
            </p>
          </div>
          <CreateDeliveryButton readyCount={ready.length} blockedReason={missing.length > 0 ? `Udfyld først: ${missing.join(", ")}.` : null} />
        </div>
        {pending.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Kunde</th>
                  <th className="py-2 pr-3 font-semibold">Faktura</th>
                  <th className="py-2 pr-3 font-semibold">Opkræves</th>
                  <th className="py-2 pr-3 font-semibold">Betaling</th>
                  <th className="py-2 pr-3 text-right font-semibold">Beløb ekskl. moms</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pending.map((p) => (
                  <tr key={p.key} className="align-top">
                    <td className="py-2 pr-3">
                      <Link href={`/deals/${p.dealId}`} className="font-medium text-slate-900 hover:underline">
                        {p.dealName}
                      </Link>
                      <div className="font-mono text-[11px] text-slate-400">{p.customerNumber ?? "-"}</div>
                      {p.problems.map((problem) => (
                        <p key={problem} className="mt-0.5 text-xs text-red-600">
                          {problem}
                        </p>
                      ))}
                      {p.notYet && p.problems.length === 0 && (
                        <p className="mt-0.5 text-xs text-slate-400">Kan først komme med, når der er under 90 dage til.</p>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-slate-700">{p.invoiceNumbers.join(", ")}</td>
                    <td className="py-2 pr-3 text-slate-700">
                      {day(p.dueDate)}
                      <div className="text-[11px] text-slate-400">frist {deadline(deliveryDeadline(p.dueDate))}</div>
                      {p.shiftedFrom && (
                        <div className="text-[11px] text-amber-600">
                          Rykket fra {day(p.shiftedFrom)} - kunden har allerede en opkrævning den dag.
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-slate-700">{p.automatic ? "Automatisk" : "Indbetalingskort"}</td>
                    <td className="money py-2 pr-3 text-right text-slate-800">{formatDKK(p.amountExclVat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-400">Ingen fakturaer venter på at komme i en betalingsfil.</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Betalingsfiler</h2>
        <p className="mt-1 text-xs text-slate-500">
          Download filen og upload den hos Betalingsservice (MFT). Markér den som uploadet bagefter. En fil, der ikke
          er uploadet endnu, kan slettes - så kommer fakturaerne tilbage på listen ovenfor.
        </p>
        {deliveries.length > 0 ? (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {deliveries.map((d) => {
              const results = d.collections.filter((c) => c.status !== "IN_FILE").length;
              return (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div>
                    <div className="font-medium text-slate-900">
                      Fil nr. {d.sequence} · {d.collectionCount} opkrævning{d.collectionCount === 1 ? "" : "er"} ·{" "}
                      {kr(d.totalOre)}
                    </div>
                    <div className="text-xs text-slate-500">
                      Lavet {deadline(d.createdAt)}
                      {d.createdBy ? ` af ${d.createdBy.name}` : ""} · første opkrævning {day(d.firstDueDate)} · frist{" "}
                      {deadline(deliveryDeadline(d.firstDueDate))}
                      {results > 0 && ` · ${results} resultat${results === 1 ? "" : "er"} modtaget`}
                    </div>
                  </div>
                  <DeliveryActions
                    deliveryId={d.id}
                    submittedAt={d.submittedAt ? d.submittedAt.toISOString() : null}
                    canDelete={!d.submittedAt && results === 0}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-400">Ingen betalingsfiler endnu.</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Indlæs fil fra Betalingsservice</h2>
        <p className="mt-1 text-xs text-slate-500">
          Betalingsoplysninger (BS 0602) markerer fakturaer betalt, afvist eller tilbageført. Aftaleoplysninger (BS 0603)
          viser, hvem der er tilmeldt automatisk betaling. Den samme fil kan trygt indlæses igen - den bliver kun brugt
          én gang.
        </p>
        <ReturnFileUpload />
        {imports.length > 0 && (
          <ul className="mt-4 space-y-1 text-xs text-slate-500">
            {imports.map((i) => (
              <li key={i.id}>
                {deadline(i.createdAt)} · {i.fileName} · BS {i.deliveryType} · {i.paymentCount} betaling
                {i.paymentCount === 1 ? "" : "er"}, {i.mandateCount} aftale{i.mandateCount === 1 ? "" : "r"}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Opkrævninger</h2>
        {results.length > 0 ? (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {results.map((c) => {
              const status = COLLECTION_STATUS[c.status];
              const error = c.invoices.find((i) => i.bsPaymentError)?.bsPaymentError;
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <Link href={`/deals/${c.deal.id}`} className="font-medium text-slate-900 hover:underline">
                      {dealName(c.deal)}
                    </Link>
                    <span className="text-xs text-slate-500">
                      {" "}
                      · faktura {c.invoices.map((i) => i.dineroInvoiceNumber).join(", ")} · {day(c.dueDate)} ·{" "}
                      {kr(c.paidAmountOre ?? c.amountOre)}
                      {c.channel && ` · ${c.channel === "automatic" ? "automatisk" : "indbetalingskort"}`}
                    </span>
                    {error && <p className="text-xs text-red-600">Dinero: {error}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {error && c.status === "PAID" && <RetryPaymentButton collectionId={c.id} />}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>{status.label}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-400">Ingen opkrævninger endnu.</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Kunder på Betalingsservice ({customers.length})</h2>
        <p className="mt-1 text-xs text-slate-500">
          Sæt en kunde på Betalingsservice under &quot;Fakturaer&quot; på dealen. Kunden tilmelder sig automatisk betaling i
          sin netbank med PBS-nr. {settings.pbsNumber ?? "(ikke angivet)"}, debitorgruppe{" "}
          {settings.debtorGroupNumber ?? "(ikke angivet)"} og sit kundenummer.
        </p>
        {customers.length > 0 ? (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {customers.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                <div>
                  <Link href={`/deals/${c.id}`} className="font-medium text-slate-900 hover:underline">
                    {dealName(c)}
                  </Link>
                  <span className="font-mono text-xs text-slate-400"> {c.bsCustomerNumber}</span>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    c.bsMandateStatus === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {c.bsMandateStatus === "ACTIVE"
                    ? "Automatisk betaling"
                    : c.bsMandateStatus === "CANCELLED"
                    ? "Afmeldt - indbetalingskort"
                    : "Indbetalingskort"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-400">Ingen kunder er sat på Betalingsservice endnu.</p>
        )}
      </section>
    </div>
  );
}
