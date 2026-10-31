"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CustomerRole } from "@prisma/client";
import { portalInvite, portalRemoveUser } from "@/lib/actions/portal-users";
import { ROLE_NAMES, roleScope } from "@/lib/customer-roles";

/*
 * "Brugere" on the customer's page: who has access, and inviting someone new
 * with a role - with a note, before sending, of exactly what they will get.
 * Everything is checked again on the server (src/lib/portal-users.ts).
 */

export type PortalUserRow = {
  id: string;
  email: string;
  name: string | null;
  role: CustomerRole;
  canApprove: boolean;
  /** Already in words, from the server: "Sidst logget ind 3. nov." / "Har ikke logget ind endnu". */
  seen: string;
  /** "Stopper 30. nov." - or null. */
  expires: string | null;
  invitedBy: string | null;
  fromNextview: boolean;
  deals: string[];
};

type Lang = "da" | "en";

const W = {
  da: {
    title: "Brugere",
    lead: "Giv jeres udvikler eller en kollega adgang. De logger ind med et link på mail - ingen kodeord.",
    you: "dig",
    invitedBy: (n: string) => `Inviteret af ${n}`,
    byUs: "Givet af Nextview360",
    remove: "Fjern",
    removeConfirm: (e: string) =>
      `Fjern ${e}s adgang? Det virker med det samme.`,
    invite: "Inviter en bruger",
    email: "E-mail",
    name: "Navn",
    optional: "Valgfrit",
    role: "Rolle",
    approve: "Må også godkende ændringer i touren",
    expiry: "Adgangen gælder",
    expiryOpts: [
      [7, "7 dage"],
      [30, "30 dage"],
      [null, "Altid"],
    ] as [number | null, string][],
    locations: "Afdelinger",
    gets: (n: string) => `Det får ${n} adgang til:`,
    not: "Ikke:",
    stops: (d: string) => `Adgangen stopper af sig selv ${d}.`,
    them: "personen",
    send: "Send invitation",
    sending: "Sender…",
    sent: (e: string) => `Invitation sendt til ${e}.`,
    preview: "Du ser siden som kunden - invitationer sendes af kunden selv.",
    off: "Det er slået fra at invitere brugere her. Skriv til os, så hjælper vi.",
    roleText: {
      OWNER: "Alt - også kontrakt og brugere",
      STAFF: "Tours, statistik, koder og rettelser",
      DEVELOPER: "Koden til hjemmesiden og forhåndsvisning",
      VIEWER: "Kun tours og statistik",
    } as Record<CustomerRole, string>,
  },
  en: {
    title: "Users",
    lead: "Give your developer or a colleague access. They log in with a link by e-mail - no passwords.",
    you: "you",
    invitedBy: (n: string) => `Invited by ${n}`,
    byUs: "Given by Nextview360",
    remove: "Remove",
    removeConfirm: (e: string) =>
      `Remove ${e}'s access? It takes effect at once.`,
    invite: "Invite a user",
    email: "E-mail",
    name: "Name",
    optional: "Optional",
    role: "Role",
    approve: "May also approve changes to the tour",
    expiry: "Access lasts",
    expiryOpts: [
      [7, "7 days"],
      [30, "30 days"],
      [null, "Always"],
    ] as [number | null, string][],
    locations: "Locations",
    gets: (n: string) => `${n} gets access to:`,
    not: "Not:",
    stops: (d: string) => `The access stops by itself on ${d}.`,
    them: "they",
    send: "Send invitation",
    sending: "Sending…",
    sent: (e: string) => `Invitation sent to ${e}.`,
    preview:
      "You see the page as the customer - invitations are sent by the customer.",
    off: "Inviting users is turned off here. Write to us and we'll help.",
    roleText: {
      OWNER: "Everything - contract and users too",
      STAFF: "Tours, statistics, codes and changes",
      DEVELOPER: "The website code and a preview",
      VIEWER: "Only tours and statistics",
    } as Record<CustomerRole, string>,
  },
};

/** Today's time, outside render's purity rule (the stop date is only a preview - the server sets the real one). */
const clock = () => Date.now();

const ROLE_ORDER: CustomerRole[] = ["STAFF", "DEVELOPER", "VIEWER", "OWNER"];

