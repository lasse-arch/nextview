"use client";

import { useActionState } from "react";
import { acceptInviteAction, type InviteState } from "@/lib/actions/customer-login";

export function InviteForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(acceptInviteAction, undefined);
  if (state?.done)
    return (
      <div className="mt-6 rounded-xl bg-[#f0f8f3] p-4 text-center text-sm text-[#1f6b3a]">
        <b className="block text-[15px]">Tjek din mail</b>
        Vi har sendt dig et link, du logger ind med. Det virker i 7 dage.
      </div>
    );
  return (
    <form action={action} className="mt-6 space-y-3">
      <input type="hidden" name="t" value={token} />
      <label className="block text-sm font-medium text-[#1d1d1f]">
        Navn
        <input name="name" required maxLength={80} autoComplete="name" className="mt-1 w-full rounded-xl border border-black/[.12] px-3 py-2.5 text-[15px]" />
      </label>
      <label className="block text-sm font-medium text-[#1d1d1f]">
        E-mail
        <input name="email" type="email" required maxLength={200} autoComplete="email" className="mt-1 w-full rounded-xl border border-black/[.12] px-3 py-2.5 text-[15px]" />
      </label>
      {state?.error && <p className="text-sm text-[#d70015]">{state.error}</p>}
      <button type="submit" disabled={pending} className="w-full rounded-xl bg-[#0071e3] px-3 py-2.5 text-[15px] font-semibold text-white hover:bg-[#0077ed] disabled:opacity-60">
        {pending ? "Sender …" : "Tilføj mig"}
      </button>
    </form>
  );
}
