"use client";

import { useState, useTransition } from "react";
import { createCustomerInviteLink, grantCustomerAccess, shareAccessWithChain, revokeCustomerInviteLink, renameCustomerLogin, resendCustomerLogin, revokeCustomerAccess, setCustomerLoginRole, setCustomersMayInvite } from "@/lib/actions/customer-access";
import { ROLE_NAMES } from "@/lib/customer-roles";
import type { CustomerRole } from "@prisma/client";
import { useToast } from "@/components/toast";

type Access = { id: string; email: string; name: string | null; lastLoginAt: Date | null; invitedByName: string | null; role: CustomerRole; canApprove: boolean; expiresAt: Date | null; byCustomer: boolean };

/** The role choices, as one value: a Medarbejder who may approve is its own choice. */
const CHOICES: [string, string][] = [
  ["OWNER", ROLE_NAMES.da.OWNER],
  ["STAFF", ROLE_NAMES.da.STAFF],
  ["STAFF+", `${ROLE_NAMES.da.STAFF} (må godkende)`],
  ["DEVELOPER", ROLE_NAMES.da.DEVELOPER],
  ["VIEWER", ROLE_NAMES.da.VIEWER],
];
const choiceOf = (role: CustomerRole, canApprove: boolean) => (role === "STAFF" && canApprove ? "STAFF+" : role);
const accessOf = (choice: string) => ({ role: (choice === "STAFF+" ? "STAFF" : choice) as CustomerRole, canApprove: choice === "STAFF+" });

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
  inviteLinks,
  parent,
}: {
  dealId: string;
  accounts: Access[];
  defaultEmail: string | null;
  defaultName: string | null;
  branchCount: number;
  /** Deal.customersMayInvite - the customer's owners may invite their own people on /kunde. */
  mayInvite: boolean;
  /** Invitation links that still work. */
  inviteLinks: InviteLink[];
  /** The chain's main deal, when this deal is one of its locations. */
  parent?: { id: string; name: string } | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /** The login whose name is being changed (in place, the e-mail stays). */
  const [renaming, setRenaming] = useState<string | null>(null);
  const [email, setEmail] = useState(accounts.some((a) => a.email === defaultEmail?.toLowerCase()) ? "" : (defaultEmail ?? ""));
  const [name, setName] = useState(email ? (defaultName ?? "") : "");
  const [choice, setChoice] = useState("OWNER");
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
        {branchCount > 0 && ` Adgangen gælder også de ${branchCount} afdelinger, så de ser alle steder på én kundeside.`}
      </p>
      {parent ? (
        <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
          Dette er en afdeling af <a href={`/arpo/deals/${parent.id}`} className="font-medium underline">{parent.name}</a>. Logins her ser kun denne afdeling. Skal de se alle steder, så giv adgangen på {parent.name}
          {accounts.length > 0 && (
            <>
              {" - eller "}
              <button
                type="button"
                disabled={pending}
                className="font-medium underline"
                onClick={() =>
                  start(async () => {
                    const r = await shareAccessWithChain(dealId);
                    showToast(r.ok ? "De ser nu alle steder i kæden" : r.error);
                  })
                }
              >
                giv dem her adgang til hele kæden
              </button>
            </>
          )}
          .
        </div>
      ) : (
        branchCount === 0 && <p className="mt-1 text-xs text-slate-500">Har kunden flere steder? Kæd dem sammen nedenfor, så får de én kundeside med alle stederne.</p>
      )}

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
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-sm">
              <div className="min-w-0 basis-full">
                {renaming === a.id ? (
                  <form
                    className="flex items-center gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const value = new FormData(e.currentTarget).get("name") as string;
                      start(async () => {
                        const r = await renameCustomerLogin(dealId, a.id, value);
                        showToast(r.ok ? "Navnet er ændret" : r.error);
                        if (r.ok) setRenaming(null);
                      });
                    }}
                  >
                    <input name="name" autoFocus defaultValue={a.name ?? ""} placeholder="Navn" className="w-48 rounded-md border border-slate-300 px-2 py-1 text-sm" onKeyDown={(e) => e.key === "Escape" && setRenaming(null)} />
                    <span className="truncate text-slate-500">· {a.email}</span>
                    <button type="submit" disabled={pending} className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white">
                      Gem
                    </button>
                    <button type="button" onClick={() => setRenaming(null)} className="text-xs text-slate-500">
                      Fortryd
                    </button>
                  </form>
                ) : (
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                    <p className="min-w-0 break-words font-medium text-slate-900">
                      {a.name ?? a.email}
                      {a.name && <span className="block break-all text-xs font-normal text-slate-500">{a.email}</span>}
                    </p>
                    <button type="button" onClick={() => setRenaming(a.id)} className="flex-none text-xs text-slate-500 hover:text-slate-900" title="Ret navn">
                      ✎ Ret navn
                    </button>
                  </div>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                  <select
                    aria-label={`Rolle for ${a.email}`}
                    value={choiceOf(a.role, a.canApprove)}
                    disabled={pending}
                    onChange={(e) => {
                      const next = accessOf(e.target.value);
                      start(async () => {
                        const r = await setCustomerLoginRole(dealId, a.id, next.role, next.canApprove);
                        showToast(r.ok ? `${a.email} er nu ${e.target.selectedOptions[0]?.text ?? ROLE_NAMES.da[next.role]}` : r.error);
                      });
                    }}
                    className="!w-auto rounded border border-slate-200 bg-white py-0.5 pl-1.5 pr-7 text-xs font-medium text-slate-700"
                  >
                    {CHOICES.map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {[
                    when(a.lastLoginAt),
                    a.expiresAt && (new Date(a.expiresAt) < new Date() ? `Udløbet ${day(a.expiresAt)}` : `Stopper ${day(a.expiresAt)}`),
                    a.byCustomer && a.invitedByName && `Inviteret af ${a.invitedByName} (kunden)`,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </div>
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
            const r = await grantCustomerAccess(dealId, email, name, accessOf(choice).role, accessOf(choice).canApprove);
            if (!r.ok) return setError(r.error);
            showToast(`Adgang givet - login-link sendt til ${email}`);
            setEmail("");
            setName("");
            setChoice("OWNER");
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
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Rolle</label>
          <select value={choice} onChange={(e) => setChoice(e.target.value)} className="mt-1 rounded-md border border-slate-300 bg-white px-2 py-2 text-sm">
            {CHOICES.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={pending || !email} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
          {pending ? "Sender…" : "Giv adgang og send mail"}
        </button>
        {error && <p className="w-full text-xs text-red-600">{error}</p>}
      </form>
      <InviteLinks dealId={dealId} links={inviteLinks} />
    </section>
  );
}

type InviteLink = { id: string; role: CustomerRole; canApprove: boolean; uses: number; maxUses: number; expiresAt: Date };

/**
 * "Invitationslink": one link for the customer's people - each writes their name and e-mail and gets a login
 * link on that e-mail. The link is shown once (only its hash is kept); it runs out, has a number of uses and can
 * be stopped.
 */
function InviteLinks({ dealId, links }: { dealId: string; links: InviteLink[] }) {
  const [pending, start] = useTransition();
  const [choice, setChoice] = useState("STAFF");
  const [days, setDays] = useState(14);
  const [uses, setUses] = useState(5);
  const [url, setUrl] = useState<string | null>(null);
  const showToast = useToast();
  const copy = (u: string) => navigator.clipboard?.writeText(u).then(() => showToast("Linket er kopieret"), () => {});

  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <h3 className="text-xs font-semibold text-slate-900">Invitationslink</h3>
      <p className="mt-0.5 text-xs text-slate-500">Ét link, I kan sende til kunden. Hver person skriver navn og e-mail og får et login-link på mailen, så kun den, der har mailboksen, kommer ind.</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <select value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Rolle" className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
          {CHOICES.filter(([v]) => v !== "OWNER").map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Gælder i" className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
          {[7, 14, 30].map((d) => (
            <option key={d} value={d}>
              Gælder {d} dage
            </option>
          ))}
        </select>
        <select value={uses} onChange={(e) => setUses(Number(e.target.value))} aria-label="Antal personer" className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
          {[1, 3, 5, 10, 25].map((n) => (
            <option key={n} value={n}>
              Op til {n} {n === 1 ? "person" : "personer"}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const a = accessOf(choice);
              const r = await createCustomerInviteLink(dealId, a.role, a.canApprove, days, uses);
              if (!r.ok) return showToast(r.error);
              setUrl(r.url);
              copy(r.url);
            })
          }
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Laver…" : "Lav link"}
        </button>
      </div>
      {url && (
        <div className="mt-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">
          <p className="font-medium">Kopiér linket nu - det vises kun denne ene gang.</p>
          <div className="mt-1.5 flex gap-2">
            <input readOnly value={url} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded border border-amber-200 bg-white px-2 py-1 font-mono text-[11px]" />
            <button type="button" onClick={() => copy(url)} className="rounded bg-amber-900 px-2 py-1 font-medium text-white">
              Kopiér
            </button>
          </div>
        </div>
      )}
      {links.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-100 text-xs text-slate-600">
          {links.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 py-1.5">
              <span>
                {CHOICES.find(([v]) => v === choiceOf(l.role, l.canApprove))?.[1]}: brugt {l.uses} af {l.maxUses}, gælder til {day(l.expiresAt)}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await revokeCustomerInviteLink(dealId, l.id);
                    showToast(r.ok ? "Linket er stoppet" : r.error);
                  })
                }
                className="font-medium text-red-600 hover:underline"
              >
                Stop
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
