import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { disconnectEmailAccount } from "@/lib/actions/email";
import { isGoogleConfigured, isMicrosoftConfigured } from "@/lib/email-oauth";
import { formatDate } from "@/lib/labels";

const errorMessages: Record<string, string> = {
  google_not_configured: "Google-integration er ikke konfigureret endnu (mangler GOOGLE_CLIENT_ID/SECRET).",
  microsoft_not_configured: "Outlook-integration er ikke konfigureret endnu (mangler MICROSOFT_CLIENT_ID/SECRET).",
  google_denied: "Google-godkendelse blev afbrudt eller afvist.",
  microsoft_denied: "Microsoft-godkendelse blev afbrudt eller afvist.",
  google_failed: "Der opstod en fejl under forbindelse til Google.",
  microsoft_failed: "Der opstod en fejl under forbindelse til Microsoft.",
};

export default async function EmailSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { connected, error } = await searchParams;
  const user = await getCurrentUser();
  if (!user) return null;

  const accounts = await prisma.emailAccount.findMany({ where: { userId: user.id } });
  const google = accounts.find((a) => a.provider === "GOOGLE");
  const microsoft = accounts.find((a) => a.provider === "MICROSOFT");

  const disconnectGoogle = disconnectEmailAccount.bind(null, "GOOGLE");
  const disconnectMicrosoft = disconnectEmailAccount.bind(null, "MICROSOFT");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">E-mail-integration</h1>
        <p className="mt-1 text-sm text-slate-500">
          Forbind din Gmail eller Outlook-konto, så mails sendt til en deals e-mailadresse automatisk vises på
          dealen for hele teamet.
        </p>
      </div>

      {connected && (
        <div className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {connected === "google" ? "Gmail" : "Outlook"} blev forbundet.
        </div>
      )}
      {error && <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessages[error] ?? error}</div>}

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Gmail + Google Kalender</h2>
            {google ? (
              <p className="mt-1 text-sm text-slate-600">
                Forbundet som <span className="font-medium">{google.email}</span> · siden {formatDate(google.connectedAt)}
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-400">
                Ikke forbundet endnu. Giver både mail-matching og automatisk kalenderinvitation når et møde
                bookes på en deal.
              </p>
            )}
          </div>
          {google ? (
            <form action={disconnectGoogle}>
              <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
                Afbryd
              </button>
            </form>
          ) : (
            <a
              href="/api/integrations/google/authorize"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
            >
              Forbind Gmail
            </a>
          )}
        </div>
        {!isGoogleConfigured() && (
          <p className="mt-3 text-xs text-amber-600">
            Kræver GOOGLE_CLIENT_ID og GOOGLE_CLIENT_SECRET i miljøvariabler (opret i Google Cloud Console →
            OAuth-klient, redirect-URI: <span className="font-mono">{"{APP_BASE_URL}"}/api/integrations/google/callback</span>).
          </p>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Outlook (Microsoft)</h2>
            {microsoft ? (
              <p className="mt-1 text-sm text-slate-600">
                Forbundet som <span className="font-medium">{microsoft.email}</span> · siden{" "}
                {formatDate(microsoft.connectedAt)}
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-400">Ikke forbundet endnu.</p>
            )}
          </div>
          {microsoft ? (
            <form action={disconnectMicrosoft}>
              <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
                Afbryd
              </button>
            </form>
          ) : (
            <a
              href="/api/integrations/microsoft/authorize"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
            >
              Forbind Outlook
            </a>
          )}
        </div>
        {!isMicrosoftConfigured() && (
          <p className="mt-3 text-xs text-amber-600">
            Kræver MICROSOFT_CLIENT_ID og MICROSOFT_CLIENT_SECRET i miljøvariabler (App Registration i Azure Portal,
            redirect-URI: <span className="font-mono">{"{APP_BASE_URL}"}/api/integrations/microsoft/callback</span>).
          </p>
        )}
      </section>

      <p className="text-xs text-slate-400">
        Når I har oprettet OAuth-app'erne, tilføjer I nøglerne i serverens miljøvariabler (.env) og genstarter.
        Selve synkroniseringen af indgående mails (matching på deal-mailadresse) færdiggøres og testes, når
        adgangen er på plads.
      </p>
    </div>
  );
}
