import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { LinkForm } from "./link-form";
import { isGoogleLoginRequired } from "@/lib/google-login";
import { isGoogleConfigured } from "@/lib/email-oauth";
import { safeNextPath } from "@/lib/auth";

const ERRORS: Record<string, string> = {
  google_unknown_user: "Der er ingen Arpo-bruger med den Google-konto. Brug din arbejdskonto, eller bed en admin oprette dig.",
  google_unverified: "Google-kontoens e-mail er ikke bekræftet.",
  google_cancelled: "Login med Google blev afbrudt.",
  google_state: "Login-forsøget var udløbet - prøv igen.",
  google_failed: "Login med Google fejlede - prøv igen.",
  google_not_configured: "Google-login er ikke sat op.",
  session_ended: "Du er blevet logget ud - log ind igen.",
  link_invalid: "Linket er brugt eller udløbet. Få et nyt herunder.",
};

export const metadata: Metadata = { title: "Log ind - Nextview360" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const nextPath = safeNextPath(next);
  const [googleRequired, googleAvailable] = [await isGoogleLoginRequired(), isGoogleConfigured()];

  const google = googleAvailable && (
    <a
      href={`/api/auth/google/start?next=${encodeURIComponent(nextPath)}`}
      className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
    >
      <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
      Log ind med Google
    </a>
  );

  // One login for everyone: customers get a link by e-mail, the team uses Google (or a password, while that's allowed).
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7] px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-black/[.06]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Nextview360" className="h-8 w-auto" />
        <p className="mt-6 text-2xl font-semibold tracking-tight text-slate-900">Log ind</p>
        {error && ERRORS[error] && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{ERRORS[error]}</p>}

        <p className="mt-5 text-sm font-semibold text-slate-900">Kunde hos Nextview360</p>
        <p className="mt-0.5 text-sm text-slate-500">Skriv din e-mail, så sender vi et link. Ingen adgangskode.</p>
        <LinkForm />

        <div className="mt-8 flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          Medarbejder
          <span className="h-px flex-1 bg-slate-200" />
        </div>
        {google}
        {googleRequired ? (
          <p className="mt-3 text-xs text-slate-500">Log ind med jeres Google-arbejdskonto.</p>
        ) : (
          <details className="mt-3 text-sm" open={!googleAvailable}>
            <summary className="cursor-pointer text-xs text-slate-500">Med adgangskode</summary>
            <LoginForm next={nextPath} />
          </details>
        )}
      </div>
    </div>
  );
}
