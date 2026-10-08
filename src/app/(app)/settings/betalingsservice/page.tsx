import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { dealName, formatDKK } from "@/lib/labels";
import { bsPayerOf, countSwitchableDeals, getBsSettings, isTestDeliveryFileName, listPendingBsCollections, missingBsSettings } from "@/lib/betalingsservice/service";
import { deliveryDeadline } from "@/lib/betalingsservice/banking-days";
import { isDineroConfigured, listInvoiceTemplates } from "@/lib/dinero";
import { MFT_DEFAULT_HOST, MFT_DEFAULT_PORT, publicKeyFileName } from "@/lib/betalingsservice/sftp";
import {
  SftpPanel,
  CreateTestDeliveryButton,
  InvoiceTemplatePicker,
  BsSettingsForm,
  CreateDeliveryButton,
  DeliveryActions,
  ReturnFileUpload,
  RetryPaymentButton,
  SwitchAllCustomersButton,
  PreviewDraftsButton,
  SignupLinkForm,
  SignupMailPanel,
  SendSignupMailButton,
} from "./betalingsservice-client";
import { signupMailOverview } from "@/lib/betalingsservice/signup-mail";

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
  const [settings, pending, deliveries, results, allBsCustomers, imports, mailboxFiles, switchable, mailOverview] = await Promise.all([
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
        sendViaSftp: true,
        sftpSentAt: true,
        sftpError: true,
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
      where: { paymentMethod: "BETALINGSSERVICE", churnedAt: null, stage: { in: ["CONTRACT_SIGNED", "FILMED", "LIVE"] } },
      orderBy: { bsCustomerNumber: "asc" },
      select: {
        id: true,
        companyName: true,
        displayName: true,
        cvrNumber: true,
        address: true,
        parentDealId: true,
        bsCustomerNumber: true,
        bsMandateNumber: true,
        bsMandateStatus: true,
        bsMandateChangedAt: true,
        bsSignupMailSentAt: true,
        parent: {
          select: {
            id: true,
            companyName: true,
            displayName: true,
            cvrNumber: true,
            address: true,
            parentDealId: true,
            bsCustomerNumber: true,
            bsMandateNumber: true,
            bsMandateStatus: true,
            combinedInvoicing: true,
          },
        },
      },
    }),
    prisma.bsReturnImport.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.bsMailboxFile.findMany({
      orderBy: { receivedAt: "desc" },
      take: 20,
      select: { id: true, fileName: true, kind: true, note: true, receivedAt: true },
    }),
    countSwitchableDeals(),
    signupMailOverview(),
  ]);
  // Through the relay server, the key lives on the server - only the UserID is needed here.
  const sftpReady = Boolean(settings.sftpUser && (settings.relayTokenHash || settings.sftpPrivateKeyEnc));
  let invoiceTemplates: { id: string; name: string; isDefault: boolean }[] = [];
  let invoiceTemplatesError: string | null = null;
  if (await isDineroConfigured()) {
    try {
      invoiceTemplates = await listInvoiceTemplates();
    } catch (err) {
      invoiceTemplatesError = err instanceof Error ? err.message : String(err);
    }
  } else {
    invoiceTemplatesError = "Dinero er ikke sat op.";
  }
  // Test files (KR9) are an admin-only tool - other billing users never see them.
  const visibleDeliveries =
    currentUser.role === "ADMIN" ? deliveries : deliveries.filter((d) => !isTestDeliveryFileName(d.fileName));

  // A branch billed together with its parent pays (and signs up) through
  // the parent (see bsPayerOf), so it's listed under it, sharing its status
  // - and only the parents count as sign-ups. A branch whose parent isn't
  // on Betalingsservice itself is shown on its own.
  const payerIds = new Set(allBsCustomers.filter((c) => bsPayerOf(c).id === c.id).map((c) => c.id));
  const branchesByPayer = new Map<string, typeof allBsCustomers>();
  for (const c of allBsCustomers) {
    const payerId = bsPayerOf(c).id;
    if (payerId === c.id || !payerIds.has(payerId)) continue;
    branchesByPayer.set(payerId, [...(branchesByPayer.get(payerId) ?? []), c]);
  }
  const branchCount = [...branchesByPayer.values()].reduce((n, list) => n + list.length, 0);
  const customers = allBsCustomers.filter((c) => !branchesByPayer.get(bsPayerOf(c).id)?.includes(c));
  const missing = missingBsSettings(settings);
  const signedUp = customers.filter((c) => c.bsMandateStatus === "ACTIVE");
  // Not signed up first - they're the ones to follow up on.
  const customerList = [...customers.filter((c) => c.bsMandateStatus !== "ACTIVE"), ...signedUp];
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
          Fra jeres dataleverandøraftale med Betalingsservice. Mellemregningskontoen er den indbetalingskonto i Dinero
          (55000-55999), betalingerne registreres på - den samlede indbetaling fra Betalingsservice afstemmes bagefter
          mod den.
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
        <InvoiceTemplatePicker
          templates={invoiceTemplates}
          selectedId={settings.dineroInvoiceTemplateId}
          error={invoiceTemplatesError}
        />
        {currentUser.role === "ADMIN" && !invoiceTemplatesError && <PreviewDraftsButton />}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Automatisk via SFTP (My File Transfer)</h2>
        <p className="mt-1 text-xs text-slate-500">
          Arpo sender betalingsfilerne og henter kvitteringer og resultatfiler selv - én gang om dagen, og når du trykker
          &quot;Send/hent nu&quot;. Forbinder til Mastercards server {settings.sftpHost || MFT_DEFAULT_HOST}:
          {settings.sftpPort || MFT_DEFAULT_PORT} med jeres UserID og en SSH-nøgle.
        </p>
        <SftpPanel
          initial={{
            sftpUser: settings.sftpUser ?? "",
            sftpHost: settings.sftpHost ?? "",
            sftpPort: String(settings.sftpPort || MFT_DEFAULT_PORT),
            autoSend: settings.autoSend,
          }}
          publicKey={settings.sftpPublicKey}
          publicKeyFileName={settings.sftpKeyCreatedAt ? publicKeyFileName(settings.sftpKeyCreatedAt) : null}
          lastRunAt={settings.sftpLastRunAt ? deadline(settings.sftpLastRunAt) : null}
          lastError={settings.sftpLastError}
          ready={sftpReady}
          relay={{
            configured: Boolean(settings.relayTokenHash),
            isAdmin: currentUser.role === "ADMIN",
            ip: settings.relayIp,
            lastSeen: settings.relayLastSeenAt ? deadline(settings.relayLastSeenAt) : null,
            stale: !settings.relayLastSeenAt || now.getTime() - settings.relayLastSeenAt.getTime() > 15 * 60 * 1000,
            publicKey: settings.relayPublicKey,
            publicKeyFileName: publicKeyFileName(settings.relayLastSeenAt ?? now),
          }}
        />
        {mailboxFiles.length > 0 && (
          <div className="mt-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Hentet fra postkassen</h3>
            <ul className="mt-1 divide-y divide-slate-100 text-sm">
              {mailboxFiles.map((f) => (
                <li key={f.id} className="py-1.5">
                  <details>
                    <summary className="cursor-pointer text-slate-700">
                      <span className="font-mono text-xs">{f.fileName}</span>
                      <span className="text-xs text-slate-400">
                        {" "}
                        · {deadline(f.receivedAt)} ·{" "}
                        {f.kind === "data" ? "data" : f.kind === "receipt" ? "kvittering" : "fil"}
                      </span>
                    </summary>
                    <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-[11px] text-slate-600">
                      {f.note || "(tom)"}
                    </pre>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        )}
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
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Betalingsfiler</h2>
          {currentUser.role === "ADMIN" && <CreateTestDeliveryButton />}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Download filen og upload den hos Betalingsservice (MFT). Markér den som uploadet bagefter. En fil, der ikke
          er uploadet endnu, kan slettes - så kommer fakturaerne tilbage på listen ovenfor.
        </p>
        {visibleDeliveries.length > 0 ? (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {visibleDeliveries.map((d) => {
              const results = d.collections.filter((c) => c.status !== "IN_FILE").length;
              return (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div>
                    <div className="font-medium text-slate-900">
                      {isTestDeliveryFileName(d.fileName) && (
                        <span className="mr-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                          TEST (KR9)
                        </span>
                      )}
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
                  <div className="flex flex-col items-end gap-1">
                    <DeliveryActions
                      deliveryId={d.id}
                      submittedAt={d.submittedAt ? d.submittedAt.toISOString() : null}
                      canDelete={!d.submittedAt && results === 0 && !d.sftpSentAt}
                      canSendViaSftp={sftpReady && !d.sftpSentAt && !d.sendViaSftp}
                    />
                    {d.sftpSentAt && <span className="text-[11px] text-emerald-700">Sendt via SFTP {deadline(d.sftpSentAt)}</span>}
                    {!d.sftpSentAt && d.sendViaSftp && <span className="text-[11px] text-sky-700">I kø til SFTP</span>}
                    {d.sftpError && <span className="max-w-xs text-right text-[11px] text-red-600">SFTP-fejl: {d.sftpError}</span>}
                  </div>
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
                    {error && c.status === "PAID" && !error.startsWith("Dobbeltbetaling") && <RetryPaymentButton collectionId={c.id} />}
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Kunder på Betalingsservice ({customers.length}
              {branchCount > 0 && ` + ${branchCount} ${branchCount === 1 ? "afdeling" : "afdelinger"}`})
            </h2>
            {customers.length > 0 && (
              <p className="mt-1 text-sm">
                <span className="font-medium text-emerald-700">{signedUp.length} tilmeldt</span>
                <span className="text-slate-400"> · </span>
                <span className="font-medium text-amber-700">{customers.length - signedUp.length} mangler tilmelding</span>
              </p>
            )}
          </div>
          {!settings.allCustomersSwitchedAt && switchable.customers + switchable.other > 0 && (
            <SwitchAllCustomersButton customers={switchable.customers} other={switchable.other} />
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Alle kunder er på Betalingsservice, medmindre de er sat til almindelig faktura på dealen. Etableringen og
          første periode er almindelige fakturaer (FI/bankoverførsel) med tilmeldingsoplysningerne på - derefter
          opkræves hvert kvartal via Betalingsservice: automatisk for dem, der er tilmeldt, ellers med
          indbetalingskort. Kunden tilmelder sig med MitID via tilmeldingslinket eller i netbanken med PBS-nr.{" "}
          {settings.pbsNumber ?? "(ikke angivet)"}, debitorgruppe {settings.debtorGroupNumber ?? "(ikke angivet)"} og sit
          kundenummer.
        </p>
        <SignupLinkForm initial={settings.signupLink ?? ""} />
        <SignupMailPanel
          unsent={mailOverview.unsent}
          withoutEmail={mailOverview.withoutEmail}
          hasLink={Boolean(settings.signupLink)}
        />
        {customers.length > 0 ? (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {customerList.map((c) => (
              <li key={c.id} className="py-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <Link href={`/deals/${c.id}`} className="font-medium text-slate-900 hover:underline">
                      {dealName(c)}
                    </Link>
                    <span className="font-mono text-xs text-slate-400"> {c.bsCustomerNumber}</span>
                    {branchesByPayer.has(c.id) && (
                      <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                        Hovedkunde
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    {c.bsMandateStatus !== "ACTIVE" && settings.signupLink && (
                      <SendSignupMailButton
                        dealId={c.id}
                        sentAt={c.bsSignupMailSentAt ? day(c.bsSignupMailSentAt) : null}
                      />
                    )}
                    <span
                      className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.bsMandateStatus === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {c.bsMandateStatus === "ACTIVE"
                        ? "Automatisk betaling"
                        : c.bsMandateStatus === "CANCELLED"
                        ? "Afmeldt - indbetalingskort"
                        : "Indbetalingskort"}
                    </span>
                  </div>
                </div>
                {(branchesByPayer.get(c.id) ?? []).length > 0 && (
                  <ul className="mt-1.5 space-y-1 border-l-2 border-slate-200 pl-3">
                    {(branchesByPayer.get(c.id) ?? []).map((b) => (
                      <li key={b.id} className="text-sm">
                        <Link href={`/deals/${b.id}`} className="text-slate-700 hover:underline">
                          {dealName(b)}
                        </Link>
                        <span className="text-xs text-slate-400"> · faktureres samlet, samme tilmelding</span>
                      </li>
                    ))}
                  </ul>
                )}
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
