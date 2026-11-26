"use client";

import { useState } from "react";
import { addTrip } from "@/lib/actions/hr";
import { TRIP_KINDS } from "@/lib/hr";
import type { TripSuggestion } from "@/lib/hr-data";

const label = "block text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none";
const OFFICE = "Danmarksgade 23, 9000 Aalborg";

/**
 * Kørsel: a trip in one's own car - picked from one's own meetings and filmings (date, address and purpose filled in),
 * from home or the office, with the car's number plate and what it was for.
 */
export function TripForm({ employeeId, backTo, suggestions, home, plates }: { employeeId: string; backTo: string; suggestions: TripSuggestion[]; home: string | null; plates: string[] }) {
  const [date, setDate] = useState("");
  const [from, setFrom] = useState(OFFICE);
  const [to, setTo] = useState("");
  const [kind, setKind] = useState<string>("Kundebesøg");
  const [purpose, setPurpose] = useState("");
  const [dealId, setDealId] = useState("");
  const [back, setBack] = useState(true);
  const places = [{ v: OFFICE, l: "Kontoret" }, ...(home ? [{ v: home, l: "Hjemme" }] : [])];

  function pick(key: string) {
    const s = suggestions.find((x) => x.key === key);
    if (!s) return setDealId("");
    setDate(s.date);
    setTo(s.address);
    setKind(s.kind);
    setPurpose(s.label);
    setDealId(s.dealId);
  }

  return (
    <form action={addTrip.bind(null, employeeId, backTo)} className="grid grid-cols-2 gap-3 sm:grid-cols-6">
      {suggestions.length > 0 && (
        <label className="col-span-2 sm:col-span-6">
          <span className={label}>Vælg et møde eller en filmning (valgfri)</span>
          <select className={input} defaultValue="" onChange={(e) => pick(e.target.value)}>
            <option value="">Skriv turen selv</option>
            {suggestions.map((s) => (
              <option key={s.key} value={s.key}>
                {s.date.split("-").reverse().join("/")} {s.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        <span className={label}>Dato</span>
        <input type="date" name="date" required value={date} onChange={(e) => setDate(e.target.value)} className={input} />
      </label>
      <label className="col-span-1 sm:col-span-2">
        <span className={label}>Hvad</span>
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={input}>
          {TRIP_KINDS.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </label>
      <label className="col-span-2 sm:col-span-3">
        <span className={label}>Formål</span>
        <input name="purpose" required maxLength={300} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Fx filmning hos Halvorsminde Efterskole" className={input} />
      </label>
      <label className="col-span-2 sm:col-span-3">
        <span className={label}>Fra</span>
        <input name="from" required maxLength={200} value={from} onChange={(e) => setFrom(e.target.value)} className={input} />
        <span className="mt-1 flex gap-2">
          {places.map((p) => (
            <button key={p.l} type="button" onClick={() => setFrom(p.v)} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700 hover:bg-slate-200">
              {p.l}
            </button>
          ))}
        </span>
      </label>
      <label className="col-span-2 sm:col-span-3">
        <span className={label}>Til (og stop undervejs)</span>
        <input name="to" required maxLength={300} value={back && to && !to.endsWith(" og retur") ? `${to} og retur` : to} onChange={(e) => setTo(e.target.value.replace(/ og retur$/, ""))} placeholder="Fx Hobrovej 10, Støvring" className={input} />
        <span className="mt-1 flex items-center gap-2 text-xs text-slate-600">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={back} onChange={(e) => setBack(e.target.checked)} /> Og retur
          </label>
          {places.map((p) => (
            <button key={p.l} type="button" onClick={() => setTo(p.v)} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-700 hover:bg-slate-200">
              {p.l}
            </button>
          ))}
        </span>
      </label>
      <label>
        <span className={label}>Km i alt</span>
        <input name="km" required inputMode="decimal" placeholder="42,5" className={input} />
      </label>
      <label className="col-span-1 sm:col-span-2">
        <span className={label}>Nummerplade</span>
        <input name="plate" list={`plates-${employeeId}`} defaultValue={plates[0] ?? ""} maxLength={10} placeholder="AB 12 345" className={input} />
        <datalist id={`plates-${employeeId}`}>
          {plates.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </label>
      <input type="hidden" name="dealId" value={dealId} />
      <div className="col-span-2 flex items-end sm:col-span-3">
        <button className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">Registrér turen</button>
      </div>
      <p className="col-span-2 text-xs text-slate-500 sm:col-span-6">Kun kørsel i egen bil for arbejdet. Kørsel mellem hjem og kontor tæller ikke. Kørepengene er skattefri efter Skattestyrelsens satser og kommer med lønnen, når turen er godkendt.</p>
    </form>
  );
}
