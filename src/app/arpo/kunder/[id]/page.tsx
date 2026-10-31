import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dealName, formatDKK, invoiceQuarterShortLabel } from "@/lib/labels";
import { tourStats } from "@/lib/tour-stats";
import { CLOUDFLARE_TOUR_ORIGIN } from "@/lib/public-urls";
import { CustomerAccessSection } from "../../deals/[id]/customer-access-section";
import { customerCards, forPicker } from "@/lib/customer-cards";
import { CustomerPicker, Thumb } from "../customer-picker";

export const metadata = { title: "Kunde" };

/*
 * One customer, everything in one place: who they are, what they pay and
 * whether they've paid, their tours and how they do, who can log in to their
 * customer page and when they did - and every mail and event, newest first.
 * A chain's main deal brings its locations along. For the whole team (as the
 * deal page); giving logins and "Se som kunde" are for admins.
 */

const d = (x: Date | null | undefined) => (x ? x.toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" }) : "–");
const dt = (x: Date) => x.toLocaleString("da-DK", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const num = (n: number) => n.toLocaleString("da-DK");

type Tone = "mail" | "login" | "money" | "contract" | "tour" | "warn";
type Event = { at: Date; tone: Tone; title: string; detail?: string };

const TONE: Record<Tone, string> = {
  mail: "bg-[#0071e3]",
  login: "bg-[#34c759]",
  money: "bg-[#af52de]",
  contract: "bg-[#ff9500]",
  tour: "bg-[#5ac8fa]",
  warn: "bg-[#ff3b30]",
};

const CONTRACT: Record<string, string> = {
  CONTRACT_SENT: "Kontrakt sendt til underskrift",
  SENT: "Kontrakt sendt til underskrift",
  VIEWED: "Kunden åbnede kontrakten",
  SIGNED: "Kontrakten blev underskrevet",
  DECLINED: "Kunden afviste kontrakten",
  EXPIRED: "Kontrakten udløb",
  ARCHIVED: "Kontrakten blev arkiveret",
};

const MAIL_KIND: Record<string, string> = {
  login: "Login-link til kundesiden",
  access: "Adgang til kundesiden (første login-link)",
  welcome: "Velkomstmail",
  bs_signup: "Tilmelding til Betalingsservice",
  review: "Touren sendt til gennemgang",
  review_reminder: "Påmindelse om gennemgang af touren",
  review_fixed: "Rettelser lavet - se og godkend touren",
};

export default async function CustomerOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/session-ended?next=/arpo");
  const isAdmin = user.role === "ADMIN";
  // Amounts, invoices and payments only for those with access to billing (as Stats and Fakturaer).
  const billing = user.canAccessBilling;
  const { id } = await params;

  const deal = await prisma.deal.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true } },
      parent: { select: { id: true, companyName: true, displayName: true } },
      branches: { select: { id: true, companyName: true, displayName: true, stage: true } },
      items: { orderBy: { createdAt: "asc" } },
      customerAccounts: {
        orderBy: { createdAt: "asc" },
        include: { account: { include: { logins: { orderBy: { at: "desc" }, take: 50 }, _count: { select: { logins: true } } } } },
      },
    },
  });
  if (!deal) notFound();
  const dealIds = [deal.id, ...deal.branches.map((b) => b.id)];
  const accountIds = deal.customerAccounts.map((c) => c.accountId);

  const [invoices, collections, reports, contract, emails, mails, tours] = await Promise.all([
    prisma.invoice.findMany({ where: { dealId: { in: dealIds } }, orderBy: [{ scheduledDate: "desc" }] }),
    prisma.bsCollection.findMany({ where: { dealId: { in: dealIds } }, orderBy: { dueDate: "desc" }, take: 40 }),
    prisma.customerReport.findMany({ where: { dealId: { in: dealIds } }, orderBy: { sentAt: "desc" }, take: 40 }),
    prisma.contractEvent.findMany({ where: { dealId: { in: dealIds } }, orderBy: { occurredAt: "desc" } }),
    prisma.emailMessage.findMany({ where: { dealId: { in: dealIds } }, orderBy: { sentAt: "desc" }, take: 60, select: { direction: true, subject: true, toAddresses: true, fromAddress: true, sentAt: true, openedAt: true, openCount: true } }),
    prisma.systemMail.findMany({ where: { OR: [{ dealId: { in: dealIds } }, ...(accountIds.length ? [{ accountId: { in: accountIds } }] : [])] }, orderBy: { sentAt: "desc" }, take: 100 }),
    prisma.tour.findMany({ where: { dealId: { in: dealIds } }, orderBy: { name: "asc" }, select: { slug: true, name: true, published: true, liveVersion: true } }),
  ]);
  const picker = forPicker(await customerCards());
  const stats = await Promise.all(tours.map((t) => tourStats(t.slug, 30).catch(() => null)));
  // Messages visitors wrote with the tours' contact form ("Skriv til os").
  const messages = tours.length ? await prisma.tourMessage.findMany({ where: { tourSlug: { in: tours.map((t) => t.slug) } }, orderBy: { createdAt: "desc" }, take: 100 }) : [];

  // Money: what's been sent, paid, and still out.
  const sent = invoices.filter((i) => i.sentAt || i.status === "SENT_MANUALLY");
  const paid = sent.filter((i) => i.paidAt);
  const open = sent.filter((i) => !i.paidAt && i.status !== "IMPORTED");
  const overdue = open.filter((i) => i.dueDate && i.dueDate < new Date());
  const next = invoices.filter((i) => i.status === "PENDING" && i.scheduledDate >= new Date()).sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime())[0];
  const sum = (xs: typeof invoices) => xs.reduce((n, i) => n + i.amount, 0);

  // Everything that happened, newest first.
  const events: Event[] = [];
  for (const m of mails)
    events.push({ at: m.sentAt, tone: m.error ? "warn" : "mail", title: `${MAIL_KIND[m.kind] ?? "Mail"}${m.error ? " - blev ikke sendt" : ""}`, detail: m.error ? `${m.to} · ${m.error}` : `Til ${m.to} · ${m.subject}` });
  // From before the system kept its own log of these.
  if (deal.welcomeMailSentAt && !mails.some((m) => m.kind === "welcome" && !m.error)) events.push({ at: deal.welcomeMailSentAt, tone: "mail", title: "Velkomstmail", detail: deal.contactEmail ? `Til ${deal.contactEmail}` : undefined });
  if (deal.bsSignupMailSentAt && !mails.some((m) => m.kind === "bs_signup")) events.push({ at: deal.bsSignupMailSentAt, tone: "mail", title: "Tilmelding til Betalingsservice" });
  for (const c of deal.customerAccounts) for (const l of c.account.logins) events.push({ at: l.at, tone: "login", title: "Loggede ind på kundesiden", detail: c.account.email });
  for (const e of emails)
    events.push(
      e.direction === "OUTBOUND"
        ? { at: e.sentAt, tone: "mail", title: `Mail sendt: ${e.subject || "(uden emne)"}`, detail: `Til ${e.toAddresses}${e.openedAt ? ` · åbnet ${e.openCount > 1 ? `${e.openCount} gange` : dt(e.openedAt)}` : ""}` }
        : { at: e.sentAt, tone: "mail", title: `Mail modtaget: ${e.subject || "(uden emne)"}`, detail: `Fra ${e.fromAddress}` }
    );
  for (const r of reports) {
    events.push({ at: r.sentAt, tone: r.status === "FAILED" ? "warn" : "tour", title: r.status === "FAILED" ? "Statistikrapport - blev ikke sendt" : `Statistikrapport sendt${r.method === "AUTOMATIC" ? " (automatisk)" : ""}`, detail: r.errorMessage ?? undefined });
    if (r.openedAt) events.push({ at: r.openedAt, tone: "tour", title: "Kunden åbnede statistikrapporten", detail: r.openCount > 1 ? `${r.openCount} gange i alt` : undefined });
  }
  for (const i of billing ? invoices : []) {
    const what = `${i.dineroInvoiceNumber ? `Faktura ${i.dineroInvoiceNumber}` : "Faktura"} · ${i.quarterIndex === 0 ? "Etablering" : invoiceQuarterShortLabel(i.scheduledDate)} · ${formatDKK(i.amount)}`;
    if (i.sentAt) events.push({ at: i.sentAt, tone: "money", title: "Faktura sendt", detail: what });
    if (i.paidAt) events.push({ at: i.paidAt, tone: "money", title: "Faktura betalt", detail: what });
  }
  for (const c of billing ? collections : []) {
    if (c.status === "PAID" && c.paymentDate) events.push({ at: c.paymentDate, tone: "money", title: "Betalingsservice: beløbet er trukket", detail: `${formatDKK(Math.round((c.paidAmountOre ?? c.amountOre) / 100))} · faktura ${c.reference}` });
    if ((c.status === "REJECTED" || c.status === "CHARGED_BACK") && c.statusAt) events.push({ at: c.statusAt, tone: "warn", title: c.status === "REJECTED" ? "Betalingsservice: afvist" : "Betalingsservice: tilbageført", detail: `${formatDKK(Math.round(c.amountOre / 100))} · faktura ${c.reference}` });
  }
  for (const c of contract) if (CONTRACT[c.type]) events.push({ at: c.occurredAt, tone: "contract", title: CONTRACT[c.type] });
  for (const m of messages)
    events.push({
      at: m.createdAt,
      tone: m.sent ? "tour" : "warn",
      title: `Besked fra touren: ${m.name}${m.sent ? "" : " - mailen til kunden gik ikke igennem"}`,
      detail: `${m.email}${m.phone ? ` · ${m.phone}` : ""} · ${m.message.slice(0, 160)}${m.message.length > 160 ? "…" : ""}`,
    });
  if (deal.liveAt) events.push({ at: deal.liveAt, tone: "login", title: "Kunden gik live" });
  if (deal.filmedAt) events.push({ at: deal.filmedAt, tone: "tour", title: "Filmet" });
  events.sort((a, b) => b.at.getTime() - a.at.getTime());

  const name = dealName(deal);
  const lastLogin = deal.customerAccounts.map((c) => c.account.lastLoginAt).filter((x): x is Date => !!x).sort((a, b) => b.getTime() - a.getTime())[0];
  const visits30 = stats.reduce((n, s) => n + (s?.visits ?? 0), 0);
  const leads30 = stats.reduce((n, s) => n + (s?.leads ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        {/* Like Wolt's venue picker: Kunder / <this one ⌄> - jump straight to another. */}
        <nav className="flex items-center gap-1 text-sm text-slate-400">
          <Link href="/arpo/kunder" className="rounded-lg px-2 py-1 font-medium text-slate-600 hover:bg-slate-100">
            Kunder
          </Link>
          <span>/</span>
          <CustomerPicker customers={picker} current={picker.find((c) => c.id === deal.id) ?? null} />
        </nav>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Thumb src={picker.find((c) => c.id === deal.id)?.thumb ?? null} name={name} size="lg" />
            <div className="min-w-0">
            <h1 className="text-[26px] font-semibold tracking-tight text-slate-900">{name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {deal.stage === "LIVE" ? `Live siden ${d(deal.liveAt)}` : deal.churnedAt ? `Stoppet ${d(deal.churnedAt)}` : "Ikke live endnu"}
              {deal.cvrNumber ? ` · CVR ${deal.cvrNumber}` : ""}
              {deal.parent ? (
                <>
                  {" · Afdeling af "}
                  <Link href={`/arpo/kunder/${deal.parent.id}`} className="text-[#0071e3]">
                    {dealName(deal.parent)}
                  </Link>
                </>
              ) : null}
            </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <a href={`/kunde?som=${deal.id}`} target="_blank" rel="noopener" className="rounded-lg bg-[#0071e3] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#0077ed]">
                Se kundesiden som kunde ↗
              </a>
            )}
            <Link href={`/arpo/deals/${deal.id}`} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Åbn dealen
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Besøg på tours, 30 dage" value={num(visits30)} sub={leads30 ? `${num(leads30)} handlede (booking, opkald …)` : tours.length ? "" : "Ingen tours"} />
        {billing && (
          <>
            <Tile label="Udestående" value={formatDKK(sum(open))} sub={overdue.length ? `${overdue.length} forfalden${overdue.length > 1 ? "e" : ""}` : open.length ? "Ikke forfaldent" : "Alt er betalt"} tone={overdue.length ? "warn" : undefined} money />
            <Tile label="Betalt i alt" value={formatDKK(sum(paid))} sub={next ? `Næste faktura ${d(next.scheduledDate)}` : ""} money />
          </>
        )}
        <Tile label="Kundesiden" value={deal.customerAccounts.length ? `${deal.customerAccounts.length} login${deal.customerAccounts.length > 1 ? "s" : ""}` : "Ingen adgang"} sub={lastLogin ? `Sidst logget ind ${d(lastLogin)}` : deal.customerAccounts.length ? "Har ikke logget ind endnu" : ""} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.25fr]">
        <div className="space-y-6">
          <Card title="Kunden">
            <Rows
              rows={[
                ["Kontaktperson", deal.contactName],
                ["E-mail", deal.contactEmail ? <a href={`mailto:${deal.contactEmail}`} className="text-[#0071e3]">{deal.contactEmail}</a> : null],
                ["Telefon", deal.contactPhone ? <a href={`tel:${deal.contactPhone.replace(/\s/g, "")}`} className="text-[#0071e3]">{deal.contactPhone}</a> : null],
                ["Faktura-e-mail", deal.invoiceEmail],
                ["Adresse", deal.address],
                ["Hjemmeside", deal.websiteUrl ? <a href={/^https?:/.test(deal.websiteUrl) ? deal.websiteUrl : `https://${deal.websiteUrl}`} target="_blank" rel="noopener" className="text-[#0071e3]">{deal.websiteUrl.replace(/^https?:\/\//, "")}</a> : null],
                ["Sælger", deal.owner.name],
                ["Afdelinger", deal.branches.length ? deal.branches.map((b, i) => <span key={b.id}>{i ? ", " : ""}<Link href={`/arpo/kunder/${b.id}`} className="text-[#0071e3]">{dealName(b)}</Link></span>) : null],
              ]}
            />
          </Card>

          <Card title="Aftale og betaling">
            <Rows
              rows={[
                ["Produkt", deal.soldProduct],
                ["Månedspris", billing && deal.saleAmount != null ? <span className="money">{formatDKK(deal.saleAmount)}</span> : null],
                ["Etablering", billing && deal.establishmentFee != null ? <span className="money">{formatDKK(deal.establishmentFee)}</span> : null],
                ["Binding", deal.bindingMonths ? `${deal.bindingMonths} måneder` : null],
                ["Underskrevet", deal.contractSignedAt ? d(deal.contractSignedAt) : null],
                ["Fakturering fra", deal.billingStartDate ? d(deal.billingStartDate) : null],
                ["Ophører", deal.contractEndDate ? d(deal.contractEndDate) : null],
                ["Betaling", deal.paymentMethod === "BETALINGSSERVICE" ? `Betalingsservice${deal.bsMandateStatus === "ACTIVE" ? " · tilmeldt" : deal.bsMandateStatus === "CANCELLED" ? " · afmeldt" : " · ikke tilmeldt endnu"}` : "Faktura"],
                // Only contracts signed through DocuSeal can be fetched - older ones came from the previous system and aren't in Arpo.
                ["Kontrakt", deal.contractSignedAt ? (deal.docusealSubmissionId && isAdmin ? <a href={`/kunde/kontrakt/${deal.id}`} target="_blank" rel="noopener" className="text-[#0071e3]">Hent PDF ↗</a> : deal.docusealSubmissionId ? "Underskrevet i DocuSeal" : <span className="text-slate-500">Fra det gamle system - ikke i Arpo</span>) : null],
              ]}
            />
          </Card>

          {isAdmin && (
            <CustomerAccessSection
              dealId={deal.id}
              accounts={deal.customerAccounts.map((c) => ({ ...c.account, role: c.role, canApprove: c.canApprove, expiresAt: c.expiresAt, byCustomer: Boolean(c.invitedById) }))}
              mayInvite={deal.customersMayInvite}
              defaultEmail={deal.contactEmail}
              defaultName={deal.contactName}
              branchCount={deal.branches.length}
            />
          )}
          {deal.customerAccounts.length > 0 && (
            <Card title="Login-historik">
              <ul className="divide-y divide-slate-100">
                {deal.customerAccounts.map(({ account: a }) => (
                  <li key={a.id} className="py-2.5 text-sm">
                    <p className="font-medium text-slate-900">{a.name ? `${a.name} · ` : ""}{a.email}</p>
                    <p className="text-xs text-slate-500">
                      Adgang siden {d(a.createdAt)}
                      {a.invitedByName ? ` (givet af ${a.invitedByName})` : ""} · {a._count.logins ? `logget ind ${a._count.logins} ${a._count.logins === 1 ? "gang" : "gange"}, sidst ${d(a.lastLoginAt)}` : "har ikke logget ind endnu"}
                      {a.lastSeenAt ? ` · sidst set ${dt(a.lastSeenAt)}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Tours">
            {tours.length === 0 ? (
              <p className="text-sm text-slate-400">Ingen tours i Arpo for kunden endnu.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {tours.map((t, i) => {
                  const s = stats[i];
                  return (
                    <li key={t.slug} className="py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">{t.name}</p>
                          <p className="text-xs text-slate-500">
                            {t.liveVersion != null ? `Live på tour.nextview360.dk · version ${t.liveVersion}` : t.published ? "Udgivet i Arpo - ikke live endnu" : "Ikke udgivet"}
                          </p>
                        </div>
                        <div className="flex gap-3 text-xs font-medium">
                          {(t.published || t.liveVersion != null) && (
                            <a href={t.liveVersion != null ? `${CLOUDFLARE_TOUR_ORIGIN}/${t.slug}` : `/t/${t.slug}`} target="_blank" rel="noopener" className="text-[#0071e3]">
                              Åbn ↗
                            </a>
                          )}
                          {isAdmin && (
                            <Link href={`/arpo/tour-lab/${t.slug}/rediger`} className="text-[#0071e3]">
                              Rediger
                            </Link>
                          )}
                        </div>
                      </div>
                      {s && (
                        <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                          {[
                            [num(s.visits), "besøg, 30 d."],
                            [num(s.leads), "handlede"],
                            [s.medianSeconds ? `${Math.round(s.medianSeconds / 60)} min` : "–", "typisk besøg"],
                            [`${Math.round(s.mobileShare * 100)} %`, "på mobil"],
                          ].map(([v, l]) => (
                            <div key={l} className="rounded-lg bg-slate-50 py-2">
                              <p className="text-[15px] font-semibold tabular-nums text-slate-900">{v}</p>
                              <p className="text-[10px] uppercase tracking-wide text-slate-400">{l}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {billing && (
          <Card title="Fakturaer">
            {invoices.length === 0 ? (
              <p className="text-sm text-slate-400">Ingen fakturaer endnu.</p>
            ) : (
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[440px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="px-1 pb-2 font-semibold">Periode</th>
                      <th className="px-1 pb-2 font-semibold">Nr.</th>
                      <th className="px-1 pb-2 text-right font-semibold">Beløb</th>
                      <th className="px-1 pb-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoices.slice(0, 24).map((i) => {
                      const late = !i.paidAt && i.dueDate && i.dueDate < new Date() && (i.sentAt || i.status === "SENT_MANUALLY");
                      const [label, cls] = i.paidAt
                        ? [`Betalt ${d(i.paidAt)}`, "bg-[#34c759]/12 text-[#1d7a33]"]
                        : late
                          ? [`Forfalden ${d(i.dueDate)}`, "bg-[#ff3b30]/10 text-[#c4271d]"]
                          : i.sentAt || i.status === "SENT_MANUALLY"
                            ? [i.collectViaBs ? `Trækkes ${d(i.dueDate)}` : `Sendt ${d(i.sentAt)}`, "bg-[#0071e3]/10 text-[#0058b0]"]
                            : i.status === "IMPORTED"
                              ? ["Fra før Arpo", "bg-slate-100 text-slate-500"]
                              : i.status === "FAILED"
                                ? ["Fejlede", "bg-[#ff3b30]/10 text-[#c4271d]"]
                                : i.status === "DRAFT_CREATED"
                                  ? ["Kladde i Dinero", "bg-slate-100 text-slate-600"]
                                  : [`Planlagt ${d(i.scheduledDate)}`, "bg-slate-100 text-slate-500"];
                      return (
                        <tr key={i.id}>
                          <td className="px-1 py-2 text-slate-700">{i.quarterIndex === 0 ? "Etablering" : invoiceQuarterShortLabel(i.scheduledDate)}</td>
                          <td className="px-1 py-2 text-slate-500">{i.dineroInvoiceNumber ?? "–"}</td>
                          <td className="money px-1 py-2 text-right tabular-nums text-slate-900">{formatDKK(i.amount)}</td>
                          <td className="px-1 py-2">
                            <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {invoices.length > 24 && <p className="mt-2 text-xs text-slate-400">Viser de seneste 24 af {invoices.length} - resten står på dealen.</p>}
              </div>
            )}
          </Card>
          )}

          <Card title="Mails og hændelser">
            {events.length === 0 ? (
              <p className="text-sm text-slate-400">Intet endnu.</p>
            ) : (
              <>
                <Timeline events={events.slice(0, 40)} />
                {events.length > 40 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs font-medium text-[#0071e3]">Vis {events.length - 40} ældre</summary>
                    <Timeline events={events.slice(40)} />
                  </details>
                )}
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, sub, tone, money }: { label: string; value: string; sub?: string; tone?: "warn"; money?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone === "warn" ? "text-[#c4271d]" : "text-slate-900"} ${money ? "money" : ""}`}>{value}</p>
      {sub && <p className={`mt-0.5 text-xs ${tone === "warn" ? "text-[#c4271d]" : "text-slate-500"}`}>{sub}</p>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      {rows
        .filter(([, v]) => v != null && v !== "")
        .map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-slate-500">{k}</dt>
            <dd className="min-w-0 break-words text-slate-900">{v}</dd>
          </div>
        ))}
    </dl>
  );
}

function Timeline({ events }: { events: Event[] }) {
  return (
    <ol className="relative mt-1 space-y-3 border-l border-slate-200 pl-4">
      {events.map((e, i) => (
        <li key={i} className="relative">
          <span className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${TONE[e.tone]}`} />
          <p className="text-sm text-slate-900">{e.title}</p>
          <p className="text-xs text-slate-500">
            {dt(e.at)}
            {e.detail ? ` · ${e.detail}` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}
