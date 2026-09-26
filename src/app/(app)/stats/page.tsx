import { prisma } from "@/lib/db";
import { isIntegrationEnabled } from "@/lib/integration-settings";
import { dealName } from "@/lib/labels";
import { IntegrationToggle } from "../settings/integration-toggle";
import { StatsCustomerRow } from "./stats-customer-row";

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
  const autoRunEnabled = await isIntegrationEnabled("CUSTOMER_REPORTS_AUTO_RUN");

  const deals = (
    await prisma.deal.findMany({
      where: { stage: { in: ["FILMED", "LIVE"] }, churnedAt: null },
      include: { reports: { orderBy: { sentAt: "desc" }, take: 10 } },
    })
  ).sort((a, b) => dealName(a).localeCompare(dealName(b), "da"));

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
        <div className="mt-3 overflow-hidden rounded-md border border-slate-100">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Kunde</th>
                  <th className="px-3 py-2 font-medium">MP-Skin nummer</th>
                  <th className="px-3 py-2 font-medium">CC</th>
                  <th className="px-3 py-2 font-medium">Interval</th>
                  <th className="px-3 py-2 font-medium">Sprog</th>
                  <th className="px-3 py-2 font-medium">Næste afsendelse</th>
                  <th className="px-3 py-2 font-medium">Sidst sendt</th>
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {deals.map((deal) => (
                  <StatsCustomerRow
                    key={deal.id}
                    dealId={deal.id}
                    name={deal.displayName || deal.companyName}
                    mpSkinId={deal.mpSkinId}
                    reportCcEmails={deal.reportCcEmails}
                    reportInterval={deal.reportInterval}
                    reportLanguage={deal.reportLanguage}
                    nextReportDueAt={deal.nextReportDueAt ? deal.nextReportDueAt.toISOString() : null}
                    lastSentAt={deal.reports[0] ? deal.reports[0].sentAt.toISOString() : null}
                    lastSentMethod={deal.reports[0]?.method ?? null}
                    lastStatus={deal.reports[0]?.status ?? null}
                    lastErrorMessage={deal.reports[0]?.errorMessage ?? null}
                    history={deal.reports.map((r) => ({
                      sentAt: r.sentAt.toISOString(),
                      method: r.method,
                      status: r.status,
                    }))}
                  />
                ))}
                {deals.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                      Ingen live kunder endnu.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
