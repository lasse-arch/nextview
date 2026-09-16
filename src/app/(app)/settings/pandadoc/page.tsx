import { isPandaDocConfigured } from "@/lib/pandadoc";
import { isIntegrationEnabled } from "@/lib/integration-settings";
import { IntegrationToggle } from "../integration-toggle";

const hasCredentials = Boolean(process.env.PANDADOC_API_KEY && process.env.PANDADOC_TEMPLATE_ID);

export default async function PandaDocSettingsPage() {
  const [configured, enabled] = await Promise.all([isPandaDocConfigured(), isIntegrationEnabled("PANDADOC")]);
  const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:3000";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Kontrakter (PandaDoc)</h1>
        <p className="mt-1 text-sm text-slate-500">
          Send kontrakter direkte fra en deal, udfyldt automatisk med deal-oplysninger, og få dealen opdateret
          automatisk når kunden underskriver.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Status</h2>
          <IntegrationToggle integrationKey="PANDADOC" enabled={enabled} disabled={!hasCredentials} />
        </div>
        <p className={`mt-2 text-sm ${configured ? "text-emerald-700" : "text-amber-600"}`}>
          {!hasCredentials
            ? "PandaDoc er endnu ikke konfigureret (mangler API-nøgler)."
            : enabled
            ? "PandaDoc er konfigureret og slået til."
            : "PandaDoc er konfigureret, men slået fra — kontrakter kan ikke sendes."}
        </p>

        <div className="mt-4 space-y-3 text-sm text-slate-600">
          <p>Tilføj følgende miljøvariabler på serveren (i .env) og genstart:</p>
          <ul className="list-inside list-disc space-y-1 font-mono text-xs">
            <li>PANDADOC_API_KEY – fra PandaDoc → Settings → API &amp; Integrations → API Keys</li>
            <li>PANDADOC_TEMPLATE_ID – UUID'et for jeres kontrakt-skabelon</li>
            <li>PANDADOC_CLIENT_ROLE – skal matche modtager-rollen i skabelonen (default: Client)</li>
            <li>PANDADOC_WEBHOOK_SHARED_KEY – den delte nøgle I sætter op i webhook'en herunder</li>
          </ul>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Webhook (automatisk statusopdatering)</h2>
        <p className="mt-2 text-sm text-slate-600">
          Opret et webhook i PandaDoc under Settings → API &amp; Integrations → Webhooks, der peger på:
        </p>
        <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
          {appBaseUrl}/api/integrations/pandadoc/webhook
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Vælg events: <span className="font-medium">document_state_changed</span> (sendt, åbnet, underskrevet,
          afvist, annulleret). Når kontrakten underskrives, sættes dealens "solgt dato" automatisk, provisionen
          beregnes med det samme, og sælgeren + alle admins får en e-mail.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Skabelon-tokens</h2>
        <p className="mt-2 text-sm text-slate-600">
          Jeres PandaDoc-skabelon skal bruge disse token-navne (Content Library → skabelon → Tokens), så
          deal-data udfyldes automatisk. Kontakt os hvis I vil bruge andre navne.
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1 font-mono text-xs text-slate-600">
          <li>Client.Company, Client.Name, Client.Email</li>
          <li>Deal.Product, Deal.BindingMonths, Deal.Price</li>
          <li>Seller.Name, Seller.Email</li>
        </ul>
      </section>
    </div>
  );
}
