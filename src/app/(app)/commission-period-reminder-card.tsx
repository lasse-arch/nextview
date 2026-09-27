import { formatDKK } from "@/lib/labels";
import type { CommissionPeriodReminder } from "@/lib/commission-period-reminder-data";

const DATE_FORMAT = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "long" });

export function CommissionPeriodReminderCard({ reminder }: { reminder: CommissionPeriodReminder }) {
  const start = new Date(reminder.periodStart);
  const end = new Date(reminder.periodEnd);

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-amber-900">Husk faktura for din provisionsperiode</h2>
      <p className="mt-1 text-sm text-amber-800">
        Din nuværende periode er <span className="font-medium">{DATE_FORMAT.format(start)}</span> til{" "}
        <span className="font-medium">{DATE_FORMAT.format(end)}</span>. Send en faktura for provisionen i
        perioden, tillagt moms.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:w-80">
        <div className="rounded-md bg-white px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Provision</p>
          <p className="money mt-0.5 text-lg font-semibold text-slate-900">{formatDKK(reminder.amount)}</p>
        </div>
        <div className="rounded-md bg-white px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Inkl. moms (25%)</p>
          <p className="money mt-0.5 text-lg font-semibold text-slate-900">{formatDKK(reminder.amountInclVat)}</p>
        </div>
      </div>

      {reminder.deals.length > 0 && (
        <p className="mt-3 text-xs text-amber-700">
          {reminder.deals.map((d) => d.name).join(" · ")}
        </p>
      )}
      {reminder.deals.length === 0 && (
        <p className="mt-3 text-xs text-amber-600">Intet optjent i perioden endnu.</p>
      )}
    </div>
  );
}
