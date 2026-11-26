"use client";

import { useState } from "react";
import { createEmployee } from "@/lib/actions/hr";
import { KIND_NAMES, PAY_NAMES } from "@/lib/hr";

const label = "block text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const input = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none";
const STEPS = ["Person", "Stilling", "Arbejdstid", "Løn", "Opret"] as const;
const DAYS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

type V = Record<string, string>;

/**
 * "Ny medarbejder" step by step: who they are, the job, the working time, the pay - and then a look at it all before
 * it's made. A new person gets no access to Arpo yet: the contract goes to their own e-mail, and once it's signed and
 * they have a work account, the card opens the access (activateAccess).
 */
export function NewEmployeeWizard({ roles, existing, leaders }: { roles: { v: string; l: string }[]; existing: { id: string; name: string }[]; leaders: { id: string; name: string }[] }) {
  const [step, setStep] = useState(0);
  const [v, setV] = useState<V>({ kind: "SALARIED", role: "EMPLOYEE", weeklyHours: "37", payModel: "MONTHLY", userId: "" });
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [rule120, setRule120] = useState(true);
  // "Vi har allerede en underskrevet kontrakt" (e.g. someone already working here): the PDF is kept with them.
  const [signed, setSigned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((o) => ({ ...o, [k]: e.target.value }));
  const freelance = v.kind === "FREELANCE";
  const model = freelance ? "INVOICE" : v.payModel;

  const problem = (s: number): string | null => {
    if (s === 0 && !v.userId) {
      if (!v.name?.trim()) return "Skriv fornavnet.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email ?? "")) return "Skriv personens egen e-mail - kontrakten sendes dertil.";
      if (!freelance && !v.homeAddress?.trim()) return "Skriv adressen - den står i kontrakten.";
    }
    if (s === 1 && !v.title?.trim()) return "Skriv stillingen.";
    if (s === 2) {
      if (!v.startDate) return "Vælg den første arbejdsdag.";
      if (!freelance && !days.length) return "Vælg mindst én arbejdsdag.";
    }
    if (s === 3 && (model === "MONTHLY" || model === "MONTHLY_COMMISSION") && !v.monthly) return "Skriv månedslønnen.";
    if (s === 3 && model === "HOURLY" && !v.hourly) return "Skriv timelønnen.";
    return null;
  };
  const next = () => {
    const p = problem(step);
    setError(p);
    if (!p) setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const field = (k: string, l: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, wide = false) => (
    <label className={wide ? "col-span-2" : ""}>
      <span className={label}>{l}</span>
      <input value={v[k] ?? ""} onChange={set(k)} className={input} {...props} />
    </label>
  );
  const kr = (s?: string) => (s ? `${s} kr.` : "-");
  const summary: [string, string][] = [
    ["Navn", v.userId ? (existing.find((x) => x.id === v.userId)?.name ?? "") : `${v.name ?? ""} ${v.lastName ?? ""}`.trim()],
    ...(v.userId ? [] : ([["Egen e-mail", v.email ?? ""], ["Telefon", v.phone || "-"], ["Adresse", v.homeAddress || "-"]] as [string, string][])),
    ["Stilling", v.title ?? ""],
    ["Ansat som", KIND_NAMES[v.kind as keyof typeof KIND_NAMES]],
    ["Første dag", v.startDate ?? ""],
    ...(freelance ? [] : ([["Arbejdstid", `${v.weeklyHours} timer om ugen, ${days.map((d) => DAYS[d - 1]).join(", ")}`]] as [string, string][])),
    ["Løn", `${PAY_NAMES[model as keyof typeof PAY_NAMES]}${v.monthly ? `, ${kr(v.monthly)} om måneden` : ""}${v.hourly ? `, ${kr(v.hourly)} i timen` : ""}${v.commissionPct ? `, ${v.commissionPct} % provision` : ""}${v.guarantee?.trim() && !freelance ? `, garantiløn ${v.guarantee} kr. om måneden` : ""}`],
  ];

  return (
    <form action={createEmployee} className="space-y-5">
      <ol className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${i === step ? "bg-slate-900 text-white" : i < step ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-500"}`}
            >
              <span className="text-xs">{i < step ? "✓" : i + 1}</span> {s}
            </button>
          </li>
        ))}
      </ol>

      {/* Every field is in the form all along (the steps only show and hide them), so "Opret" sends it all at once. */}
      <section hidden={step !== 0} className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Hvem er det?</h2>
        {existing.length > 0 && (
          <label className="block">
            <span className={label}>Har personen allerede adgang til Arpo?</span>
            <select name="userId" value={v.userId} onChange={set("userId")} className={input}>
              <option value="">Nej, det er en ny person</option>
              {existing.map((u) => (
                <option key={u.id} value={u.id}>
                  Ja: {u.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div hidden={Boolean(v.userId)} className="grid grid-cols-2 gap-3">
          {field("name", "Fornavn", { name: "name", maxLength: 80 })}
          {field("lastName", "Efternavn", { name: "lastName", maxLength: 80 })}
          {field("email", "Egen e-mail (kontrakten sendes dertil)", { name: "email", type: "email", maxLength: 200 })}
          {field("phone", "Telefon", { name: "phone", maxLength: 30 })}
          {field("homeAddress", "Adresse", { name: "homeAddress", maxLength: 200, placeholder: "Gade og nr., postnr. og by" }, true)}
          <p className="col-span-2 text-xs text-slate-500">En ny person får først adgang til Arpo, når kontrakten er underskrevet og de har fået en arbejds-mail (Google). CPR og bankkonto skrives kun i lønsystemet.</p>
        </div>
      </section>

      <section hidden={step !== 1} className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Stillingen</h2>
        <div className="grid grid-cols-2 gap-3">
          {field("title", "Stilling", { name: "title", maxLength: 120, placeholder: "Fx Sælger, Filmer, Udvikler" })}
          <label>
            <span className={label}>Ansat som</span>
            <select name="kind" value={v.kind} onChange={set("kind")} className={input}>
              {Object.entries(KIND_NAMES).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {field("duties", "Opgaver (står i kontrakten)", { name: "duties", maxLength: 300, placeholder: "Fx at sælge virtuelle rundvisninger til nye kunder og følge op på dem" }, true)}
          <label hidden={Boolean(v.userId)}>
            <span className={label}>Rolle i Arpo (når de får adgang)</span>
            <select name="role" value={v.role} onChange={set("role")} className={input}>
              {roles.map((r) => (
                <option key={r.v} value={r.v}>
                  {r.l}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={label}>Leder (valgfri)</span>
            <select name="managerId" value={v.managerId ?? ""} onChange={set("managerId")} className={input}>
              <option value="">Ingen - admin godkender</option>
              {leaders.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section hidden={step !== 2} className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Hvornår og hvor meget</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {field("startDate", "Første arbejdsdag", { name: "startDate", type: "date" })}
          {field("probationEnd", "Prøvetid til (valgfri)", { name: "probationEnd", type: "date" })}
          {field("endDate", "Sidste dag (kun tidsbegrænset)", { name: "endDate", type: "date" })}
          {!freelance && field("weeklyHours", "Timer om ugen", { name: "weeklyHours", inputMode: "decimal" })}
        </div>
        {!freelance && (
          <div>
            <span className={label}>Arbejdsdage</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {DAYS.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays((x) => (x.includes(i + 1) ? x.filter((y) => y !== i + 1) : [...x, i + 1].sort()))}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${days.includes(i + 1) ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-600"}`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}
        {days.map((d) => (
          <input key={d} type="hidden" name="workDays" value={d} />
        ))}
        {v.kind === "SALARIED" && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="rule120" checked={rule120} onChange={(e) => setRule120(e.target.checked)} /> 120-dages-reglen står i kontrakten
          </label>
        )}
      </section>

      <section hidden={step !== 3} className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Løn</h2>
        {freelance ? (
          <p className="text-sm text-slate-600">Freelancere fakturerer deres provision som i dag.</p>
        ) : (
          <label className="block">
            <span className={label}>Lønmodel</span>
            <select name="payModel" value={v.payModel} onChange={set("payModel")} className={input}>
              {Object.entries(PAY_NAMES)
                .filter(([k]) => k !== "INVOICE")
                .map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
            </select>
          </label>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(model === "MONTHLY" || model === "MONTHLY_COMMISSION") && field("monthly", "Månedsløn (kr.)", { name: "monthly", inputMode: "decimal" })}
          {model === "HOURLY" && field("hourly", "Timeløn (kr.)", { name: "hourly", inputMode: "decimal" })}
          {(model === "MONTHLY_COMMISSION" || model === "COMMISSION_ONLY" || model === "INVOICE") && field("commissionPct", "Provision (%)", { name: "commissionPct", inputMode: "decimal" })}
          {!freelance && field("guarantee", "Garantiløn (kr. om måneden), valgfri", { name: "guarantee", inputMode: "decimal", placeholder: "Fx 5000" })}
          {!freelance && v.guarantee?.trim() && <p className="col-span-2 -mt-1 text-xs text-slate-500">Gælder fra første arbejdsdag. Løn, timer og provision regnes fra garantien, og er de mindre, betales forskellen. Kan ændres og sluttes på kortet under Særlige vilkår.</p>}
          {!freelance && field("pensionEmployeePct", "Pension egen (%), valgfri", { name: "pensionEmployeePct", inputMode: "decimal" })}
          {!freelance && field("pensionEmployerPct", "Pension firma (%), valgfri", { name: "pensionEmployerPct", inputMode: "decimal" })}
        </div>
      </section>

      <section hidden={step !== 4} className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Ser det rigtigt ud?</h2>
        <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {summary.map(([k, val]) => (
            <div key={k} className="flex gap-4 px-4 py-2.5 text-sm">
              <dt className="w-32 shrink-0 text-slate-500">{k}</dt>
              <dd className="text-slate-900">{val}</dd>
            </div>
          ))}
        </dl>
        <fieldset className="space-y-2 rounded-xl border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-900">Kontrakten</legend>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="contractMode" value="later" checked={!signed} onChange={() => setSigned(false)} />
            {v.kind === "SALARIED" ? "Send den til underskrift bagefter (fra kortet)" : "Ingen kontrakt at lægge ind nu"}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="contractMode" value="signed" checked={signed} onChange={() => setSigned(true)} />
            Vi har allerede en underskrevet kontrakt
          </label>
          {signed && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <label>
                <span className={label}>Kontrakten (PDF)</span>
                <input type="file" name="contractFile" accept="application/pdf,.pdf" required className={input} />
              </label>
              <label>
                <span className={label}>Underskrevet den</span>
                <input type="date" name="contractSignedOn" required className={input} />
              </label>
              <p className="col-span-2 text-xs text-slate-500">Den gemmes i Arpo og i Drev. Kun admin og personen selv kan åbne den.</p>
            </div>
          )}
        </fieldset>
        <p className="text-sm text-slate-600">
          Efter oprettelsen viser kortet de næste skridt: {v.kind === "SALARIED" && !signed ? "send kontrakten, vent på underskrift, og " : ""}
          {v.userId ? "personen har allerede adgang til Arpo." : "giv adgang til Arpo med deres arbejds-mail."}
        </p>
      </section>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      <div className="flex gap-2">
        {step > 0 && (
          <button type="button" onClick={() => setStep((s) => s - 1)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
            Tilbage
          </button>
        )}
        {step < STEPS.length - 1 ? (
          // Own keys: without them React turns this very button into the submit one in the middle of the click on the
          // last "Næste", and the browser then sends the form - before the last step is even seen.
          <button key="next" type="button" onClick={next} className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Næste
          </button>
        ) : (
          <button key="create" type="submit" className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Opret medarbejder</button>
        )}
      </div>
    </form>
  );
}
