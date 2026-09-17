"use client";

import { useRef, useState } from "react";
import { createDealManual } from "@/lib/actions/deals";
import { DisplayNameInput } from "../../display-name-input";

type User = { id: string; name: string };
type AddressSuggestion = { text: string; lat: number | null; lon: number | null };
type CvrSearchHit = { cvr: string; name: string; status: string | null; city: string | null };

export function NewDealForm({ users, defaultOwnerId }: { users: User[]; defaultOwnerId?: string }) {
  const [cvrInput, setCvrInput] = useState("");
  const [cvrNumber, setCvrNumber] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [addressCoords, setAddressCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const addressDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [lookupState, setLookupState] = useState<{ status: "idle" | "loading" | "error" | "success"; message?: string }>({
    status: "idle",
  });
  const [cvrNameResults, setCvrNameResults] = useState<CvrSearchHit[]>([]);
  const cvrDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleCvrInputChange(newValue: string) {
    setCvrInput(newValue);

    if (cvrDebounceRef.current) clearTimeout(cvrDebounceRef.current);
    const isCvrNumber = /^[\d\s-]+$/.test(newValue.trim());
    if (isCvrNumber || newValue.trim().length < 2) {
      setCvrNameResults([]);
      return;
    }

    cvrDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/cvr/search?q=${encodeURIComponent(newValue)}`);
        const data = (await res.json()) as CvrSearchHit[];
        setCvrNameResults(data);
      } catch {
        setCvrNameResults([]);
      }
    }, 300);
  }

  function handleAddressChange(newValue: string) {
    setAddress(newValue);
    setAddressCoords(null);

    if (addressDebounceRef.current) clearTimeout(addressDebounceRef.current);
    if (newValue.trim().length < 3) {
      setAddressSuggestions([]);
      return;
    }

    addressDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/address-autocomplete?q=${encodeURIComponent(newValue)}`);
        const data = (await res.json()) as AddressSuggestion[];
        setAddressSuggestions(data);
        setShowAddressSuggestions(data.length > 0);
      } catch {
        setAddressSuggestions([]);
      }
    }, 250);
  }

  function selectAddressSuggestion(s: AddressSuggestion) {
    setAddress(s.text);
    if (s.lat != null && s.lon != null) setAddressCoords({ lat: s.lat, lon: s.lon });
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
  }

  async function handleLookup(cvrOverride?: string) {
    const nr = cvrOverride ?? cvrInput;
    setCvrNameResults([]);
    setLookupState({ status: "loading" });
    try {
      const res = await fetch(`/api/cvr/lookup?nr=${encodeURIComponent(nr)}`);
      const data = await res.json();
      if (!res.ok) {
        setLookupState({ status: "error", message: data.error || "Kunne ikke slå CVR-nummeret op." });
        return;
      }
      setCvrInput(data.cvr);
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
    <form action={createDealManual} className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <input type="hidden" name="cvrNumber" value={cvrNumber} />

      <div className="relative rounded-md border border-dashed border-slate-300 bg-slate-50 p-3">
        <label className="block text-xs font-medium text-slate-500">Hent fra CVR (valgfrit)</label>
        <div className="mt-1 flex gap-2">
          <input
            value={cvrInput}
            onChange={(e) => handleCvrInputChange(e.target.value)}
            onBlur={() => setTimeout(() => setCvrNameResults([]), 150)}
            placeholder="CVR-nummer eller virksomhedsnavn"
            autoComplete="off"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => handleLookup()}
            disabled={lookupState.status === "loading" || cvrInput.trim().length === 0}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            {lookupState.status === "loading" ? "Slår op…" : "Slå op"}
          </button>
        </div>
        {cvrNameResults.length > 0 && (
          <ul className="absolute z-10 mt-1 w-[calc(100%-1.5rem)] rounded-md border border-slate-200 bg-white text-sm shadow-lg">
            {cvrNameResults.map((hit) => (
              <li key={hit.cvr}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleLookup(hit.cvr)}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-slate-50"
                >
                  <span>
                    {hit.name} <span className="text-xs text-slate-400">CVR {hit.cvr}</span>
                  </span>
                  <span className="text-xs text-slate-400">{[hit.city, hit.status].filter(Boolean).join(" · ")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {lookupState.message && (
          <p className={`mt-2 text-xs ${lookupState.status === "error" ? "text-red-600" : "text-emerald-700"}`}>
            {lookupState.message}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Firmanavn (CVR) *</label>
        <input
          name="companyName"
          required
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Kaldenavn (valgfri)</label>
        <DisplayNameInput />
      </div>
      <div className="relative">
        <label className="block text-sm font-medium text-slate-700">Adresse</label>
        <input
          name="address"
          value={address}
          onChange={(e) => handleAddressChange(e.target.value)}
          onFocus={() => addressSuggestions.length > 0 && setShowAddressSuggestions(true)}
          onBlur={() => setTimeout(() => setShowAddressSuggestions(false), 150)}
          autoComplete="off"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        {addressCoords && <input type="hidden" name="addressLat" value={addressCoords.lat} />}
        {addressCoords && <input type="hidden" name="addressLon" value={addressCoords.lon} />}
        {showAddressSuggestions && addressSuggestions.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white text-sm shadow-lg">
            {addressSuggestions.map((s) => (
              <li key={s.text}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectAddressSuggestion(s)}
                  className="block w-full px-3 py-1.5 text-left hover:bg-slate-50"
                >
                  {s.text}
                </button>
              </li>
            ))}
          </ul>
        )}
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
        className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Opret deal
      </button>
    </form>
  );
}
