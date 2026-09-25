import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

// "Send stats" (see CustomerReportSection) schedules its actual scraping/PDF/
// email work via next/server's `after()`, which keeps running past this
// page's own response but is still bounded by its maxDuration.
export const maxDuration = 300;
import { getCurrentUser } from "@/lib/auth";
import Link from "next/link";
import {
  importTypeLabels,
  noteKindLabels,
  contractStatusLabels,
  invoiceStatusLabel,
  formatDKK,
  formatDate,
  dealName,
  invoicePeriodLabel,
  invoiceQuarterShortLabel,
} from "@/lib/labels";
import { parseContractProducts, establishmentLineItems, recurringLineItems } from "@/lib/contract-template-data";
import { isDocuSealConfigured } from "@/lib/docuseal";
import { CommissionSection } from "./commission-section";
import { CommissionExcludedToggle } from "./commission-excluded-toggle";
import { SendContractButton } from "./send-contract-button";
import { DownloadContractButton } from "./download-contract-button";
import { PreviewContractButton } from "./preview-contract-button";
import { ArchiveContractButton } from "./archive-contract-button";
import { ArchiveToDriveButton } from "./archive-to-drive-button";
import { StageFields } from "./stage-fields";
import { InactiveToggleButton } from "./inactive-toggle-button";
import { TerminationSection } from "./termination-section";
import { DealItemsSection } from "./deal-items-section";
import { DealDangerActions } from "./danger-actions";
import { CustomerLinkSection } from "./customer-link-section";
import { AddressAutocomplete } from "../../address-autocomplete";
import { CvrLookupField } from "./cvr-lookup-field";
import { DisplayNameInput } from "../../display-name-input";
import { LockedContractFields } from "./locked-contract-fields";
import { ContractStatusRow } from "./contract-status-row";
import { DealInfoForm } from "./deal-info-form";
import { NoteForm } from "./note-form";
import { CreateTaskFromNoteButton } from "./create-task-from-note-button";
import { EmailList } from "./email-list";
import { DealTasksSection } from "./deal-tasks-section";
import { CreateInvoiceButton } from "./create-invoice-button";
import { SendCalendarInviteButton } from "./send-calendar-invite-button";
import { InvoiceLabelTooltip } from "./invoice-label-tooltip";
import { MarkSentManuallyButton } from "./mark-sent-manually-button";
import { MarkPeriodSentManuallyButton } from "./mark-period-sent-manually-button";
import { CheckPaymentButton } from "./check-payment-button";
import { MarkInvoicePaidButton } from "./mark-invoice-paid-button";
import { CustomerReportSection } from "./customer-report-section";
import { DeleteInvoiceButton } from "@/components/delete-invoice-button";

/** Hover-tooltip content for an invoice's short label: the precise period
 * (since the visible label is now just "Q3 Kvartal") plus, where the deal's
 * contractProducts snapshot allows it, a per-product breakdown - reconstructed
 * on the fly since it isn't persisted on the Invoice row itself. */
function invoiceTooltip(
  deal: { contractProducts: unknown },
  quarterIndex: number,
  amount: number,
  scheduledDate: Date
): { heading: string; rows: { label: string; value: string }[] } {
  const heading = quarterIndex === 0 ? "Etableringspris" : invoicePeriodLabel(scheduledDate);
  const products = parseContractProducts(deal.contractProducts);
  if (!products) return { heading, rows: [] };
  const lines = quarterIndex === 0 ? establishmentLineItems(products, amount) : recurringLineItems(products, amount);
  if (lines.length <= 1) return { heading, rows: [] };
  return { heading, rows: lines.map((l) => ({ label: l.description, value: formatDKK(l.amount) })) };
}

