import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { createUser, updateUser } from "@/lib/actions/users";
import { commissionFrequencyLabels } from "@/lib/labels";
import { AvatarUploader } from "../avatar-uploader";
import { RequireGoogleLoginToggle } from "./require-google-login-toggle";
import { isGoogleLoginRequired, googleLoginRedirectUri } from "@/lib/google-login";
import { getAppBaseUrl } from "@/lib/email-oauth";
import { formatDate } from "@/lib/labels";

export default async function UsersPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/api/auth/session-ended");
  if (currentUser.role !== "ADMIN") redirect("/arpo");

  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  const googleRequired = await isGoogleLoginRequired();
  const notYetGoogle = users.filter((u) => !u.lastGoogleLoginAt);
  // Secrets whose absence leaves a door open (the routes they guard accept
  // anyone without them) - checked here since they live in Vercel, not Arpo.
  const securityChecks = [
    {
      ok: Boolean(process.env.CRON_SECRET),
      label: "CRON_SECRET er sat",
      fix: "Uden den kan alle udefra starte de automatiske kørsler (fakturaer, Betalingsservice, rapporter). Sæt en lang tilfældig værdi i Vercel.",
    },
    {
      ok: !process.env.DOCUSEAL_API_KEY || Boolean(process.env.DOCUSEAL_WEBHOOK_SECRET),
      label: "DOCUSEAL_WEBHOOK_SECRET er sat",
      fix: "Uden den kan alle udefra melde en kontrakt underskrevet. Kopiér HMAC-nøglen fra DocuSeal → Webhooks til Vercel.",
    },
    {
      ok: (process.env.AUTH_SECRET?.length ?? 0) >= 32,
      label: "AUTH_SECRET er lang nok (mindst 32 tegn)",
      fix: "Den signerer login-sessioner - lav en ny med `openssl rand -base64 32` i Vercel (alle bliver logget ud).",
    },
    {
      ok: googleRequired,
      label: "Kræv Google-login er slået til",
      fix: "Adgangskoder virker stadig - slå det til nedenfor, når alle har logget ind med Google.",
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Brugere</h1>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Sikkerhedstjek</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {securityChecks.map((c) => (
            <li key={c.label} className="flex items-start gap-2">
              <span className={c.ok ? "text-emerald-600" : "text-red-600"}>{c.ok ? "✓" : "✗"}</span>
              <span className={c.ok ? "text-slate-700" : "text-slate-900"}>
                {c.label}
                {!c.ok && <span className="block text-xs text-red-600">{c.fix}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Login med Google</h2>
        <p className="mt-1 text-xs text-slate-500">
          Alle kan logge ind med deres Google-arbejdskonto (samme e-mail som her). Med &quot;Kræv Google-login&quot;
          virker adgangskoder ikke længere - så gælder Googles egen sikkerhed (2-trinsbekræftelse) for Arpo.
        </p>
        <div className="mt-3">
          <RequireGoogleLoginToggle enabled={googleRequired} />
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {notYetGoogle.length === 0
            ? "Alle brugere har logget ind med Google mindst én gang."
            : `Har endnu ikke logget ind med Google: ${notYetGoogle.map((u) => u.name).join(", ")}.`}
          {currentUser.lastGoogleLoginAt && ` Du loggede sidst ind med Google ${formatDate(currentUser.lastGoogleLoginAt)}.`}
        </p>
        <p className="mt-2 text-[11px] text-slate-400">
          Google Cloud → OAuth-klienten → Authorized redirect URIs skal indeholde{" "}
          <span className="font-mono">{googleLoginRedirectUri(getAppBaseUrl())}</span>
        </p>
      </section>

      <div className="space-y-4">
        {users.map((u) => {
          const updateUserWithId = updateUser.bind(null, u.id);
          return (
            <div key={u.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <AvatarUploader currentAvatarUrl={u.avatarUrl} targetUserId={u.id} size={48} />
              <form action={updateUserWithId} className="mt-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="col-span-2">
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Navn</label>
                    <input name="name" defaultValue={u.name} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                    <p className="mt-1 text-xs text-slate-400">{u.email}</p>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Rolle</label>
                    <select name="role" defaultValue={u.role} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                      <option value="SALES">Sælger</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </div>
                  <div className="flex items-end gap-2">
                    <input type="checkbox" name="isCommissionBased" id={`comm-${u.id}`} defaultChecked={u.isCommissionBased} />
                    <label htmlFor={`comm-${u.id}`} className="text-xs font-medium text-slate-600">
                      Provisionslønnet
                    </label>
                  </div>
                  <div className="flex items-end gap-2">
                    <input type="checkbox" name="canAccessBilling" id={`billing-${u.id}`} defaultChecked={u.canAccessBilling} />
                    <label htmlFor={`billing-${u.id}`} className="text-xs font-medium text-slate-600">
                      Kan se Stats/Faktura
                    </label>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Provisionssats (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      name="commissionRate"
                      defaultValue={u.commissionRate}
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Udbetalingsfrekvens</label>
                    <select
                      name="payoutFrequency"
                      defaultValue={u.payoutFrequency}
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    >
                      {Object.entries(commissionFrequencyLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ny adgangskode</label>
                    <input
                      type="password"
                      name="newPassword"
                      placeholder="Lad stå tom for at beholde"
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2">
                  <input type="checkbox" name="recalcExisting" id={`recalc-${u.id}`} />
                  <label htmlFor={`recalc-${u.id}`} className="text-xs text-amber-800">
                    Genberegn også provisionen på {u.name}s eksisterende deals med de nye indstillinger (ellers
                    påvirker ændringen kun deals fremover)
                  </label>
                </div>
                <button
                  type="submit"
                  className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                >
                  Gem
                </button>
              </form>
            </div>
          );
        })}
      </div>

      <section className="rounded-lg border border-dashed border-slate-300 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Opret ny bruger</h2>
        <form action={createUser} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <input name="name" placeholder="Navn" required className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <input name="email" type="email" placeholder="E-mail" required className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <input name="password" type="password" placeholder="Adgangskode" required className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <select name="role" defaultValue="SALES" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="SALES">Sælger</option>
            <option value="ADMIN">Admin</option>
          </select>
          <div className="flex items-center gap-2">
            <input type="checkbox" name="isCommissionBased" id="new-comm" defaultChecked />
            <label htmlFor="new-comm" className="text-xs font-medium text-slate-600">
              Provisionslønnet
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" name="canAccessBilling" id="new-billing" defaultChecked />
            <label htmlFor="new-billing" className="text-xs font-medium text-slate-600">
              Kan se Stats/Faktura
            </label>
          </div>
          <input
            type="number"
            step="0.1"
            name="commissionRate"
            placeholder="Provisionssats %"
            defaultValue={10}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <select name="payoutFrequency" defaultValue="MONTHLY" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            {Object.entries(commissionFrequencyLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="col-span-2 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 sm:col-span-4"
          >
            Opret bruger
          </button>
        </form>
      </section>
    </div>
  );
}
