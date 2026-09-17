import { isDocuSealConfigured } from "@/lib/docuseal";
import { isIntegrationEnabled } from "@/lib/integration-settings";
import { IntegrationToggle } from "../integration-toggle";

const hasCredentials = Boolean(process.env.DOCUSEAL_API_KEY);

export default async function DocuSealSettingsPage() {
  const [configured, enabled] = await Promise.all([isDocuSealConfigured(), isIntegrationEnabled("DOCUSEAL")]);
  const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:3000";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Kontrakter</h1>
        <p className="mt-1 text-sm text-slate-500">
          Kontrakter genereres direkte i vores eget system ud fra kontrakt-skabelonen og vælges kun med de
          produkter, dealen faktisk har — herefter sendes den færdige kontrakt til DocuSeal til underskrift.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Status</h2>
          <IntegrationToggle integrationKey="DOCUSEAL" enabled={enabled} disabled={!hasCredentials} />
        </div>
        <p className={`mt-2 text-sm ${configured ? "text-emerald-700" : "text-amber-600"}`}>
          {!hasCredentials
            ? "DocuSeal er endnu ikke konfigureret (mangler API-nøgle)."
            : enabled
            ? "DocuSeal er konfigureret og slået til."
            : "DocuSeal er konfigureret, men slået fra — kontrakter kan ikke sendes."}
        </p>

        <div className="mt-4 space-y-3 text-sm text-slate-600">
          <p>Tilføj følgende miljøvariabler på serveren (i .env) og genstart:</p>
          <ul className="list-inside list-disc space-y-1 font-mono text-xs">
            <li>DOCUSEAL_API_KEY – fra DocuSeal → Console → API</li>
            <li>DOCUSEAL_WEBHOOK_SECRET – fra webhookens HMAC-fane (se herunder)</li>
          </ul>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Webhook (automatisk statusopdatering)</h2>
        <p className="mt-2 text-sm text-slate-600">
          DocuSeal har ingen API til at oprette et webhook, så det skal sættes op manuelt: åbn DocuSeal →
          Console → Webhooks → New Webhook, og indsæt denne URL:
        </p>
        <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
          {appBaseUrl}/api/integrations/docuseal/webhook
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Vælg begivenhederne <span className="font-mono">form.viewed</span>,{" "}
          <span className="font-mono">form.completed</span> og <span className="font-mono">form.declined</span>.
          Kopiér derefter signeringsnøglen fra webhookens HMAC-fane (starter med{" "}
          <span className="font-mono">whsec_</span>) ind som <span className="font-mono">DOCUSEAL_WEBHOOK_SECRET</span>.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Når kontrakten underskrives, sættes dealens &quot;solgt dato&quot; automatisk, provisionen beregnes med
          det samme, og sælgeren + alle admins får en e-mail.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Kontrakt-skabelon</h2>
        <p className="mt-2 text-sm text-slate-600">
          Skabelonen (Nextview360 abonnementsaftale) ligger i selve systemet og indeholder felter for kunde,
          sælger og de 4 produkter (Nextview360 Tour, Hjemmeside, Drone-optagelse, Visitkort) — kun de produkter,
          der er valgt på dealen, tages med i den færdige kontrakt. Kontakt os hvis skabelonens indhold skal
          ændres.
        </p>
      </section>
    </div>
  );
}
