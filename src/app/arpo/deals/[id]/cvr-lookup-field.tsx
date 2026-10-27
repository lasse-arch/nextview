"use client";

import { useRef, useState } from "react";

/**
 * Sets a form field's value the way a real user typing would - needed so
 * both plain uncontrolled inputs (companyName, contactName, ...) and
 * controlled ones (AddressAutocomplete's address field) pick up the change,
 * since directly setting `.value` on a controlled input's DOM node is
 * silently undone on its next React re-render.
 */
function setFieldValue(el: Element | RadioNodeList | null, value: string) {
  if (!(el instanceof HTMLInputElement)) return;
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  nativeSetter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * CVR-nummer field with a "Slå op" lookup, same idea as the one on the new-
 * deal form - lets an existing deal's company info be refreshed from CVR
 * (e.g. a wrong number was entered, or the company's registered details
 * changed) instead of only being usable when first creating the deal.
 */
export function CvrLookupField({ defaultValue }: { defaultValue: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [lookupState, setLookupState] = useState<{ status: "idle" | "loading" | "error" | "success"; message?: string }>({
    status: "idle",
  });

  async function handleLookup() {
    const nr = inputRef.current?.value.trim() ?? "";
    if (!nr) return;
    setLookupState({ status: "loading" });
    try {
      const res = await fetch(`/api/cvr/lookup?nr=${encodeURIComponent(nr)}`);
      const data = await res.json();
      if (!res.ok) {
        setLookupState({ status: "error", message: data.error || "Kunne ikke slå CVR-nummeret op." });
        return;
      }

      const form = inputRef.current?.form;
      setFieldValue(inputRef.current, data.cvr || nr);
      if (data.name) setFieldValue(form?.elements.namedItem("companyName") ?? null, data.name);
      if (data.address) setFieldValue(form?.elements.namedItem("address") ?? null, data.address);
      if (data.contactName) setFieldValue(form?.elements.namedItem("contactName") ?? null, data.contactName);
      if (data.phone) setFieldValue(form?.elements.namedItem("contactPhone") ?? null, data.phone);
      if (data.email) setFieldValue(form?.elements.namedItem("contactEmail") ?? null, data.email);

      setLookupState({ status: "success", message: "Data hentet fra CVR — ret til hvis nødvendigt." });
    } catch {
      setLookupState({ status: "error", message: "Kunne ikke kontakte CVR-opslagstjenesten." });
    }
  }

  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">CVR-nummer</label>
      <div className="mt-1 flex gap-2">
        <input
          ref={inputRef}
          name="cvrNumber"
          defaultValue={defaultValue}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={handleLookup}
          disabled={lookupState.status === "loading"}
          className="shrink-0 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          {lookupState.status === "loading" ? "Slår op…" : "Slå op"}
        </button>
      </div>
      {lookupState.message && (
        <p className={`mt-1 text-xs ${lookupState.status === "error" ? "text-red-600" : "text-emerald-700"}`}>
          {lookupState.message}
        </p>
      )}
    </div>
  );
}
