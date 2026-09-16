import { renewContract } from "@/lib/actions/deals";
import { formatDKK, formatDate } from "@/lib/labels";

type Renewal = {
  id: string;
  termNumber: number;
  previousValue: number;
  previousBindingMonths: number;
  newValue: number;
  newBindingMonths: number;
  contractLink: string | null;
  establishmentFee: number | null;
  renewedAt: Date;
};

export function RenewalSection({
  dealId,
  currentTermNumber,
  renewals,
}: {
  dealId: string;
  currentTermNumber: number;
  renewals: Renewal[];
}) {
  const renewContractWithId = renewContract.bind(null, dealId);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Kontrakt-fornyelse</h2>
      <p className="mt-1 text-xs text-slate-500">
        Nuværende kontraktperiode: {currentTermNumber}. En fornyelse starter en ny periode med sit eget
        salgsbeløb, binding og faktura-forløb.
      </p>

      <form action={renewContractWithId} className="mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500">Ny kontraktværdi (DKK) *</label>
            <input
              name="newValue"
              type="number"
              min="1"
              step="1"
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500">Ny bindingsperiode (måneder) *</label>
            <input
              name="newBindingMonths"
              type="number"
              min="1"
              step="1"
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-500">Link til ny kontrakt</label>
            <input
              name="contractLink"
              type="url"
              placeholder="https://…"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500">Etableringspris (DKK)</label>
            <input
              name="establishmentFee"
              type="number"
              min="0"
              step="1"
              placeholder="Valgfri"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Forny kontrakt
        </button>
      </form>

      {renewals.length > 0 && (
        <div className="mt-6 border-t border-slate-100 pt-4">
          <h3 className="text-xs font-semibold text-slate-500">Tidligere fornyelser</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {renewals.map((r) => (
              <li key={r.id} className="rounded-md border border-slate-100 p-2 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Periode {r.termNumber} · {formatDate(r.renewedAt)}</span>
                  {r.contractLink && (
                    <a href={r.contractLink} target="_blank" rel="noreferrer" className="text-slate-900 underline">
                      Se kontrakt
                    </a>
                  )}
                </div>
                <div className="mt-1">
                  {formatDKK(r.previousValue)} / {r.previousBindingMonths} mdr → {formatDKK(r.newValue)} /{" "}
                  {r.newBindingMonths} mdr
                  {r.establishmentFee ? ` · Etablering: ${formatDKK(r.establishmentFee)}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
