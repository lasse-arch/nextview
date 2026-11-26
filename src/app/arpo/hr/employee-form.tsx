import type { Employee, PayTerms } from "@prisma/client";
import { KIND_NAMES, PAY_NAMES } from "@/lib/hr";
import { input, label } from "./hr-ui";

const DAYS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];
const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const kr = (ore: number | null | undefined) => (ore == null ? "" : String(ore / 100).replace(".", ","));

/** The employment's fields - for a new person and for changing one. */
export function EmploymentFields({ e, leaders }: { e?: Employee; leaders: { id: string; name: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <label className="col-span-2">
        <span className={label}>Ansat som</span>
        <select name="kind" defaultValue={e?.kind ?? "SALARIED"} className={input}>
          {Object.entries(KIND_NAMES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="col-span-2">
        <span className={label}>Stilling</span>
        <input name="title" required defaultValue={e?.title} maxLength={120} className={input} placeholder="Fx Sælger, Filmer, Udvikler" />
      </label>
      <label>
        <span className={label}>Første dag</span>
        <input type="date" name="startDate" required defaultValue={ymd(e?.startDate)} className={input} />
      </label>
      <label>
        <span className={label}>Prøvetid til</span>
        <input type="date" name="probationEnd" defaultValue={ymd(e?.probationEnd)} className={input} />
      </label>
      <label>
        <span className={label}>Sidste dag</span>
        <input type="date" name="endDate" defaultValue={ymd(e?.endDate)} className={input} />
      </label>
      <label>
        <span className={label}>Timer om ugen</span>
        <input name="weeklyHours" inputMode="decimal" defaultValue={e ? String(e.weeklyMinutes / 60).replace(".", ",") : "37"} className={input} />
      </label>
      <div className="col-span-2">
        <span className={label}>Arbejdsdage</span>
        <div className="mt-1.5 flex flex-wrap gap-3">
          {DAYS.map((d, i) => (
            <label key={d} className="flex items-center gap-1 text-sm text-slate-700">
              <input type="checkbox" name="workDays" value={i + 1} defaultChecked={(e?.workDays ?? [1, 2, 3, 4, 5]).includes(i + 1)} /> {d}
            </label>
          ))}
        </div>
      </div>
      <label>
        <span className={label}>Leder (valgfri)</span>
        <select name="managerId" defaultValue={e?.managerId ?? ""} className={input}>
          <option value="">Ingen - admin godkender</option>
          {leaders.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className={label}>Nr. i lønsystemet</span>
        <input name="payrollNumber" defaultValue={e?.payrollNumber ?? ""} maxLength={40} className={input} />
      </label>
      <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700 sm:col-span-4">
        <input type="checkbox" name="rule120" defaultChecked={e ? e.rule120 : true} /> 120-dages-reglen står i kontrakten (funktionærer) - HR tæller sygedagene og advarer fra dag 100
      </label>
      <label className="col-span-2 sm:col-span-4">
        <span className={label}>Opgaver (står i kontrakten)</span>
        <input name="duties" defaultValue={e?.duties ?? ""} maxLength={300} className={input} placeholder="Fx at sælge virtuelle rundvisninger til nye kunder og følge op på dem" />
      </label>
      <label className="col-span-2 sm:col-span-4">
        <span className={label}>Note</span>
        <textarea name="note" defaultValue={e?.note ?? ""} maxLength={2000} rows={2} className={input} />
      </label>
      <p className="col-span-2 text-xs text-slate-500 sm:col-span-4">CPR-nummer og bankkonto skrives kun i lønsystemet, aldrig her. Freelancere registrerer ikke arbejdstid og har ikke ferie i HR.</p>
    </div>
  );
}

/** Pay from a date. */
export function PayFields({ p, withDate }: { p?: PayTerms; withDate?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {withDate && (
        <label>
          <span className={label}>Gælder fra</span>
          <input type="date" name="effectiveFrom" required className={input} />
        </label>
      )}
      <label className={withDate ? "" : "col-span-2"}>
        <span className={label}>Lønmodel</span>
        <select name="payModel" defaultValue={p?.model ?? "MONTHLY"} className={input}>
          {Object.entries(PAY_NAMES)
            .filter(([k]) => k !== "INVOICE")
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
        </select>
      </label>
      <label>
        <span className={label}>Månedsløn (kr.)</span>
        <input name="monthly" inputMode="decimal" defaultValue={kr(p?.monthlyOre)} className={input} />
      </label>
      <label>
        <span className={label}>Timeløn (kr.)</span>
        <input name="hourly" inputMode="decimal" defaultValue={kr(p?.hourlyOre)} className={input} />
      </label>
      <label>
        <span className={label}>Provision (%)</span>
        <input name="commissionPct" inputMode="decimal" defaultValue={p?.commissionPct ?? ""} className={input} />
      </label>
      <label>
        <span className={label}>Pension egen (%)</span>
        <input name="pensionEmployeePct" inputMode="decimal" defaultValue={p?.pensionEmployeePct ?? ""} className={input} />
      </label>
      <label>
        <span className={label}>Pension firma (%)</span>
        <input name="pensionEmployerPct" inputMode="decimal" defaultValue={p?.pensionEmployerPct ?? ""} className={input} />
      </label>
      <label className="col-span-2">
        <span className={label}>Note om lønnen</span>
        <input name="payNote" maxLength={500} defaultValue={p?.note ?? ""} className={input} />
      </label>
      <p className="col-span-2 text-xs text-slate-500 sm:col-span-4">Freelancere får altid &quot;Faktura&quot; - provisionen udbetales mod faktura som i dag. Kun provision: feriepenge (12,5 %) beregnes af lønsystemet.</p>
    </div>
  );
}
