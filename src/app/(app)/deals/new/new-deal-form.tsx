"use client";

import { useState } from "react";
import { createDealManual } from "@/lib/actions/deals";

type User = { id: string; name: string };

export function NewDealForm({ users, defaultOwnerId }: { users: User[]; defaultOwnerId?: string }) {
  const [cvrInput, setCvrInput] = useState("");
  const [cvrNumber, setCvrNumber] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [lookupState, setLookupState] = useState<{ status: "idle" | "loading" | "error" | "success"; message?: string }>({
    status: "idle",
  });

  async function handleLookup() {
    setLookupState({ status: "loading" });
    try {
      const res = await fetch(`/api/cvr/lookup?nr=${encodeURIComponent(cvrInput)}`);
      const data = await res.json();
      if (!res.ok) {
        setLookupState({ status: "error", message: data.error || "Kunne ikke slå CVR-nummeret op." });
        return;
      }
      setCvrNumber(data.cvr);
      setCompanyName(data.name || "");
      setAddress(data.address || "");
      if (data.phone) setContactPhone(data.phone);
      if (data.email) setContactEmail(data.email);
      setLookupState({ status: "success", message: "Data hentet fra CVR — ret til hvis nødvendigt." });
    } catch {
      setLookupState({ status: "error", message: "Kunne ikke kontakte CVR-opslagstjenesten." });
    }
  }

  return (
    <form action={createDealManual} className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-6">
      <input type="hidden" name="cvrNumber" value={cvrNumber} />

      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3">
        <label className="block text-xs font-medium text-slate-500">Hent fra CVR (valgfrit)</label>
        <div className="mt-1 flex gap-2">
          <input
            value={cvrInput}
            onChange={(e) => setCvrInput(e.target.value)}
            placeholder="8-cifret CVR-nummer"
            inputMode="numeric"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleLookup}
            disabled={lookupState.status === "loading" || cvrInput.trim().length === 0}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            {lookupState.status === "loading" ? "Slår op…" : "Slå op"}
          </button>
        </div>
        {lookupState.message && (
          <p className={`mt-2 text-xs ${lookupState.status === "error" ? "text-red-600" : "text-emerald-700"}`}>
            {lookupState.message}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Firmanavn *</label>
        <input
          name="companyName"
          required
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Adresse</label>
        <input
          name="address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Kontaktperson</label>
        <input name="contactName" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">E-mail</label>
          <input
            type="email"
            name="contactEmail"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Telefon</label>
          <input
            name="contactPhone"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Ejer</label>
        <select
          name="ownerId"
          defaultValue={defaultOwnerId}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        Opret deal
      </button>
    </form>
  );
}
