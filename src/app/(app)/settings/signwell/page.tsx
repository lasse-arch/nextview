import { isSignWellConfigured } from "@/lib/signwell";
import { isIntegrationEnabled } from "@/lib/integration-settings";
import { IntegrationToggle } from "../integration-toggle";
import { RegisterWebhookButton } from "./register-webhook-button";

const hasCredentials = Boolean(process.env.SIGNWELL_API_KEY);

export default async function SignWellSettingsPage() {
  const [configured, enabled] = await Promise.all([isSignWellConfigured(), isIntegrationEnabled("SIGNWELL")]);
  const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:3000";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Kontrakter</h1>
        <p className="mt-1 text-sm text-slate-500">
          Kontrakter genereres direkte i vores eget system ud fra kontrakt-skabelonen og vælges kun med de
          produkter, dealen faktisk har — herefter sendes den færdige kontrakt til SignWell til underskrift.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Status</h2>
          <IntegrationToggle integrationKey="SIGNWELL" enabled={enabled} disabled={!hasCredentials} />
        </div>
        <p className={`mt-2 text-sm ${configured ? "text-emerald-700" : "text-amber-600"}`}>
          {!hasCredentials
            ? "SignWell er endnu ikke konfigureret (mangler API-nøgle)."
            : enabled
            ? "SignWell er konfigureret og slået til."
            : "SignWell er konfigureret, men slået fra — kontrakter kan ikke sendes."}
        </p>

        <div className="mt-4 space-y-3 text-sm text-slate-600">
          <p>Tilføj følgende miljøvariabler på serveren (i .env) og genstart:</p>
          <ul className="list-inside list-disc space-y-1 font-mono text-xs">
            <li>SIGNWELL_API_KEY – fra SignWell → Settings → API</li>
            <li>SIGNWELL_WEBHOOK_ID – oprettes med knappen herunder</li>
            <li>SIGNWELL_TEST_MODE – sæt til &quot;true&quot; mens I tester (sendes ikke rigtigt, tæller ikke mod kvote)</li>
          </ul>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Webhook (automatisk statusopdatering)</h2>
        <p className="mt-2 text-sm text-slate-600">
          Registrerer et webhook hos SignWell, der peger på:
        </p>
        <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
          {appBaseUrl}/api/integrations/signwell/webhook
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Når kontrakten underskrives, sættes dealens &quot;solgt dato&quot; automatisk, provisionen beregnes med
          det samme, og sælgeren + alle admins får en e-mail.
        </p>
        <div className="mt-4">
          <RegisterWebhookButton />
        </div>
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
