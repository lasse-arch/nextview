import type { PayTerms } from "@prisma/client";
import { formatDKK } from "@/lib/labels";
import { PAY_NAMES } from "@/lib/hr";
import { fmtDate } from "./hr-ui";

/** The pay in words - only rendered for someone who may see it (lib/hr-access.ts maySeePay). */
export function PayLine({ p }: { p: PayTerms }) {
  const parts = [
    PAY_NAMES[p.model],
    p.monthlyOre != null ? `${formatDKK(p.monthlyOre / 100)} om måneden` : null,
    p.hourlyOre != null ? `${formatDKK(p.hourlyOre / 100)} i timen` : null,
    p.commissionPct != null ? `${String(p.commissionPct).replace(".", ",")} % provision` : null,
    p.pensionEmployeePct != null || p.pensionEmployerPct != null
      ? `pension ${String(p.pensionEmployeePct ?? 0).replace(".", ",")} % + ${String(p.pensionEmployerPct ?? 0).replace(".", ",")} % fra firmaet`
      : null,
  ].filter(Boolean);
  return (
    <div className="text-sm">
      <span className="font-medium text-slate-900">{parts.join(", ")}</span>
      <span className="block text-xs text-slate-500">
        Fra {fmtDate(p.effectiveFrom)}
        {p.note ? ` - ${p.note}` : ""}
      </span>
    </div>
  );
}
