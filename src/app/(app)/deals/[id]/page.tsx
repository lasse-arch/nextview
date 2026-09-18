import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { updateDeal, addNote } from "@/lib/actions/deals";
import Link from "next/link";
import {
  importTypeLabels,
  noteKindLabels,
  contractStatusLabels,
  invoiceStatusLabels,
  formatDKK,
  formatDate,
  dealName,
} from "@/lib/labels";
import { isDocuSealConfigured } from "@/lib/docuseal";
import { CommissionSection } from "./commission-section";
import { CommissionExcludedToggle } from "./commission-excluded-toggle";
import { SendContractButton } from "./send-contract-button";
import { DownloadContractButton } from "./download-contract-button";
import { ArchiveContractButton } from "./archive-contract-button";
import { ArchiveToDriveButton } from "./archive-to-drive-button";
import { StageFields } from "./stage-fields";
import { InactiveToggleButton } from "./inactive-toggle-button";
import { TerminationSection } from "./termination-section";
import { DealItemsSection } from "./deal-items-section";
import { DealDangerActions } from "./danger-actions";
import { CustomerLinkSection } from "./customer-link-section";
import { AddressAutocomplete } from "../../address-autocomplete";
import { DisplayNameInput } from "../../display-name-input";
import { LockedContractFields } from "./locked-contract-fields";
import { ContractStatusRow } from "./contract-status-row";

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
  searchParams: Promise<{ dup?: string; calendarWarning?: string; saveError?: string }>;
}) {
  const { id } = await params;
  const { dup, calendarWarning, saveError } = await searchParams;

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
        branches: { orderBy: { companyName: "asc" } },
        contractEvents: { orderBy: { occurredAt: "desc" }, take: 5 },
      },
    }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    getCurrentUser(),
    dup ? prisma.deal.findUnique({ where: { id: dup } }) : Promise.resolve(null),
    isDocuSealConfigured(),
  ]);

  const linkableDeals = await prisma.deal.findMany({
    where: { id: { not: id }, parentDealId: null },
    select: { id: true, companyName: true, displayName: true },
    orderBy: { companyName: "asc" },
  });

  if (!deal) notFound();

  const updateDealWithId = updateDeal.bind(null, deal.id);
  const addNoteWithId = addNote.bind(null, deal.id);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">{dealName(deal)}</h1>
            {deal.churnedAt && (
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
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
        <div className="flex items-center gap-2">
          <InactiveToggleButton dealId={deal.id} isChurned={Boolean(deal.churnedAt)} />
          <DealDangerActions
            dealId={deal.id}
            stage={deal.stage}
            canDelete={currentUser?.role === "ADMIN" || currentUser?.id === deal.ownerId}
          />
        </div>
      </div>

      {saveError && (
        <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">
          Kunne ikke gemme: {saveError}
        </div>
      )}

      {duplicateDeal && (
        <div className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Bemærk: Der findes allerede en anden deal med navnet &quot;{duplicateDeal.companyName}&quot; —{" "}
          <Link href={`/deals/${duplicateDeal.id}`} className="font-medium underline">
            se dealen her
          </Link>
          .
        </div>
      )}

      {calendarWarning && (
        <div className="mt-4 rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-600">
          Mødet blev gemt, men kunne ikke sættes i Google Kalender: {calendarWarning}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Deal-information</h2>
            <form action={updateDealWithId} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500">Firmanavn (CVR)</label>
                  <input
                    name="companyName"
                    defaultValue={deal.companyName}
                    required
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">Kaldenavn (valgfri)</label>
                  <DisplayNameInput defaultValue={deal.displayName ?? ""} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">CVR-nummer</label>
                  <input
                    name="cvrNumber"
                    defaultValue={deal.cvrNumber ?? ""}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-500">Adresse</label>
                  <AddressAutocomplete defaultValue={deal.address ?? ""} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">Kontaktperson</label>
                  <input
                    name="contactName"
                    defaultValue={deal.contactName ?? ""}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">E-mail</label>
                  <input
                    name="contactEmail"
                    type="email"
                    defaultValue={deal.contactEmail ?? ""}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">Telefon</label>
                  <input
                    name="contactPhone"
                    defaultValue={deal.contactPhone ?? ""}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">Faktura-e-mail (valgfri)</label>
                  <input
                    name="invoiceEmail"
                    type="email"
                    placeholder="Hvis fakturaer skal et andet sted hen end kontaktpersonen"
                    defaultValue={deal.invoiceEmail ?? ""}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">Ejer af deal</label>
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
            </form>
          </section>

          <DealItemsSection dealId={deal.id} items={deal.items} />

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Noter</h2>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <form action={addNoteWithId} className="rounded-md border border-slate-200 p-3">
                <input type="hidden" name="kind" value="MANUAL" />
                <label className="block text-xs font-medium text-slate-500">Ny note</label>
                <textarea
                  name="body"
                  rows={3}
                  required
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Skriv en note om dealen…"
                />
                <button
                  type="submit"
                  className="mt-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                >
                  Tilføj note
                </button>
              </form>

              <form action={addNoteWithId} className="rounded-md border border-slate-200 bg-indigo-50/40 p-3">
                <input type="hidden" name="kind" value="AI_MEETING" />
                <label className="block text-xs font-medium text-slate-500">
                  AI-mødenote (indsæt fra AI Pocket)
                </label>
                <textarea
                  name="body"
                  rows={3}
                  required
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Indsæt mødenoten/transskriptionen her…"
                />
                <button
                  type="submit"
                  className="mt-2 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
                >
                  Gem mødenote
                </button>
              </form>
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
                    <span>
                      {noteKindLabels[note.kind]} · {formatDate(note.createdAt)}
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
            <ul className="mt-4 space-y-3">
              {deal.emails.map((email) => (
                <li key={email.id} className="rounded-md border border-slate-100 p-3 text-sm">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {email.direction === "INBOUND" ? "Fra" : "Til"}: {email.direction === "INBOUND" ? email.fromAddress : email.toAddresses}
                    </span>
                    <span>{formatDate(email.sentAt)}</span>
                  </div>
                  <p className="mt-1 font-medium text-slate-800">{email.subject}</p>
                  {email.bodyText && <p className="mt-1 text-slate-600 line-clamp-3">{email.bodyText}</p>}
                </li>
              ))}
              {deal.emails.length === 0 && (
                <p className="text-sm text-slate-400">
                  Ingen mails endnu. Forbind Gmail/Outlook under Indstillinger → E-mail for at aktivere automatisk
                  match.
                </p>
              )}
            </ul>
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
            {deal.invoices.length > 0 ? (
              <ul className="mt-3 space-y-2 text-sm">
                {deal.invoices.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                    <span className="text-slate-600">
                      {inv.quarterIndex === 0 ? "Etablering" : `Periode ${inv.quarterIndex}`}
                      {inv.termNumber > 1 ? ` (kontraktperiode ${inv.termNumber})` : ""}
                    </span>
                    <span className="money font-medium text-slate-800">{formatDKK(inv.amount)}</span>
                    <span
                      className={
                        inv.status === "DRAFT_CREATED"
                          ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                          : inv.status === "FAILED"
                          ? "rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"
                          : inv.status === "IMPORTED"
                          ? "rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
                          : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                      }
                      title={inv.failureReason ?? undefined}
                    >
                      {invoiceStatusLabels[inv.status]}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-400">
                Ingen faktura-kladder endnu. Oprettes automatisk hvert kvartal, når kontrakten er underskrevet og
                salgsbeløb + binding er udfyldt.
              </p>
            )}
          </section>

          <TerminationSection
            dealId={deal.id}
            noticePeriodMonths={deal.noticePeriodMonths}
            terminationNoticeAt={deal.terminationNoticeAt}
            contractEndDate={deal.contractEndDate}
            isChurned={Boolean(deal.churnedAt)}
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