export function PortalUsers({
  users,
  deals,
  meId,
  mayInvite,
  preview,
  lang,
}: {
  users: PortalUserRow[];
  deals: { id: string; name: string }[];
  meId: string | null;
  mayInvite: boolean;
  preview: boolean;
  lang: Lang;
}) {
  const w = W[lang];
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<CustomerRole>("DEVELOPER");
  const [canApprove, setCanApprove] = useState(false);
  const [days, setDays] = useState<number | null>(30);
  const [picked, setPicked] = useState<string[]>(deals.map((d) => d.id));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const scope = roleScope(role, canApprove, lang);
  const who = name.trim().split(" ")[0] || email.trim() || w.them;
  const stopDate = days
    ? new Date(clock() + days * 86_400_000).toLocaleDateString(
        lang === "en" ? "en-GB" : "da-DK",
        { day: "numeric", month: "long" },
      )
    : null;
  const dealName = (id: string) => deals.find((d) => d.id === id)?.name ?? "";

  function chooseRole(r: CustomerRole) {
    setRole(r);
    // A developer's access runs out by itself (30 days unless changed); everyone else keeps it.
    setDays(r === "DEVELOPER" ? 30 : null);
    if (r !== "STAFF") setCanApprove(false);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (preview || busy) return;
    setBusy(true);
    setMsg(null);
    const r = await portalInvite({
      email,
      name,
      role,
      dealIds: picked,
      expiresDays: days,
      canApprove,
    }).catch(() => ({
      ok: false as const,
      error: "Der skete en fejl - prøv igen.",
    }));
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setMsg({ ok: true, text: r.warning ?? w.sent(email) });
    setEmail("");
    setName("");
    router.refresh();
  }

  async function remove(u: PortalUserRow) {
    if (preview || !confirm(w.removeConfirm(u.email))) return;
    const r = await portalRemoveUser(u.id).catch(() => ({
      ok: false as const,
      error: "Der skete en fejl - prøv igen.",
    }));
    if (!r.ok) setMsg({ ok: false, text: r.error });
    router.refresh();
  }

  const card = "rounded-3xl bg-white p-5 sm:p-6";
  return (
    <>
      <div className="pt-1">
        <h1 className="text-[30px] font-bold tracking-tight">{w.title}</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-[#6e6e73]">{w.lead}</p>
      </div>

      <section className={card}>
        <ul className="divide-y divide-black/[.06]">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eef3ff] text-[15px] font-bold uppercase text-[#0071e3]">
                {(u.name || u.email)[0]}
              </span>
              <div className="min-w-0 flex-1 basis-[220px]">
                <p className="truncate text-[15px] font-semibold">
                  {u.name ? `${u.name} · ` : ""}
                  <span className={u.name ? "font-normal text-[#6e6e73]" : ""}>
                    {u.email}
                  </span>
                  {u.id === meId && (
                    <span className="font-normal text-[#8e8e93]">
                      {" "}
                      ({w.you})
                    </span>
                  )}
                </p>
                <p className="text-[13px] text-[#6e6e73]">
                  {[
                    u.seen,
                    u.expires,
                    u.fromNextview
                      ? w.byUs
                      : u.invitedBy
                        ? w.invitedBy(u.invitedBy)
                        : null,
                    deals.length > 1 ? u.deals.map(dealName).join(", ") : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {/* On a phone the role and Fjern go on their own line under the name. */}
              <div className="ml-[52px] flex items-center gap-2 sm:ml-0">
                <span className="rounded-full bg-[#f3f3f5] px-3 py-1 text-[12.5px] font-semibold">
                  {ROLE_NAMES[lang][u.role]}
                  {u.role === "STAFF" && u.canApprove ? " ✓" : ""}
                </span>
                {u.id !== meId && !u.fromNextview && !preview && (
                  <button
                    type="button"
                    onClick={() => remove(u)}
                    className="rounded-full px-3 py-1 text-[13px] font-semibold text-[#d70015] hover:bg-[#d70015]/10"
                  >
                    {w.remove}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={card}>
        <h2 className="text-[18px] font-bold tracking-tight">{w.invite}</h2>
        {!mayInvite ? (
          <p className="mt-2 text-[15px] text-[#3a3a3c]">{w.off}</p>
        ) : (
          <form onSubmit={send} className="mt-4 space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[13px] font-semibold text-[#3a3a3c]">
                  {w.email}
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-2xl bg-[#f3f3f5] px-4 py-3 text-[15px] outline-none focus:ring-2 focus:ring-[#0071e3]"
                />
              </label>
              <label className="block">
                <span className="text-[13px] font-semibold text-[#3a3a3c]">
                  {w.name}
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={w.optional}
                  className="mt-1 w-full rounded-2xl bg-[#f3f3f5] px-4 py-3 text-[15px] outline-none focus:ring-2 focus:ring-[#0071e3]"
                />
              </label>
            </div>

            <div>
              <p className="text-[13px] font-semibold text-[#3a3a3c]">
                {w.role}
              </p>
              <div
                role="radiogroup"
                className="mt-1.5 grid gap-2 sm:grid-cols-2"
              >
                {ROLE_ORDER.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={role === r}
                    onClick={() => chooseRole(r)}
                    className={`rounded-2xl px-4 py-3 text-left ${role === r ? "bg-[#0071e3] text-white" : "bg-[#f3f3f5] text-[#1d1d1f] hover:bg-[#e8e8ed]"}`}
                  >
                    <span className="block text-[15px] font-semibold">
                      {ROLE_NAMES[lang][r]}
                    </span>
                    <span
                      className={`block text-[12.5px] ${role === r ? "text-white/80" : "text-[#6e6e73]"}`}
                    >
                      {w.roleText[r]}
                    </span>
                  </button>
                ))}
              </div>
              {role === "STAFF" && (
                <label className="mt-2.5 flex items-center gap-2 text-[14px]">
                  <input
                    type="checkbox"
                    checked={canApprove}
                    onChange={(e) => setCanApprove(e.target.checked)}
                  />
                  {w.approve}
                </label>
              )}
            </div>

            {role === "DEVELOPER" && (
              <div>
                <p className="text-[13px] font-semibold text-[#3a3a3c]">
                  {w.expiry}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {w.expiryOpts.map(([d, label]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setDays(d)}
                      className={`rounded-full px-4 py-2 text-[14px] font-semibold ${days === d ? "bg-[#1d1d1f] text-white" : "bg-[#f3f3f5] hover:bg-[#e8e8ed]"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {deals.length > 1 && (
              <div>
                <p className="text-[13px] font-semibold text-[#3a3a3c]">
                  {w.locations}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
                  {deals.map((d) => (
                    <label
                      key={d.id}
                      className="flex items-center gap-1.5 text-[14px]"
                    >
                      <input
                        type="checkbox"
                        checked={picked.includes(d.id)}
                        onChange={(e) =>
                          setPicked((p) =>
                            e.target.checked
                              ? [...p, d.id]
                              : p.filter((x) => x !== d.id),
                          )
                        }
                      />
                      {d.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* The note: exactly what they get - and don't - before anything is sent. */}
            <div className="rounded-2xl bg-[#f7f7f9] p-4 text-[14px] leading-relaxed">
              <p>
                <b>{w.gets(who)}</b> {scope.gets.join(", ")}.
              </p>
              {scope.not.length > 0 && (
                <p className="text-[#6e6e73]">
                  <b>{w.not}</b> {scope.not.join(", ")}.
                </p>
              )}
              {stopDate && (
                <p className="text-[#6e6e73]">{w.stops(stopDate)}</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={preview || busy || !email || !picked.length}
                className="rounded-full bg-[#0071e3] px-5 py-2.5 text-[15px] font-semibold text-white disabled:opacity-50"
              >
                {busy ? w.sending : w.send}
              </button>
              {preview && (
                <span className="text-[13px] text-[#6e6e73]">{w.preview}</span>
              )}
              {msg && (
                <span
                  className={`text-[14px] ${msg.ok ? "text-[#1d7a33]" : "text-[#d70015]"}`}
                >
                  {msg.text}
                </span>
              )}
            </div>
          </form>
        )}
      </section>
    </>
  );
}
