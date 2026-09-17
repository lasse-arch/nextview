import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { dealName } from "@/lib/labels";
import { ContractBuilderForm } from "./contract-builder-form";
import type { ContractProducts } from "@/lib/contract-template-data";

const EMPTY_PRODUCTS: ContractProducts = {
  nextviewTour: { selected: false, quantity: 1, unitPrice: 0 },
  hjemmeside: { selected: false, setupFee: 0, price: 0 },
  droneOptagelse: { selected: false, quantity: 1, price: 0 },
  visitkort: { selected: false, quantity: 1, price: 0 },
  bindingMonths: 12,
  additionalTerms: "",
};

export default async function NewContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deal = await prisma.deal.findUnique({ where: { id } });
  if (!deal) notFound();

  const initialProducts: ContractProducts = deal.contractProducts
    ? { ...EMPTY_PRODUCTS, ...(deal.contractProducts as unknown as ContractProducts) }
    : { ...EMPTY_PRODUCTS, bindingMonths: deal.bindingMonths ?? 12 };

  return (
    <div>
      <p className="text-sm text-slate-500">
        <Link href={`/deals/${deal.id}`} className="hover:underline">
          ← Tilbage til {dealName(deal)}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Byg kontrakt til {dealName(deal)}</h1>
      <p className="mt-1 text-sm text-slate-500">
        Vælg produkter, priser, binding og eventuelle yderligere betingelser. Kontrakten sendes til{" "}
        <span className="font-medium">{deal.contactEmail}</span> til underskrift, når du sender.
      </p>

      <div className="mt-6 max-w-3xl">
        <ContractBuilderForm dealId={deal.id} initialProducts={initialProducts} />
      </div>
    </div>
  );
}
