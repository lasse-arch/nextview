import { formatDKK } from "@/lib/labels";

type DealForContract = {
  companyName: string;
  displayName: string | null;
  cvrNumber: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  owner: { name: string; email: string; phone: string | null };
};

type SetupAndMonthly = { selected: boolean; setupFee: number; price: number };
type SetupOnly = { selected: boolean; setupFee: number };
type SetupAndQuantity = { selected: boolean; setupFee: number; quantity: number };

/**
 * Every product always has an etableringspris (one-off setup fee) - only
 * hjemmeside and nextviewTour also recur monthly, and only visitkort also
 * has a quantity. Whether a product counts at all is purely the `selected`
 * checkbox - an unchecked product's numbers are ignored regardless of what's
 * still sitting in its fields.
 */
export type ContractProducts = {
  nextviewTour: SetupAndMonthly;
  hjemmeside: SetupAndMonthly;
  droneOptagelse: SetupOnly;
  visitkort: SetupAndQuantity;
  bindingMonths: number;
  noticeMonths: number;
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

/** Sum of the one-off etableringspris across the selected products. */
export function computeSetupTotal(p: ContractProducts): number {
  return (
    (p.nextviewTour.selected ? p.nextviewTour.setupFee : 0) +
    (p.hjemmeside.selected ? p.hjemmeside.setupFee : 0) +
    (p.droneOptagelse.selected ? p.droneOptagelse.setupFee : 0) +
    (p.visitkort.selected ? p.visitkort.setupFee : 0)
  );
}

/** Sum of the recurring monthly costs across the selected products. */
export function computeMonthlyTotal(p: ContractProducts): number {
  return (p.nextviewTour.selected ? p.nextviewTour.price : 0) + (p.hjemmeside.selected ? p.hjemmeside.price : 0);
}

/**
 * One "Ydelser" line per selected product, so as the customer base grows we
 * can see at a glance which customers have which products - including ones
 * given away for free, which still need to show up here (just flagged, not
 * priced), not just the ones that generate revenue.
 */
export function contractProductsToDealItems(
  p: ContractProducts
): { productType: string; amount: number; isFree: boolean }[] {
  const items: { productType: string; amount: number; isFree: boolean }[] = [];
  if (p.nextviewTour.selected) {
    items.push({ productType: "Nextview360 Tour", amount: p.nextviewTour.price, isFree: p.nextviewTour.price === 0 });
  }
  if (p.hjemmeside.selected) {
    items.push({ productType: "Hjemmeside", amount: p.hjemmeside.price, isFree: p.hjemmeside.price === 0 });
  }
  if (p.droneOptagelse.selected) {
    items.push({
      productType: "Drone-optagelse",
      amount: p.droneOptagelse.setupFee,
      isFree: p.droneOptagelse.setupFee === 0,
    });
  }
  if (p.visitkort.selected) {
    items.push({ productType: "Visitkort", amount: p.visitkort.setupFee, isFree: p.visitkort.setupFee === 0 });
  }
  return items;
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

  const selectedCount = [
    products.nextviewTour.selected,
    products.hjemmeside.selected,
    products.droneOptagelse.selected,
    products.visitkort.selected,
  ].filter(Boolean).length;
  const isSingle = selectedCount <= 1;

  return {
    "Deal.DenDe": isSingle ? "den" : "de",
    "Deal.Ydelse": isSingle ? "ydelse" : "ydelser",
    "Deal.YdelseCap": isSingle ? "Ydelsen" : "Ydelserne",
    "Deal.DensDeres": isSingle ? "dens" : "deres",

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
    "Deal.NextviewTour.SetupFee": formatDKK(products.nextviewTour.setupFee),
    "Deal.NextviewTour.Price": formatDKK(products.nextviewTour.price),

    "Deal.Hjemmeside.Selected": products.hjemmeside.selected,
    "Deal.Hjemmeside.SetupFee": formatDKK(products.hjemmeside.setupFee),
    "Deal.Hjemmeside.Price": formatDKK(products.hjemmeside.price),

    "Deal.DroneOptagelse.Selected": products.droneOptagelse.selected,
    "Deal.DroneOptagelse.SetupFee": formatDKK(products.droneOptagelse.setupFee),

    "Deal.Visitkort.Selected": products.visitkort.selected,
    "Deal.Visitkort.Quantity": String(products.visitkort.quantity),
    "Deal.Visitkort.SetupFee": formatDKK(products.visitkort.setupFee),

    "Deal.SetupPrice": formatDKK(computeSetupTotal(products)),
    "Deal.Price": formatDKK(computeMonthlyTotal(products)),
    "Deal.AdditionalTerms": products.additionalTerms,
    "Deal.BindingMonths": String(products.bindingMonths),
    "Deal.NoticeMonths": String(products.noticeMonths),
  };
}
