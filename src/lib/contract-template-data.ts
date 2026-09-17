import { formatDKK } from "@/lib/labels";

type DealForContract = {
  companyName: string;
  displayName: string | null;
  cvrNumber: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  noticePeriodMonths: number;
  owner: { name: string; email: string; phone: string | null };
};

export type ContractProducts = {
  nextviewTour: { selected: boolean; quantity: number; unitPrice: number };
  hjemmeside: { selected: boolean; setupFee: number; price: number };
  droneOptagelse: { selected: boolean; quantity: number; price: number };
  visitkort: { selected: boolean; quantity: number; price: number };
  bindingMonths: number;
  additionalTerms: string;
};

function splitZipCity(address: string | null): { street: string; zipCity: string } {
  // We only store one free-text address field; the template wants street and
  // "zip/by" separately. If the last line looks like "<digits> <city>" split
  // it off, otherwise leave zip/city blank rather than guessing wrong.
  if (!address) return { street: "", zipCity: "" };
  const match = address.match(/^([\s\S]*?),?\s*(\d{4}\s+[\s\S]+)$/);
  if (match) return { street: match[1].trim(), zipCity: match[2].trim() };
  return { street: address, zipCity: "" };
}

/** Sum of the one-off, engangsbeløb-style costs across the selected products. */
export function computeSetupTotal(p: ContractProducts): number {
  return (p.hjemmeside.selected ? p.hjemmeside.setupFee : 0) +
    (p.droneOptagelse.selected ? p.droneOptagelse.price : 0) +
    (p.visitkort.selected ? p.visitkort.price : 0);
}

/** Sum of the recurring monthly costs across the selected products. */
export function computeMonthlyTotal(p: ContractProducts): number {
  const tourTotal = p.nextviewTour.selected ? p.nextviewTour.quantity * p.nextviewTour.unitPrice : 0;
  return tourTotal + (p.hjemmeside.selected ? p.hjemmeside.price : 0);
}

/**
 * Builds the flat, dot-keyed data object docxtemplater fills the contract
 * template with (see src/contract-templates/nextview360-contract.docx -
 * keys must match its [[Tag]] placeholders exactly; docxtemplater does not
 * do nested-object dot-path resolution by default, hence the flat shape).
 *
 * Product prices/quantities come directly from what was explicitly entered
 * on the contract-builder page - not guessed from free-text fields - so
 * what's on the document always matches what's shown there.
 */
export function buildContractTemplateData(
  deal: DealForContract,
  products: ContractProducts
): Record<string, string | boolean> {
  const { street, zipCity } = splitZipCity(deal.address);
  const displayCompany = deal.displayName || deal.companyName;

  const tourTotal = products.nextviewTour.selected
    ? products.nextviewTour.quantity * products.nextviewTour.unitPrice
    : 0;

  return {
    "Client.Company": displayCompany,
    "Client.CVR": deal.cvrNumber ?? "",
    "Client.Name": deal.contactName ?? "",
    "Client.Email": deal.contactEmail ?? "",
    "Client.Phone": deal.contactPhone ?? "",
    "Client.Address": street,
    "Client.ZipCity": zipCity,

    "Seller.Name": deal.owner.name,
    "Seller.Email": deal.owner.email,
    "Seller.Phone": deal.owner.phone ?? "",

    "Deal.NextviewTour.Selected": products.nextviewTour.selected,
    "Deal.NextviewTour.Quantity": String(products.nextviewTour.quantity),
    "Deal.NextviewTour.UnitPrice": formatDKK(products.nextviewTour.unitPrice),
    "Deal.NextviewTour.Price": formatDKK(tourTotal),

    "Deal.Hjemmeside.Selected": products.hjemmeside.selected,
    "Deal.Hjemmeside.SetupFee": formatDKK(products.hjemmeside.setupFee),
    "Deal.Hjemmeside.Price": formatDKK(products.hjemmeside.price),

    "Deal.DroneOptagelse.Selected": products.droneOptagelse.selected,
    "Deal.DroneOptagelse.Quantity": String(products.droneOptagelse.quantity),
    "Deal.DroneOptagelse.Price": formatDKK(products.droneOptagelse.price),

    "Deal.Visitkort.Selected": products.visitkort.selected,
    "Deal.Visitkort.Quantity": String(products.visitkort.quantity),
    "Deal.Visitkort.Price": formatDKK(products.visitkort.price),

    "Deal.SetupPrice": formatDKK(computeSetupTotal(products)),
    "Deal.Price": formatDKK(computeMonthlyTotal(products)),
    "Deal.AdditionalTerms": products.additionalTerms,
    "Deal.BindingMonths": String(products.bindingMonths),
    "Deal.NoticeMonths": String(deal.noticePeriodMonths),
  };
}
