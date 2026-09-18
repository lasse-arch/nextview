"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendStandaloneContract, type StandaloneContractCustomer } from "@/lib/actions/standalone-contracts";
import { formatDKK } from "@/lib/labels";
import { computeSetupTotal, computeMonthlyTotal, type ContractProducts } from "@/lib/contract-template-data";

const EMPTY_CUSTOMER: StandaloneContractCustomer = {
  companyName: "",
  displayName: "",
  cvrNumber: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  address: "",
};

const EMPTY_PRODUCTS: ContractProducts = {
  nextviewTour: { selected: false, setupFee: 0, price: 0 },
  hjemmeside: { selected: false, setupFee: 0, price: 0 },
  droneOptagelse: { selected: false, setupFee: 0 },
  visitkort: { selected: false, setupFee: 0, quantity: 1 },
  bindingMonths: 36,
  noticeMonths: 6,
  additionalTerms: "",
  language: "da",
};

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500">{label}</label>
      <input
        type="number"
        min={min}
        step="1"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          const parsed = e.target.value === "" ? 0 : Math.round(parseFloat(e.target.value));
          onChange(Number.isFinite(parsed) ? parsed : 0);
        }}
        onWheel={(e) => e.currentTarget.blur()}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
    </div>
  );
}

function ProductCard({
  title,
  selected,
  onToggle,
  children,
}: {
  title: string;
  selected: boolean;
  onToggle: (selected: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border p-4 ${selected ? "border-slate-300 bg-white" : "border-slate-200 bg-slate-50"}`}>
      <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
        <input type="checkbox" checked={selected} onChange={(e) => onToggle(e.target.checked)} className="shrink-0" />
        <span>{title}</span>
      </div>
      {selected && <div className="mt-3 grid grid-cols-2 gap-3">{children}</div>}
    </div>
  );
}

export function StandaloneContractForm() {
  const router = useRouter();
  const [customer, setCustomer] = useState<StandaloneContractCustomer>(EMPTY_CUSTOMER);
  const [products, setProducts] = useState<ContractProducts>(EMPTY_PRODUCTS);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const monthlyTotal = useMemo(() => computeMonthlyTotal(products), [products]);
  const setupTotal = useMemo(() => computeSetupTotal(products), [products]);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await sendStandaloneContract(customer, products);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/settings/docuseal/standalone-contracts");
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <TextField label="Firmanavn (CVR)" value={customer.companyName} onChange={(v) => setCustomer((c) => ({ ...c, companyName: v }))} />
        <TextField label="Kaldenavn (valgfri)" value={customer.displayName} onChange={(v) => setCustomer((c) => ({ ...c, displayName: v }))} />
        <TextField label="CVR-nummer" value={customer.cvrNumber} onChange={(v) => setCustomer((c) => ({ ...c, cvrNumber: v }))} />
        <TextField label="Adresse" value={customer.address} onChange={(v) => setCustomer((c) => ({ ...c, address: v }))} />
        <TextField label="Kontaktperson" value={customer.contactName} onChange={(v) => setCustomer((c) => ({ ...c, contactName: v }))} />
        <TextField label="E-mail" type="email" value={customer.contactEmail} onChange={(v) => setCustomer((c) => ({ ...c, contactEmail: v }))} />
        <TextField label="Telefon" value={customer.contactPhone} onChange={(v) => setCustomer((c) => ({ ...c, contactPhone: v }))} />
      </div>

      <div className="space-y-3">
        <ProductCard
          title="Nextview360 Tour (360° virtuel rundvisning)"
          selected={products.nextviewTour.selected}
          onToggle={(selected) => setProducts((p) => ({ ...p, nextviewTour: { ...p.nextviewTour, selected } }))}
        >
          <NumberField
            label="Etableringspris (engangs, DKK)"
            value={products.nextviewTour.setupFee}
            onChange={(setupFee) => setProducts((p) => ({ ...p, nextviewTour: { ...p.nextviewTour, setupFee } }))}
          />
          <NumberField
            label="Pris pr. måned (DKK)"
            value={products.nextviewTour.price}
            onChange={(price) => setProducts((p) => ({ ...p, nextviewTour: { ...p.nextviewTour, price } }))}
          />
        </ProductCard>

        <ProductCard
          title="Hjemmeside"
          selected={products.hjemmeside.selected}
          onToggle={(selected) => setProducts((p) => ({ ...p, hjemmeside: { ...p.hjemmeside, selected } }))}
        >
          <NumberField
            label="Etableringspris (engangs, DKK)"
            value={products.hjemmeside.setupFee}
            onChange={(setupFee) => setProducts((p) => ({ ...p, hjemmeside: { ...p.hjemmeside, setupFee } }))}
          />
          <NumberField
            label="Pris pr. måned (DKK)"
            value={products.hjemmeside.price}
            onChange={(price) => setProducts((p) => ({ ...p, hjemmeside: { ...p.hjemmeside, price } }))}
          />
        </ProductCard>

        <ProductCard
          title="Drone-optagelse"
          selected={products.droneOptagelse.selected}
          onToggle={(selected) => setProducts((p) => ({ ...p, droneOptagelse: { ...p.droneOptagelse, selected } }))}
        >
          <NumberField
            label="Etableringspris (engangs, DKK)"
            value={products.droneOptagelse.setupFee}
            onChange={(setupFee) => setProducts((p) => ({ ...p, droneOptagelse: { ...p.droneOptagelse, setupFee } }))}
          />
        </ProductCard>

        <ProductCard
          title="Visitkort med QR-kode"
          selected={products.visitkort.selected}
          onToggle={(selected) => setProducts((p) => ({ ...p, visitkort: { ...p.visitkort, selected } }))}
        >
          <NumberField
            label="Antal"
            value={products.visitkort.quantity}
            onChange={(quantity) => setProducts((p) => ({ ...p, visitkort: { ...p.visitkort, quantity } }))}
            min={1}
          />
          <NumberField
            label="Etableringspris (engangs, DKK)"
            value={products.visitkort.setupFee}
            onChange={(setupFee) => setProducts((p) => ({ ...p, visitkort: { ...p.visitkort, setupFee } }))}
          />
        </ProductCard>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <NumberField
          label="Binding (måneder)"
          value={products.bindingMonths}
          onChange={(bindingMonths) => setProducts((p) => ({ ...p, bindingMonths }))}
          min={1}
        />
        <NumberField
          label="Opsigelsesvarsel (måneder)"
          value={products.noticeMonths}
          onChange={(noticeMonths) => setProducts((p) => ({ ...p, noticeMonths }))}
          min={1}
        />
        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-500">Yderligere betingelser (fritekst, valgfri)</label>
          <textarea
            value={products.additionalTerms}
            onChange={(e) => setProducts((p) => ({ ...p, additionalTerms: e.target.value }))}
            rows={6}
            placeholder="Fritekst - kan sagtens være 100-250 ord, boksen på selve kontrakten vokser automatisk med teksten."
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-500">Kontraktsprog</label>
          <div className="mt-1 flex rounded-md border border-slate-300 text-sm">
            <button
              type="button"
              onClick={() => setProducts((p) => ({ ...p, language: "da" }))}
              className={`flex-1 rounded-l-md px-3 py-2 ${
                products.language === "da" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Dansk
            </button>
            <button
              type="button"
              onClick={() => setProducts((p) => ({ ...p, language: "en" }))}
              className={`flex-1 rounded-r-md px-3 py-2 ${
                products.language === "en" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              English
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-300 bg-slate-50 p-4">
        <h2 className="text-sm font-semibold text-slate-900">Overblik</h2>
        <dl className="mt-2 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-600">Samlet etableringspris (engangs)</dt>
            <dd className="money font-medium text-slate-900">{formatDKK(setupTotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-600">Samlet månedlig pris</dt>
            <dd className="money font-medium text-slate-900">{formatDKK(monthlyTotal)}</dd>
          </div>
        </dl>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={handleSubmit}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Sender…" : "Send kontrakt til underskrift"}
        </button>
      </div>
    </div>
  );
}
