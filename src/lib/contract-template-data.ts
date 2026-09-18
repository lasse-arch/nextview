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

export type ContractLanguage = "da" | "en";

export const PRODUCT_LABELS: Record<
  keyof Pick<ContractProducts, "nextviewTour" | "hjemmeside" | "droneOptagelse" | "visitkort">,
  string
> = {
  nextviewTour: "Nextview360 Tour",
  hjemmeside: "Hjemmeside",
  droneOptagelse: "Drone-optagelse",
  visitkort: "Visitkort",
};

/**
 * Only one person ever signs on our side, regardless of which seller owns
 * the deal - the director, not the salesperson (see the contract template's
 * "For leverandør" signature block, which prints this same fixed name).
 */
export const CONTRACT_SIGNER = { name: "Lasse Larsen", email: "info@nextview360.dk" };

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
  language: ContractLanguage;
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

export type ContractHtmlData = {
  client: { company: string; cvr: string; name: string; email: string; phone: string; address: string; zipCity: string };
  seller: { name: string; email: string; phone: string };
  products: {
    nextviewTour: { selected: boolean; setupFee: string; price: string };
    hjemmeside: { selected: boolean; setupFee: string; price: string; hasMonthlyPrice: boolean };
    droneOptagelse: { selected: boolean; setupFee: string };
    visitkort: { selected: boolean; quantity: number; setupFee: string };
  };
  setupPriceTotal: string;
  priceTotal: string;
  additionalTerms: string;
  bindingMonths: number;
  noticeMonths: number;
  /** How many of the 4 products are selected - drives singular/plural wording ("the service" vs "the services"). */
  selectedCount: number;
};

/**
 * Builds the nested data object the HTML contract template (see
 * contract-html-template.ts) renders from. Product prices/quantities come
 * directly from what was explicitly entered on the contract-builder page -
 * not guessed from free-text fields - so what's on the document always
 * matches what's shown there.
 */
export function buildContractHtmlData(deal: DealForContract, products: ContractProducts): ContractHtmlData {
  const { street, zipCity } = splitZipCity(deal.address);
  const displayCompany = deal.displayName || deal.companyName;

  const selectedCount = [
    products.nextviewTour.selected,
    products.hjemmeside.selected,
    products.droneOptagelse.selected,
    products.visitkort.selected,
  ].filter(Boolean).length;

  return {
    client: {
      company: displayCompany,
      cvr: deal.cvrNumber ?? "",
      name: deal.contactName ?? "",
      email: deal.contactEmail ?? "",
      phone: deal.contactPhone ?? "",
      address: street,
      zipCity,
    },
    seller: {
      name: deal.owner.name,
      email: deal.owner.email,
      phone: deal.owner.phone ?? "",
    },
    products: {
      nextviewTour: {
        selected: products.nextviewTour.selected,
        setupFee: formatDKK(products.nextviewTour.setupFee),
        price: formatDKK(products.nextviewTour.price),
      },
      hjemmeside: {
        selected: products.hjemmeside.selected,
        setupFee: formatDKK(products.hjemmeside.setupFee),
        price: formatDKK(products.hjemmeside.price),
        hasMonthlyPrice: products.hjemmeside.price > 0,
      },
      droneOptagelse: {
        selected: products.droneOptagelse.selected,
        setupFee: formatDKK(products.droneOptagelse.setupFee),
      },
      visitkort: {
        selected: products.visitkort.selected,
        quantity: products.visitkort.quantity,
        setupFee: formatDKK(products.visitkort.setupFee),
      },
    },
    setupPriceTotal: formatDKK(computeSetupTotal(products)),
    priceTotal: formatDKK(computeMonthlyTotal(products)),
    additionalTerms: products.additionalTerms,
    bindingMonths: products.bindingMonths,
    noticeMonths: products.noticeMonths,
    selectedCount,
  };
}
