import { formatDKK } from "@/lib/labels";

type DealItemLike = { productType: string; amount: number | null };

type DealForContract = {
  companyName: string;
  displayName: string | null;
  cvrNumber: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  soldProduct: string | null;
  saleAmount: number | null;
  bindingMonths: number | null;
  establishmentFee: number | null;
  noticePeriodMonths: number;
  items: DealItemLike[];
  owner: { name: string; email: string; phone: string | null };
};

/** Maps our free-text product names/keywords onto the template's 4 fixed product blocks. */
const PRODUCT_MATCHERS: Record<string, string> = {
  matterport: "NextviewTour",
  tour: "NextviewTour",
  hjemmeside: "Hjemmeside",
  drone: "DroneOptagelse",
  visitkort: "Visitkort",
};

function matchProductKey(productType: string): string | null {
  const normalized = productType.trim().toLowerCase();
  for (const [needle, key] of Object.entries(PRODUCT_MATCHERS)) {
    if (normalized.includes(needle)) return key;
  }
  return null;
}

function splitZipCity(address: string | null): { street: string; zipCity: string } {
  // We only store one free-text address field; the template wants street and
  // "zip/by" separately. If the last line looks like "<digits> <city>" split
  // it off, otherwise leave zip/city blank rather than guessing wrong.
  if (!address) return { street: "", zipCity: "" };
  const match = address.match(/^([\s\S]*?),?\s*(\d{4}\s+[\s\S]+)$/);
  if (match) return { street: match[1].trim(), zipCity: match[2].trim() };
  return { street: address, zipCity: "" };
}

/**
 * Builds the flat, dot-keyed data object docxtemplater fills the contract
 * template with (see src/contract-templates/nextview360-contract.docx -
 * keys must match its {Tag} placeholders exactly; docxtemplater does not do
 * nested-object dot-path resolution by default, hence the flat shape here).
 *
 * Per-product Quantity/Price figures are itemized from DealItem when
 * present (the precise source), and fall back to the deal's own
 * saleAmount/establishmentFee for the simple single-product case. The two
 * headline totals (Deal.Price / Deal.SetupPrice) always come straight from
 * the deal's own billing fields - the same numbers Dinero invoices from -
 * regardless of how the per-product breakdown above them is estimated.
 */
export function buildContractTemplateData(deal: DealForContract): Record<string, string | boolean> {
  const itemsByProduct = new Map<string, DealItemLike[]>();
  for (const item of deal.items) {
    const key = matchProductKey(item.productType);
    if (!key) continue;
    itemsByProduct.set(key, [...(itemsByProduct.get(key) ?? []), item]);
  }

  const soldProductLower = (deal.soldProduct ?? "").toLowerCase();
  const hasAnyItems = deal.items.length > 0;

  function productBlock(key: string, matchWord: string) {
    const items = itemsByProduct.get(key) ?? [];
    const selected = items.length > 0 || (!hasAnyItems && soldProductLower.includes(matchWord));
    const quantity = items.length > 0 ? items.length : selected ? 1 : 0;
    const total = items.length > 0 ? items.reduce((sum, i) => sum + (i.amount ?? 0), 0) : selected ? deal.saleAmount ?? 0 : 0;
    const unit = quantity > 0 ? Math.round(total / quantity) : 0;
    return { selected, quantity, total, unit };
  }

  const tour = productBlock("NextviewTour", "matterport");
  const site = productBlock("Hjemmeside", "hjemmeside");
  const drone = productBlock("DroneOptagelse", "drone");
  const cards = productBlock("Visitkort", "visitkort");

  const { street, zipCity } = splitZipCity(deal.address);
  const displayCompany = deal.displayName || deal.companyName;

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

    "Deal.NextviewTour.Selected": tour.selected,
    "Deal.NextviewTour.Quantity": String(tour.quantity),
    "Deal.NextviewTour.UnitPrice": formatDKK(tour.unit),
    "Deal.NextviewTour.Price": formatDKK(tour.total),

    "Deal.Hjemmeside.Selected": site.selected,
    "Deal.Hjemmeside.SetupFee": formatDKK(site.selected ? deal.establishmentFee ?? 0 : 0),
    "Deal.Hjemmeside.Price": formatDKK(site.total),

    "Deal.DroneOptagelse.Selected": drone.selected,
    "Deal.DroneOptagelse.Quantity": String(drone.quantity),
    "Deal.DroneOptagelse.Price": formatDKK(drone.total),

    "Deal.Visitkort.Selected": cards.selected,
    "Deal.Visitkort.Quantity": String(cards.quantity),
    "Deal.Visitkort.Price": formatDKK(cards.total),

    "Deal.SetupPrice": formatDKK(deal.establishmentFee ?? 0),
    "Deal.Price": formatDKK(deal.saleAmount ?? 0),
    "Deal.AdditionalTerms": "",
    "Deal.BindingMonths": String(deal.bindingMonths ?? ""),
    "Deal.NoticeMonths": String(deal.noticePeriodMonths),
  };
}
