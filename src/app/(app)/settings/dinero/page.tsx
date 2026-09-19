import { prisma } from "@/lib/db";
import { isDineroConfigured } from "@/lib/dinero";
import { isIntegrationEnabled, isDineroTestMode } from "@/lib/integration-settings";
import { formatDKK, formatDate, invoiceStatusLabels, dealName } from "@/lib/labels";
import { RunNowButton } from "./run-now-button";
import { ClearInvoicesButton } from "./clear-invoices-button";
import { RetryInvoiceButton } from "./retry-invoice-button";
import { DeleteInvoiceButton } from "@/components/delete-invoice-button";
import { IntegrationToggle } from "../integration-toggle";
import Link from "next/link";

const hasCredentials = Boolean(
  process.env.DINERO_CLIENT_ID &&
    process.env.DINERO_CLIENT_SECRET &&
    process.env.DINERO_API_KEY &&
    process.env.DINERO_ORGANIZATION_ID &&
    process.env.DINERO_SALES_ACCOUNT_NUMBER
);

export default async function DineroSettingsPage() {
  const [configured, enabled, testMode] = await Promise.all([
    isDineroConfigured(),
    isIntegrationEnabled("DINERO"),
    isDineroTestMode(),
  ]);

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
            <li>
              DINERO_SALES_ACCOUNT_NUMBER – salgskontoen fra jeres kontoplan (Dinero → Regnskab → Kontoplan) som
              fakturalinjerne skal bogføres på, fx "1000"
            </li>
            <li>CRON_SECRET – en tilfældig streng, bruges til at sikre den daglige automatiske kørsel</li>
          </ul>
        </div>

        <div className="mt-4">
          <RunNowButton />
          <p className="mt-1 text-xs text-slate-400">
            Kører normalt automatisk hver dag - opretter kladder for kvartaler der er forfaldet, og tjekker samtidig
            om afsendte kladder er blevet betalt i Dinero. Brug knappen til at teste med det samme.
          </p>
        </div>
      </section>

      <section className={`rounded-xl border p-6 shadow-sm ${testMode ? "border-amber-300 bg-amber-50/40" : "border-slate-200 bg-white"}`}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Testtilstand</h2>
          <IntegrationToggle integrationKey="DINERO_TEST_MODE" enabled={testMode} />
        </div>
        <p className={`mt-2 text-sm ${testMode ? "text-amber-700" : "text-slate-500"}`}>
          {testMode
            ? "Slået til — der oprettes ALDRIG rigtige kladder i Dinero lige nu. Kladder herunder med et \"TEST\"-mærke er kun gemt i CRM'et."
            : "Slået fra — kladder oprettes normalt i det rigtige Dinero-regnskab."}
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Brug denne mens I tester fakturaberegningen (fx med "Kør nu" ovenfor), så I kan se hvilke kladder der ville
          blive oprettet, uden at røre det rigtige regnskab eller oprette rigtige kontakter/fakturaer i Dinero.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Seneste kladder</h2>
        <div className="mt-3 overflow-hidden rounded-md border border-slate-100">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Deal</th>
                <th className="px-3 py-2 font-medium">Kvartal</th>
                <th className="px-3 py-2 font-medium">Beløb</th>
                <th className="px-3 py-2 font-medium">Dato</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium"></th>
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
                          : inv.status === "SENT_MANUALLY"
                          ? "rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700"
                          : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                      }
                      title={inv.failureReason ?? undefined}
                    >
                      {invoiceStatusLabels[inv.status]}
                    </span>
                    {inv.dineroInvoiceNumber?.startsWith("TEST-") && (
                      <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                        TEST
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {(inv.status === "FAILED" || inv.status === "PENDING") && <RetryInvoiceButton invoiceId={inv.id} />}
                      <DeleteInvoiceButton invoiceId={inv.id} />
                    </div>
                  </td>
                </tr>
              ))}
              {recentInvoices.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                    Ingen kladder oprettet endnu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-red-200 bg-red-50/40 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-red-900">Nulstil fakturering</h2>
        <p className="mt-1 text-sm text-red-800/80">
          Sletter alle fakturaer fra alle deals (inkl. importerede/historiske), så fakturering kun tæller fra nu og
          fremad, mens funktionen stadig færdiggøres. Kan ikke fortrydes.
        </p>
        <div className="mt-3">
          <ClearInvoicesButton />
        </div>
      </section>
    </div>
  );
}
