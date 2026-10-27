"use client";

import { useActionState } from "react";
import { requestLoginLinkAction, type LinkState } from "@/lib/actions/customer-login";

/** For customers: their e-mail, then a login link arrives by e-mail. */
export function LinkForm() {
  const [state, formAction, pending] = useActionState<LinkState, FormData>(requestLoginLinkAction, undefined);
  if (state?.sent)
    return (
      <div className="mt-5 rounded-xl bg-[#e3f5e8] px-4 py-3 text-sm text-[#1d6b34]">
        <b className="block">Tjek din indbakke</b>
        Er e-mailen registreret hos os, har vi sendt et link. Det virker i 15 minutter. Kom den ikke, så tjek spam, eller skriv til os.
      </div>
    );
  return (
    <form action={formAction} className="mt-5 space-y-3">
      <label htmlFor="kunde-email" className="block text-sm font-medium text-slate-700">
        Din e-mail
      </label>
      <input
        id="kunde-email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="navn@firma.dk"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="w-full rounded-lg bg-[#0071e3] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0077ed] disabled:opacity-50">
        {pending ? "Sender…" : "Send mig et login-link"}
      </button>
    </form>
  );
}
