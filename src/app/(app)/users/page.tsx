import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { createUser, updateUser } from "@/lib/actions/users";
import { commissionFrequencyLabels } from "@/lib/labels";

export default async function UsersPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (currentUser.role !== "ADMIN") redirect("/");

  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Brugere</h1>

      <div className="space-y-4">
        {users.map((u) => {
          const updateUserWithId = updateUser.bind(null, u.id);
          return (
            <form
              key={u.id}
              action={updateUserWithId}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-500">Navn</label>
                  <input name="name" defaultValue={u.name} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                  <p className="mt-1 text-xs text-slate-400">{u.email}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">Rolle</label>
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
                <div>
                  <label className="block text-xs font-medium text-slate-500">Provisionssats (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    name="commissionRate"
                    defaultValue={u.commissionRate}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">Udbetalingsfrekvens</label>
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
                  <label className="block text-xs font-medium text-slate-500">Ny adgangskode</label>
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
          <div className="col-span-2 flex items-center gap-2">
            <input type="checkbox" name="isCommissionBased" id="new-comm" defaultChecked />
            <label htmlFor="new-comm" className="text-xs font-medium text-slate-600">
              Provisionslønnet
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
