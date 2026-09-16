import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { updateDeal, addNote } from "@/lib/actions/deals";
import Link from "next/link";
import {
  importTypeLabels,
  noteKindLabels,
  commissionFrequencyLabels,
  commissionStatusLabels,
  contractStatusLabels,
  invoiceStatusLabels,
  formatDKK,
  formatDate,
  dealName,
} from "@/lib/labels";
import { isCommissionOverdue } from "@/lib/commission";
import { isPandaDocConfigured } from "@/lib/pandadoc";
import { MarkPaidButton } from "./mark-paid-button";
import { SendContractButton } from "./send-contract-button";
import { StageFields } from "./stage-fields";
import { InactiveToggleButton } from "./inactive-toggle-button";
import { RenewalSection } from "./renewal-section";
import { TerminationSection } from "./termination-section";
import { DealItemsSection } from "./deal-items-section";
import { DealDangerActions } from "./danger-actions";
import { CustomerLinkSection } from "./customer-link-section";

function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

export default async function DealDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dup?: string; calendarWarning?: string }>;
}) {
  const { id } = await params;
  const { dup, calendarWarning } = await searchParams;

  const [deal, users, currentUser, duplicateDeal, pandaDocEnabled] = await Promise.all([
    prisma.deal.findUnique({
      where: { id },
      include: {
        owner: true,
        importBatch: true,
        commission: { include: { seller: true } },
        notes: { include: { author: true }, orderBy: { createdAt: "desc" } },
        emails: { orderBy: { sentAt: "desc" } },
        invoices: { orderBy: { quarterIndex: "asc" } },
        contractRenewals: { orderBy: { renewedAt: "desc" } },
        items: { orderBy: { createdAt: "asc" } },
        parent: true,
        branches: { orderBy: { companyName: "asc" } },
      },
    }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    getCurrentUser(),
    dup ? prisma.deal.findUnique({ where: { id: dup } }) : Promise.resolve(null),
    isPandaDocConfigured(),
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
          <DealDangerActions dealId={deal.id} stage={deal.stage} isAdmin={currentUser?.role === "ADMIN"} />
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
                  <input
                    name="displayName"
                    defaultValue={deal.displayName ?? ""}
                    placeholder="Vises i stedet for CVR-navnet, hvis udfyldt"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
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
                  <input
                    name="address"
                    defaultValue={deal.address ?? ""}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500">Solgt til (produkt/ydelse)</label>
                  <input
                    name="soldProduct"
                    defaultValue={deal.soldProduct ?? ""}
                    placeholder="F.eks. Video-pakke Guld"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">Binding (måneder)</label>
                  <input
                    name="bindingMonths"
                    type="number"
                    min="0"
                    defaultValue={deal.bindingMonths ?? ""}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">Salgsbeløb (DKK)</label>
                  <input
                    name="saleAmount"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={deal.saleAmount ?? ""}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">Solgt dato</label>
                  <input
                    name="soldAt"
                    type="date"
                    defaultValue={toDateInputValue(deal.soldAt)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">Etableringspris (DKK)</label>
                  <input
                    name="establishmentFee"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={deal.establishmentFee ?? ""}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="col-span-2 flex flex-wrap gap-4 text-xs text-slate-500">
                  <span>Møde: {formatDate(deal.meetingDate)}</span>
                  <span>Kontrakt sendt: {formatDate(deal.contractSentAt)}</span>
                  <span>Underskrevet: {formatDate(deal.contractSignedAt)}</span>
                  <span>Filmet: {formatDate(deal.filmedAt)}</span>
                  <span>Live: {formatDate(deal.liveAt)}</span>
                  <span>Fakturering starter: {formatDate(deal.billingStartDate)}</span>
                  {deal.contractEndDate && (
                    <span className="font-medium text-amber-700">
                      Ophører: {formatDate(deal.contractEndDate)}
                    </span>
                  )}
                </div>
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
                  AI-mødenote (indsæt fra AI Rocket)
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
                    <span className="font-medium text-slate-700">{note.author.name}</span>
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
              Sæt <span className="font-mono">{deal.dealEmailAddress}</span> i CC på mails vedrørende denne deal, så
              de vises her for hele teamet.
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
            <h2 className="text-sm font-semibold text-slate-900">Kontrakt (PandaDoc)</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Status</dt>
                <dd className="font-medium text-slate-800">{contractStatusLabels[deal.contractStatus]}</dd>
              </div>
              {deal.contractSentAt && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Sendt</dt>
                  <dd className="text-slate-800">{formatDate(deal.contractSentAt)}</dd>
                </div>
              )}
              {deal.contractViewedAt && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Åbnet</dt>
                  <dd className="text-slate-800">{formatDate(deal.contractViewedAt)}</dd>
                </div>
              )}
              {deal.contractSignedAt && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Underskrevet</dt>
                  <dd className="font-medium text-emerald-700">{formatDate(deal.contractSignedAt)}</dd>
                </div>
              )}
            </dl>

            <div className="mt-4 space-y-2">
              {deal.contractStatus === "SIGNED" && (
                <a
                  href={`/api/deals/${deal.id}/contract/download`}
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-center text-sm hover:bg-slate-50"
                >
                  Download underskrevet kontrakt
                </a>
              )}
              {(deal.contractStatus === "NONE" ||
                deal.contractStatus === "DECLINED" ||
                deal.contractStatus === "VOIDED") && <SendContractButton dealId={deal.id} />}
              {!pandaDocEnabled && (
                <p className="text-xs text-amber-600">
                  PandaDoc er ikke konfigureret eller er slået fra under Indstillinger → Kontrakter.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Provision</h2>
            {deal.commission ? (
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Sælger</dt>
                  <dd className="text-slate-800">{deal.commission.seller.name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Sats</dt>
                  <dd className="text-slate-800">{deal.commission.rate}%</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Grundlag</dt>
                  <dd className="text-slate-800">{formatDKK(deal.commission.baseAmount)}</dd>
                </div>
                <div className="flex justify-between font-medium">
                  <dt className="text-slate-500">Provision</dt>
                  <dd className="text-slate-900">{formatDKK(deal.commission.amount)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Udbetaling</dt>
                  <dd className="text-slate-800">{commissionFrequencyLabels[deal.commission.frequency]}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Forfaldsdato</dt>
                  <dd className={isCommissionOverdue(deal.commission.dueDate, deal.commission.paidAt) ? "font-medium text-red-600" : "text-slate-800"}>
                    {formatDate(deal.commission.dueDate)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Status</dt>
                  <dd className="text-slate-800">
                    {deal.commission.status === "PAID"
                      ? commissionStatusLabels.PAID
                      : isCommissionOverdue(deal.commission.dueDate, deal.commission.paidAt)
                      ? commissionStatusLabels.DUE
                      : commissionStatusLabels.PENDING}
                  </dd>
                </div>
                {deal.commission.status !== "PAID" && currentUser?.role === "ADMIN" && (
                  <MarkPaidButton commissionId={deal.commission.id} />
                )}
              </dl>
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
                    <span className="font-medium text-slate-800">{formatDKK(inv.amount)}</span>
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

          <RenewalSection dealId={deal.id} currentTermNumber={deal.currentTermNumber} renewals={deal.contractRenewals} />

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
