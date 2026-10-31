"use client";

import { useState, useTransition } from "react";
import { grantCustomerAccess, resendCustomerLogin, revokeCustomerAccess, setCustomersMayInvite } from "@/lib/actions/customer-access";
import { ROLE_NAMES } from "@/lib/customer-roles";
import type { CustomerRole } from "@prisma/client";
import { useToast } from "@/components/toast";

type Access = { id: string; email: string; name: string | null; lastLoginAt: Date | null; invitedByName: string | null; role: CustomerRole; canApprove: boolean; expiresAt: Date | null; byCustomer: boolean };

const day = (d: Date) => new Date(d).toLocaleDateString("da-DK", { day: "numeric", month: "short" });

const when = (d: Date | null) => (d ? `Sidst logget ind ${new Date(d).toLocaleDateString("da-DK", { day: "numeric", month: "short" })}` : "Har ikke logget ind endnu");

/**
 * "Kundens login": who at the customer can log in on nextview360.dk/login and
 * see their tours, numbers and contract - and the button that gives
 * a new person access (a mail with a login link goes out at once).
 */
export function CustomerAccessSection({
  dealId,
  accounts,
  defaultEmail,
  defaultName,
  branchCount,
  mayInvite,
}: {
  dealId: string;
  accounts: Access[];
  defaultEmail: string | null;
  defaultName: string | null;
  branchCount: number;
  /** Deal.customersMayInvite - the customer's owners may invite their own people on /kunde. */
  mayInvite: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState(accounts.some((a) => a.email === defaultEmail?.toLowerCase()) ? "" : (defaultEmail ?? ""));
  const [name, setName] = useState(email ? (defaultName ?? "") : "");
  const showToast = useToast();

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Kundens login</h2>
        <a href={`/kunde?som=${dealId}`} target="_blank" rel="noopener" className="text-xs font-medium text-[#0071e3] hover:underline">
          Se som kunde ↗
        </a>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Kunden logger ind på nextview360.dk/login med et link på mail og ser sine tours, tal, koder til hjemmesiden og kontrakten. Fakturaer kan de ikke se der - dem får de tilsendt.
        {branchCount > 0 && ` Adgangen gælder også de ${branchCount} afdelinger.`}
      </p>

      <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={mayInvite}
          disabled={pending}
          onChange={(e) =>
            start(async () => {
              const r = await setCustomersMayInvite(dealId, e.target.checked);
              showToast(r.ok ? (e.target.checked ? "Kunden kan nu invitere brugere" : "Kunden kan ikke længere invitere brugere") : r.error);
            })
          }
        />
        Kundens ejere må selv invitere brugere (fx deres udvikler) under Brugere på kundesiden
      </label>

      {accounts.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100 rounded-md border border-slate-100">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-900">{a.name ? `${a.name} · ${a.email}` : a.email}</p>
                <p className="text-xs text-slate-500">
                  {[
                    `${ROLE_NAMES.da[a.role]}${a.role === "STAFF" && a.canApprove ? " (må godkende)" : ""}`,
                    when(a.lastLoginAt),
                    a.expiresAt && (new Date(a.expiresAt) < new Date() ? `Udløbet ${day(a.expiresAt)}` : `Stopper ${day(a.expiresAt)}`),
                    a.byCustomer && a.invitedByName && `Inviteret af ${a.invitedByName} (kunden)`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <button
                type="button"
                disabled={pending}
                className="text-xs font-medium text-slate-600 hover:text-slate-900"
                onClick={() =>
                  start(async () => {
                    const r = await resendCustomerLogin(dealId, a.id);
                    showToast(r.ok ? `Nyt login-link sendt til ${a.email}` : r.error);
                  })
                }
              >
                Send link igen
              </button>
              <button
                type="button"
                disabled={pending}
                className="text-xs font-medium text-red-600 hover:text-red-700"
                onClick={() => {
                  if (!confirm(`Fjern ${a.email}s adgang til kundesiden?`)) return;
                  start(async () => {
                    const r = await revokeCustomerAccess(dealId, a.id);
                    showToast(r.ok ? "Adgangen er fjernet" : r.error);
                  });
                }}
              >
                Fjern
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const r = await grantCustomerAccess(dealId, email, name);
            if (!r.ok) return setError(r.error);
            showToast(`Adgang givet - login-link sendt til ${email}`);
            setEmail("");
            setName("");
          });
        }}
      >
        <div className="min-w-[180px] flex-1">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">E-mail</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div className="min-w-[140px] flex-1">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Navn</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Valgfrit" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <button type="submit" disabled={pending || !email} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
          {pending ? "Sender…" : "Giv adgang og send mail"}
        </button>
        {error && <p className="w-full text-xs text-red-600">{error}</p>}
      </form>
    </section>
  );
}
