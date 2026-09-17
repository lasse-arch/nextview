import { prisma } from "@/lib/db";
import { isDineroConfigured } from "@/lib/dinero";
import { isIntegrationEnabled } from "@/lib/integration-settings";
import { formatDKK, formatDate, invoiceStatusLabels, dealName } from "@/lib/labels";
import { RunNowButton } from "./run-now-button";
import { IntegrationToggle } from "../integration-toggle";
import Link from "next/link";

const hasCredentials = Boolean(
  process.env.DINERO_CLIENT_ID &&
    process.env.DINERO_CLIENT_SECRET &&
    process.env.DINERO_API_KEY &&
    process.env.DINERO_ORGANIZATION_ID
);

export default async function DineroSettingsPage() {
  const [configured, enabled] = await Promise.all([isDineroConfigured(), isIntegrationEnabled("DINERO")]);

  const recentInvoices = await prisma.invoice.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { deal: true },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Faktura-kladder (Dinero)</h1>
        <p className="mt-1 text-sm text-slate-500">
          Så snart en deal har stadie "Kontrakt underskrevet" eller senere, med udfyldt salgsbeløb og binding,
          opretter systemet automatisk en faktura-kladde i Dinero hvert kvartal gennem bindingsperioden. Beløbet
          fordeles jævnt over antal kvartaler. Kladder sendes aldrig automatisk — I gennemgår og sender dem selv i
          Dinero.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Status</h2>
          <IntegrationToggle integrationKey="DINERO" enabled={enabled} disabled={!hasCredentials} />
        </div>
        <p className={`mt-2 text-sm ${configured ? "text-emerald-700" : "text-amber-600"}`}>
          {!hasCredentials
            ? "Dinero er endnu ikke konfigureret (mangler API-nøgler)."
            : enabled
            ? "Dinero er konfigureret og slået til."
            : "Dinero er konfigureret, men slået fra — ingen kladder oprettes."}
        </p>

        <div className="mt-4 space-y-2 text-sm text-slate-600">
          <p>Tilføj følgende miljøvariabler (i .env) og genstart:</p>
          <ul className="list-inside list-disc space-y-1 font-mono text-xs">
            <li>DINERO_CLIENT_ID / DINERO_CLIENT_SECRET – fra en registreret udvikler-app hos Dinero</li>
            <li>DINERO_API_KEY – jeres organisations API-nøgle (Dinero → Indstillinger → API)</li>
            <li>DINERO_ORGANIZATION_ID – jeres organisations-ID i Dinero</li>
            <li>CRON_SECRET – en tilfældig streng, bruges til at sikre den daglige automatiske kørsel</li>
          </ul>
        </div>

        <div className="mt-4">
          <RunNowButton />
          <p className="mt-1 text-xs text-slate-400">
            Kører normalt automatisk hver dag og opretter kladder for kvartaler der er forfaldet. Brug knappen til at
            teste med det samme.
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Seneste kladder</h2>
        <div className="mt-3 overflow-hidden rounded-md border border-slate-100">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Deal</th>
                <th className="px-3 py-2 font-medium">Kvartal</th>
                <th className="px-3 py-2 font-medium">Beløb</th>
                <th className="px-3 py-2 font-medium">Dato</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentInvoices.map((inv) => (
                <tr key={inv.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <Link href={`/deals/${inv.dealId}`} className="font-medium text-slate-900 hover:underline">
                      {dealName(inv.deal)}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{inv.quarterIndex}</td>
                  <td className="money px-3 py-2 text-slate-600">{formatDKK(inv.amount)}</td>
                  <td className="px-3 py-2 text-slate-600">{formatDate(inv.createdAt)}</td>
                  <td className="px-3 py-2">
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
                  </td>
                </tr>
              ))}
              {recentInvoices.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                    Ingen kladder oprettet endnu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