function authorInitials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default async function DealDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dup?: string }>;
}) {
  const { id } = await params;
  const { dup } = await searchParams;

  const [deal, users, currentUser, duplicateDeal, docuSealEnabled] = await Promise.all([
    prisma.deal.findUnique({
      where: { id },
      include: {
        owner: true,
        importBatch: true,
        commission: { include: { seller: true } },
        notes: { include: { author: true }, orderBy: { createdAt: "desc" } },
        emails: { orderBy: { sentAt: "desc" } },
        invoices: { orderBy: { quarterIndex: "asc" } },
        items: { orderBy: { createdAt: "asc" } },
        parent: true,
        branches: true,
        contractEvents: { orderBy: { occurredAt: "desc" }, take: 5 },
        tasks: { orderBy: { createdAt: "asc" } },
        reports: { orderBy: { sentAt: "desc" }, take: 1 },
      },
    }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    getCurrentUser(),
    dup ? prisma.deal.findUnique({ where: { id: dup } }) : Promise.resolve(null),
    isDocuSealConfigured(),
  ]);

  const linkableDeals = (
    await prisma.deal.findMany({
      where: { id: { not: id }, parentDealId: null },
      select: { id: true, companyName: true, displayName: true },
    })
  ).sort((a, b) => dealName(a).localeCompare(dealName(b), "da"));

  if (!deal) notFound();
  // Sorted by whatever's actually shown (kaldenavn when set, else the CVR
  // name) - sorting by companyName alone left the list looking scrambled
  // whenever a branch's displayed name differs from its legal name.
  deal.branches.sort((a, b) => dealName(a).localeCompare(dealName(b), "da"));

  return (
    <div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="break-words text-2xl font-semibold text-slate-900">{dealName(deal)}</h1>
            {deal.churnedAt && (
              <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                Inaktiv siden {formatDate(deal.churnedAt)}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500">
            {deal.displayName && <span className="text-slate-400">CVR-navn: {deal.companyName} · </span>}
            Oprettet {formatDate(deal.createdAt)} · Import: {importTypeLabels[deal.importType]}
            {deal.importBatch?.fileName ? ` (${deal.importBatch.fileName})` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
          <InactiveToggleButton dealId={deal.id} isChurned={Boolean(deal.churnedAt)} />
          <DealDangerActions
            dealId={deal.id}
            stage={deal.stage}
            canDelete={currentUser?.role === "ADMIN" || currentUser?.id === deal.ownerId}
          />
        </div>
      </div>

      {duplicateDeal && (
        <div className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Bemærk: Der findes allerede en anden deal med navnet &quot;{duplicateDeal.companyName}&quot; —{" "}
          <Link href={`/deals/${duplicateDeal.id}`} className="font-medium underline">
            se dealen her
          </Link>
          .
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Deal-information</h2>
            <DealInfoForm dealId={deal.id}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Firmanavn (CVR)</label>
                  <input
                    name="companyName"
                    defaultValue={deal.companyName}
                    required
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Kaldenavn (valgfri)</label>
                  <DisplayNameInput defaultValue={deal.displayName ?? ""} />
                </div>
                <CvrLookupField defaultValue={deal.cvrNumber ?? ""} />
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Adresse</label>
                  <AddressAutocomplete defaultValue={deal.address ?? ""} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Kontaktperson</label>
                  <input
                    name="contactName"
                    defaultValue={deal.contactName ?? ""}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">E-mail</label>
                  <input
                    name="contactEmail"
                    type="email"
                    defaultValue={deal.contactEmail ?? ""}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Telefon</label>
                  <input
                    name="contactPhone"
                    defaultValue={deal.contactPhone ?? ""}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Faktura-e-mail (valgfri)</label>
                  <input
                    name="invoiceEmail"
                    type="email"
                    placeholder="Hvis fakturaer skal et andet sted hen end kontaktpersonen"
                    defaultValue={deal.invoiceEmail ?? ""}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ejer af deal</label>
                  <select
                    name="ownerId"
                    defaultValue={deal.ownerId}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
                <StageFields
                  initialStage={deal.stage}
                  meetingDateIso={deal.meetingDate ? deal.meetingDate.toISOString() : null}
                />
                {deal.meetingDate && (
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Kalenderinvitation
                    </label>
                    <div className="mt-1">
                      <SendCalendarInviteButton
                        dealId={deal.id}
                        colleagues={users.filter((u) => u.id !== deal.ownerId).map((u) => ({ id: u.id, name: u.name }))}
                        defaultDurationMinutes={deal.meetingDurationMinutes}
                      />
                    </div>
                  </div>
                )}
              </div>

              <hr className="border-slate-100" />

              <LockedContractFields
                isAdmin={currentUser?.role === "ADMIN"}
                soldProduct={deal.soldProduct}
                bindingMonths={deal.bindingMonths}
                saleAmount={deal.saleAmount}
                soldAt={deal.soldAt}
                establishmentFee={deal.establishmentFee}
                liveAt={deal.liveAt}
              />

              <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                <span>Møde: {formatDate(deal.meetingDate)}</span>
                <span>Kontrakt sendt: {formatDate(deal.contractSentAt)}</span>
                <span>Underskrevet: {formatDate(deal.contractSignedAt)}</span>
                <span>Filmet: {formatDate(deal.filmedAt)}</span>
                <span>Fakturering starter: {formatDate(deal.billingStartDate)}</span>
                {deal.contractEndDate && (
                  <span className="font-medium text-amber-700">Ophører: {formatDate(deal.contractEndDate)}</span>
                )}
              </div>

              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Gem ændringer
              </button>
            </DealInfoForm>
          </section>

          <DealItemsSection dealId={deal.id} items={deal.items} />

          <DealTasksSection
            dealId={deal.id}
            initialTasks={deal.tasks.map((t) => ({
              id: t.id,
              title: t.title,
              description: t.description,
              done: t.done,
              dueDate: t.dueDate,
              assigneeId: t.assigneeId,
            }))}
            users={users.map((u) => ({ id: u.id, name: u.name }))}
            deals={[{ id: deal.id, name: dealName(deal) }, ...linkableDeals.map((d) => ({ id: d.id, name: dealName(d) }))]}
          />

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Noter</h2>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <NoteForm
                dealId={deal.id}
                kind="MANUAL"
                label="Ny note"
                placeholder="Skriv en note om dealen…"
                className="rounded-md border border-slate-200 p-3"
                buttonClassName="mt-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                buttonLabel="Tilføj note"
                savedMessage="Note tilføjet"
              />

              <NoteForm
                dealId={deal.id}
                kind="AI_MEETING"
                label="AI-mødenote (indsæt fra AI Pocket)"
                placeholder="Indsæt mødenoten/transskriptionen her…"
                className="rounded-md border border-slate-200 bg-indigo-50/40 p-3"
                buttonClassName="mt-2 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                buttonLabel="Gem mødenote"
                savedMessage="Mødenote gemt"
              />
            </div>

            <ul className="mt-6 space-y-3">
              {deal.notes.map((note) => (
                <li key={note.id} className="rounded-md border border-slate-100 p-3">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="flex items-center gap-1.5 font-medium text-slate-700">
                      {note.author.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={note.author.avatarUrl}
                          alt={note.author.name}
                          className="h-5 w-5 flex-shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-300 text-[9px] font-semibold text-white">
                          {authorInitials(note.author.name)}
                        </span>
                      )}
                      {note.author.name}
                    </span>
                    <span className="flex items-center gap-2">
                      {noteKindLabels[note.kind]} · {formatDate(note.createdAt)}
                      <CreateTaskFromNoteButton noteId={note.id} />
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{note.body}</p>
                </li>
              ))}
              {deal.notes.length === 0 && <p className="text-sm text-slate-400">Ingen noter endnu.</p>}
            </ul>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">E-mail på dealen</h2>
            <p className="mt-1 text-xs text-slate-500">
              Mails der modtages fra <span className="font-medium">{deal.contactEmail || "kontaktpersonens e-mail"}</span>{" "}
              i en forbundet Gmail-indbakke vises automatisk her for hele teamet - ingen CC eller andet nødvendigt.
            </p>
            <EmailList emails={deal.emails} />
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Kontrakt</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <ContractStatusRow label={contractStatusLabels[deal.contractStatus]} events={deal.contractEvents} />
            </dl>

            <div className="mt-4 space-y-2">
              {deal.contractStatus === "SIGNED" && (
                <DownloadContractButton
                  dealId={deal.id}
                  fileName={`kontrakt-${deal.companyName.replace(/[^a-z0-9]+/gi, "-")}.pdf`}
                />
              )}
              {deal.contractStatus === "SIGNED" && <ArchiveToDriveButton dealId={deal.id} />}
              {deal.contractStatus === "SIGNED" && currentUser?.role === "ADMIN" && (
                <ArchiveContractButton dealId={deal.id} />
              )}
              {(deal.contractStatus === "SENT" || deal.contractStatus === "VIEWED") && (
                <PreviewContractButton dealId={deal.id} />
              )}
              {deal.contractStatus !== "SIGNED" && (
                <SendContractButton
                  dealId={deal.id}
                  isEdit={deal.contractStatus === "SENT" || deal.contractStatus === "VIEWED"}
                />
              )}
              {!docuSealEnabled && (
                <p className="text-xs text-amber-600">
                  DocuSeal er ikke konfigureret eller er slået fra under Indstillinger → Kontrakter.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Provision</h2>
              <CommissionExcludedToggle dealId={deal.id} excluded={deal.commissionExcluded} />
            </div>
            {deal.commissionExcluded ? (
              <p className="mt-3 text-sm text-slate-400">
                Denne deal er undtaget fra provisionsordningen — ejeren får ikke provision af den.
              </p>
            ) : deal.commission ? (
              <CommissionSection
                dealId={deal.id}
                commission={deal.commission}
                isAdmin={currentUser?.role === "ADMIN"}
              />
            ) : (
              <p className="mt-3 text-sm text-slate-400">
                Ingen provision beregnet endnu. Udfyld salgsbeløb og solgt dato, og sørg for at ejeren er
                provisionslønnet.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Fakturaer (Dinero)</h2>
            {currentUser?.role === "ADMIN" && (
              <div className="mt-3 flex flex-wrap items-stretch gap-2">
                {(deal.establishmentFee ?? 0) > 0 &&
                  deal.invoices.find((i) => i.quarterIndex === 0)?.status !== "SENT_MANUALLY" && (
                    <MarkSentManuallyButton dealId={deal.id} />
                  )}
                <MarkPeriodSentManuallyButton dealId={deal.id} />
                <CreateInvoiceButton dealId={deal.id} />
              </div>
            )}
            {deal.invoices.length > 0 ? (
              <ul className="mt-3 space-y-2 text-sm">
                {deal.invoices.map((inv) => {
                  const { heading, rows } = invoiceTooltip(deal, inv.quarterIndex, inv.amount, inv.scheduledDate);
                  const label =
                    (inv.quarterIndex === 0 ? "Etableringspris" : invoiceQuarterShortLabel(inv.scheduledDate)) +
                    (inv.termNumber > 1 ? ` (kontraktperiode ${inv.termNumber})` : "");
                  return (
                  <li key={inv.id} className="flex flex-col gap-1.5 border-b border-slate-100 pb-2 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <InvoiceLabelTooltip label={label} heading={heading} rows={rows} />
                      <span className="money font-medium text-slate-800">{formatDKK(inv.amount)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={
                          inv.status === "DRAFT_CREATED"
                            ? "shrink-0 whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                            : inv.status === "FAILED"
                            ? "shrink-0 whitespace-nowrap rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"
                            : inv.status === "IMPORTED"
                            ? "shrink-0 whitespace-nowrap rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
                            : inv.status === "SENT_MANUALLY"
                            ? "shrink-0 whitespace-nowrap rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700"
                            : "shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                        }
                        title={inv.failureReason ?? undefined}
                      >
                        {invoiceStatusLabel(inv)}
                      </span>
                      {inv.paidAt && (
                        <span className="shrink-0 whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          Betalt {formatDate(inv.paidAt)}
                        </span>
                      )}
                      {!inv.paidAt && inv.status === "DRAFT_CREATED" && inv.quarterIndex >= 1 && (
                        // Netto+8 is set so it lands exactly on the period's start date
                        // (see draftInvoiceLine in invoice-service.ts) - scheduledDate
                        // *is* the due date here, no separate field needed.
                        <span className="shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          Forfalder {formatDate(inv.scheduledDate)}
                        </span>
                      )}
                      {currentUser?.role === "ADMIN" && !inv.paidAt && inv.dineroInvoiceGuid && !inv.dineroInvoiceGuid.startsWith("TEST-") && (
                        <CheckPaymentButton invoiceId={inv.id} />
                      )}
                      {currentUser?.role === "ADMIN" && <MarkInvoicePaidButton invoiceId={inv.id} paid={Boolean(inv.paidAt)} />}
                      {currentUser?.role === "ADMIN" && <DeleteInvoiceButton invoiceId={inv.id} />}
                    </div>
                    {inv.failureReason && (
                      <p className={inv.status === "FAILED" ? "text-xs text-red-600" : "text-xs text-amber-600"}>
                        {inv.failureReason}
                      </p>
                    )}
                  </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-400">
                Ingen faktura-kladder endnu. Oprettes automatisk hvert kvartal, når kontrakten er underskrevet og
                salgsbeløb + binding er udfyldt.
              </p>
            )}
          </section>

          {currentUser?.role === "ADMIN" && (
            <CustomerReportSection
              dealId={deal.id}
              mpSkinId={deal.mpSkinId}
              reportInterval={deal.reportInterval}
              nextReportDueAt={deal.nextReportDueAt ? deal.nextReportDueAt.toISOString() : null}
              lastSentAt={deal.reports[0] ? deal.reports[0].sentAt.toISOString() : null}
              lastSentMethod={deal.reports[0]?.method ?? null}
              lastStatus={deal.reports[0]?.status ?? null}
              lastErrorMessage={deal.reports[0]?.errorMessage ?? null}
            />
          )}

          <TerminationSection
            dealId={deal.id}
            noticePeriodMonths={deal.noticePeriodMonths}
            terminationNoticeAt={deal.terminationNoticeAt}
            contractEndDate={deal.contractEndDate}
            contractEndDateManual={deal.contractEndDateManual}
            isChurned={Boolean(deal.churnedAt)}
            isAdmin={currentUser?.role === "ADMIN"}
          />

          <CustomerLinkSection
            dealId={deal.id}
            parent={deal.parent}
            branches={deal.branches}
            linkableDeals={linkableDeals}
          />
        </div>
      </div>
    </div>
  );
}
