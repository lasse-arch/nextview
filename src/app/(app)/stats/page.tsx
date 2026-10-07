import { redirect } from "next/navigation";
import { after } from "next/server";
import { resumeStalledReportQueue, getReportQueueProgress } from "@/lib/customer-report-service";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isIntegrationEnabled } from "@/lib/integration-settings";
import { dealName, formatDate } from "@/lib/labels";
import { IntegrationToggle } from "../settings/integration-toggle";
import { LiveCustomersTable } from "./live-customers-table";

// "Send nu" schedules its actual scraping/PDF/email work via next/server's
// `after()`, which keeps running past this page's own response but is still
// bounded by its maxDuration.
export const maxDuration = 300;

/**
 * Central home for the visitor-stats report feature - deliberately holds
 * almost everything (every live customer's MP-Skin nummer, interval, next/
 * last send) so the deal page itself only needs a couple of quick controls.
 */
export default async function StatsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (!currentUser.canAccessBilling) redirect("/");

  const [autoRunEnabled, queueProgress] = await Promise.all([
    isIntegrationEnabled("CUSTOMER_REPORTS_AUTO_RUN"),
    getReportQueueProgress(),
  ]);
  // Restarts a report queue whose self-chaining got cut off (see
  // resumeStalledReportQueue) - this page polls while reports are pending.
  after(() => resumeStalledReportQueue());

  const deals = (
    await prisma.deal.findMany({
      where: { stage: { in: ["FILMED", "LIVE"] }, churnedAt: null },
      include: {
        reports: { orderBy: { sentAt: "desc" }, take: 10 },
        branches: { select: { id: true, displayName: true, companyName: true, mpSkinId: true } },
        parent: { select: { displayName: true, companyName: true, reportCombineBranches: true } },
      },
    })
  ).sort((a, b) => dealName(a).localeCompare(dealName(b), "da"));

  // Opsagte kunder - a deal stays "LIVE" forever (that's its real pipeline
  // history), but once its termination notice's computed end date has
  // passed, runAutoChurn sets churnedAt and it silently drops out of "Live
  // kunder" above with nowhere else showing it actually left - this gives
  // opsagte kunder their own visible home instead.
  const churnedDeals = (
    await prisma.deal.findMany({
      where: { stage: "LIVE", churnedAt: { not: null } },
      orderBy: { churnedAt: "desc" },
    })
  ).map((deal) => ({
    id: deal.id,
    name: dealName(deal),
    churnedAt: deal.churnedAt!,
    terminationNoticeAt: deal.terminationNoticeAt,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Stats</h1>
        <p className="mt-1 text-sm text-slate-500">
          Besøgsrapporter til kunderne, hentet fra explore.nextview360.dk. Udfyld MP-Skin nummer og interval for at
          slå automatisk afsendelse til for en kunde - "Send nu" virker altid, uanset interval.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Automatisk afsendelse</h2>
          <IntegrationToggle integrationKey="CUSTOMER_REPORTS_AUTO_RUN" enabled={autoRunEnabled} />
        </div>
        <p className={`mt-2 text-sm ${autoRunEnabled ? "text-emerald-700" : "text-amber-600"}`}>
          {autoRunEnabled
            ? "Slået til - kunder med et interval sat får automatisk sendt en rapport, når den forfalder."
            : "Slået fra - ingen rapporter sendes automatisk, uanset interval sat pr. kunde. \"Send nu\" virker stadig."}
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Live kunder</h2>
        <div className="mt-3">
          <LiveCustomersTable
            queueProgress={queueProgress}
            rows={deals.map((deal) => ({
              dealId: deal.id,
              name: deal.displayName || deal.companyName,
              mpSkinId: deal.mpSkinId,
              reportCcEmails: deal.reportCcEmails,
              reportInterval: deal.reportInterval,
              reportLanguage: deal.reportLanguage,
              nextReportDueAt: deal.nextReportDueAt ? deal.nextReportDueAt.toISOString() : null,
              lastSentAt: deal.reports[0] ? deal.reports[0].sentAt.toISOString() : null,
              lastSentMethod: deal.reports[0]?.method ?? null,
              lastStatus: deal.reports[0]?.status ?? null,
              lastErrorMessage: deal.reports[0]?.errorMessage ?? null,
              lastOpenedAt: deal.reports[0]?.openedAt ? deal.reports[0].openedAt.toISOString() : null,
              history: deal.reports.map((r) => ({
                sentAt: r.sentAt.toISOString(),
                method: r.method,
                status: r.status,
                openedAt: r.openedAt ? r.openedAt.toISOString() : null,
              })),
              branches: deal.branches
                .filter((b) => b.mpSkinId)
                .map((b) => ({ id: b.id, name: b.displayName || b.companyName })),
              reportCombineBranches: deal.reportCombineBranches,
              combinedIntoParentName: deal.parent?.reportCombineBranches ? dealName(deal.parent) : null,
            }))}
          />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Opsagte kunder</h2>
        <p className="mt-1 text-xs text-slate-500">
          Kunder hvis opsigelse er trådt i kraft (kontrakten er ophørt) og som derfor ikke længere tæller med under
          Live kunder.
        </p>
        <div className="mt-3 divide-y divide-slate-100">
          {churnedDeals.map((deal) => (
            <div key={deal.id} className="flex items-center justify-between py-2 text-sm">
              <Link href={`/deals/${deal.id}`} className="font-medium text-slate-900 hover:underline">
                {deal.name}
              </Link>
              <span className="text-xs text-slate-500">
                Opsagt {formatDate(deal.churnedAt)}
                {deal.terminationNoticeAt && ` · Varsel givet ${formatDate(deal.terminationNoticeAt)}`}
              </span>
            </div>
          ))}
          {churnedDeals.length === 0 && <p className="py-2 text-sm text-slate-400">Ingen opsagte kunder endnu.</p>}
        </div>
      </section>
    </div>
  );
}
