"use client";

import { useState } from "react";
import { formatDKK } from "@/lib/labels";
import type { ContractProducts, TourLocation } from "@/lib/contract-template-data";

type Tour = ContractProducts["nextviewTour"];

/** A whole-kroner field that can sit empty while typing (see NumberField in the contract form). */
function KronerInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const [text, setText] = useState(String(value));
  // Follows the value when it changes from outside (e.g. a location removed), not on this field's own typing.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (parseFloat(text) !== value) setText(String(value));
  }
  return (
    <input
      type="number"
      min={0}
      step="1"
      aria-label={label}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Math.round(parseFloat(e.target.value));
        if (Number.isFinite(n)) onChange(Math.max(0, n));
      }}
      onBlur={() => {
        const n = Math.round(parseFloat(text));
        const v = Number.isFinite(n) ? Math.max(0, n) : 0;
        setText(String(v));
        onChange(v);
      }}
      onWheel={(e) => e.currentTarget.blur()}
      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-right text-sm"
    />
  );
}

const labelCls = "block text-[11px] font-semibold uppercase tracking-wide text-slate-500";

/**
 * The tour's prices on a contract: one setup fee and monthly price - or, for
 * the few customers with several locations, one row per location (name,
 * address, setup fee, monthly price). The tour's own setupFee/price are kept
 * as the locations' sums, so everything else (totals, MRR, commission) reads
 * them as before.
 */
export function TourPriceFields({ tour, onChange }: { tour: Tour; onChange: (tour: Tour) => void }) {
  const locations = tour.locations ?? [];
  const multi = locations.length > 0;

  const setLocations = (next: TourLocation[]) =>
    onChange({
      ...tour,
      locations: next,
      setupFee: next.reduce((s, l) => s + l.setupFee, 0),
      price: next.reduce((s, l) => s + l.price, 0),
    });
  const setLocation = (i: number, patch: Partial<TourLocation>) => setLocations(locations.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-3 sm:col-span-2">
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={multi}
          onChange={(e) => {
            if (e.target.checked) {
              // The prices already typed become the first location's, and a second one is ready to fill in.
              setLocations([
                { name: "", address: "", setupFee: tour.setupFee, price: tour.price },
                { name: "", address: "", setupFee: tour.setupFee, price: tour.price },
              ]);
            } else {
              const first = locations[0];
              onChange({ ...tour, locations: undefined, setupFee: first?.setupFee ?? 0, price: first?.price ?? 0 });
            }
          }}
        />
        Kunden har flere lokationer (en tour pr. lokation)
      </label>

      {!multi ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <span className={labelCls}>Etableringspris (engangs, DKK)</span>
            <div className="mt-1">
              <KronerInput label="Etableringspris" value={tour.setupFee} onChange={(setupFee) => onChange({ ...tour, setupFee })} />
            </div>
          </div>
          <div>
            <span className={labelCls}>Pris pr. måned (DKK)</span>
            <div className="mt-1">
              <KronerInput label="Pris pr. måned" value={tour.price} onChange={(price) => onChange({ ...tour, price })} />
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="hidden grid-cols-[1.1fr_1.4fr_7rem_7rem_2rem] gap-2 sm:grid">
            <span className={labelCls}>Lokation</span>
            <span className={labelCls}>Adresse</span>
            <span className={`${labelCls} text-right`}>Etablering</span>
            <span className={`${labelCls} text-right`}>Pr. måned</span>
            <span />
          </div>
          {locations.map((l, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 p-2 sm:grid-cols-[1.1fr_1.4fr_7rem_7rem_2rem] sm:border-0 sm:p-0">
              <input
                value={l.name}
                onChange={(e) => setLocation(i, { name: e.target.value })}
                placeholder={`Fx ${["Aalborg", "Aarhus", "Odense", "Vejle"][i % 4]}`}
                aria-label="Lokation"
                className="col-span-2 rounded-md border border-slate-300 px-2 py-1.5 text-sm sm:col-span-1"
              />
              <input
                value={l.address}
                onChange={(e) => setLocation(i, { address: e.target.value })}
                placeholder="Adresse"
                aria-label="Adresse"
                className="col-span-2 rounded-md border border-slate-300 px-2 py-1.5 text-sm sm:col-span-1"
              />
              <KronerInput label="Etablering" value={l.setupFee} onChange={(setupFee) => setLocation(i, { setupFee })} />
              <KronerInput label="Pr. måned" value={l.price} onChange={(price) => setLocation(i, { price })} />
              <button
                type="button"
                title="Fjern lokationen"
                disabled={locations.length <= 2}
                onClick={() => setLocations(locations.filter((_, j) => j !== i))}
                className="col-span-2 rounded-md text-sm text-slate-400 hover:text-red-600 disabled:opacity-30 sm:col-span-1"
              >
                ×
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={() => setLocations([...locations, { name: "", address: "", setupFee: locations.at(-1)?.setupFee ?? 0, price: locations.at(-1)?.price ?? 0 }])}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              + Tilføj lokation
            </button>
            <p className="text-sm text-slate-600">
              {locations.length} lokationer · <span className="money font-medium text-slate-900">{formatDKK(tour.setupFee)}</span> etablering ·{" "}
              <span className="money font-medium text-slate-900">{formatDKK(tour.price)}</span>/md.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
