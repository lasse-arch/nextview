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

/** English product names, matching the wording used in the English contract
 * template (contract-html-template.ts) - used for invoice line items when
 * the deal's contract was sent in English (see buildInvoiceContent). */
export const PRODUCT_LABELS_EN: Record<keyof typeof PRODUCT_LABELS, string> = {
  nextviewTour: "Nextview360 Tour",
  hjemmeside: "Nextview360 Website",
  droneOptagelse: "Drone Footage",
  visitkort: "Business Cards",
};

/**
 * Only one person ever signs on our side, regardless of which seller owns
 * the deal - the director, not the salesperson (see the contract template's
 * "For leverandør" signature block, which prints this same fixed name).
 */
export const CONTRACT_SIGNER = { name: "Victor Emil Rasmussen", email: "info@nextview360.dk" };

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

/** Loosely validates and casts the deal's stored contractProducts JSON back to ContractProducts. */
export function parseContractProducts(json: unknown): ContractProducts | null {
  if (!json || typeof json !== "object") return null;
  const p = json as Partial<ContractProducts>;
  if (!p.nextviewTour && !p.hjemmeside && !p.droneOptagelse && !p.visitkort) return null;
  // A contract built before a product type existed in the schema (e.g.
  // visitkort was added later) is missing that key entirely, not just
  // unselected - defaulting it to "not selected" here means the products
  // that ARE present still get itemized, instead of discarding the whole
  // snapshot and falling back to one flat, unitemized line.
  return {
    ...p,
    nextviewTour: p.nextviewTour ?? { selected: false, setupFee: 0, price: 0 },
    hjemmeside: p.hjemmeside ?? { selected: false, setupFee: 0, price: 0 },
    droneOptagelse: p.droneOptagelse ?? { selected: false, setupFee: 0 },
    visitkort: p.visitkort ?? { selected: false, setupFee: 0, quantity: 0 },
  } as ContractProducts;
}

/** Splits `total` across `weights` proportionally, absorbing the rounding remainder into the last share. */
function distributeByWeights(total: number, weights: number[]): number[] {
  const sumWeights = weights.reduce((s, w) => s + w, 0);
  if (sumWeights <= 0) return weights.map(() => 0);
  const amounts = weights.map((w) => Math.floor((total * w) / sumWeights));
  const allocated = amounts.reduce((s, a) => s + a, 0);
  amounts[amounts.length - 1] += total - allocated;
  return amounts;
}

export type InvoiceLineItem = { description: string; amount: number };

/**
 * One invoice line per selected product's one-off setup fee, itemizing the
 * establishment invoice instead of one lump "Etableringsgebyr" line. Scaled
 * to sum exactly to `total` (normally already equal to it) so the invoice
 * total never drifts from the setup fees' rounding.
 */
export function establishmentLineItems(
  products: ContractProducts,
  total: number,
  language: ContractLanguage = "da"
): InvoiceLineItem[] {
  const labels = language === "en" ? PRODUCT_LABELS_EN : PRODUCT_LABELS;
  const entries: { label: string; setupFee: number }[] = [];
  if (products.nextviewTour.selected) entries.push({ label: labels.nextviewTour, setupFee: products.nextviewTour.setupFee });
  if (products.hjemmeside.selected) entries.push({ label: labels.hjemmeside, setupFee: products.hjemmeside.setupFee });
  if (products.droneOptagelse.selected) entries.push({ label: labels.droneOptagelse, setupFee: products.droneOptagelse.setupFee });
  if (products.visitkort.selected) entries.push({ label: labels.visitkort, setupFee: products.visitkort.setupFee });

  if (entries.length === 0) return [{ description: language === "en" ? "Setup fee" : "Etableringsgebyr", amount: total }];

  // Weight only by an actual (positive) setup fee, so a free product's line
  // stays exactly 0 kr instead of being given a phantom share of the
  // rounding remainder. Splitting the remainder among just the paid entries
  // (rather than distributeByWeights over all of them) also keeps it off a
  // free entry purely because it happens to sit last in the list. Falls back
  // to an even split across all of them only if none has a positive fee at
  // all but the invoice total is still non-zero (e.g. a manually overridden
  // establishment fee).
  const paidIndexes = entries.flatMap((e, i) => (e.setupFee > 0 ? [i] : []));
  const amounts = entries.map(() => 0);
  if (paidIndexes.length > 0) {
    const paidAmounts = distributeByWeights(total, paidIndexes.map((i) => entries[i].setupFee));
    paidIndexes.forEach((idx, j) => (amounts[idx] = paidAmounts[j]));
  } else {
    distributeByWeights(total, entries.map(() => 1)).forEach((a, i) => (amounts[i] = a));
  }

  return entries.map((e, i) => ({ description: e.label, amount: amounts[i] }));
}

export function allSelectedProductLabels(products: ContractProducts, language: ContractLanguage = "da"): string[] {
  const productLabels = language === "en" ? PRODUCT_LABELS_EN : PRODUCT_LABELS;
  const labels: string[] = [];
  if (products.nextviewTour.selected) labels.push(productLabels.nextviewTour);
  if (products.hjemmeside.selected) labels.push(productLabels.hjemmeside);
  if (products.droneOptagelse.selected) labels.push(productLabels.droneOptagelse);
  if (products.visitkort.selected) labels.push(productLabels.visitkort);
  return labels;
}

/** Only nextviewTour and hjemmeside recur monthly - see ContractProducts' own docs. */
/**
 * Only nextviewTour and hjemmeside can recur monthly at all - but a selected
 * one still counts here even priced at 0/month. Showing a free product as
 * its own zero-kroner line (rather than silently dropping it) makes the
 * value the customer's getting visible on the invoice, which is more
 * "sælgende" than just not mentioning it.
 */
export function recurringProductLabels(products: ContractProducts, language: ContractLanguage = "da"): string[] {
  const productLabels = language === "en" ? PRODUCT_LABELS_EN : PRODUCT_LABELS;
  const labels: string[] = [];
  if (products.nextviewTour.selected) labels.push(productLabels.nextviewTour);
  if (products.hjemmeside.selected) labels.push(productLabels.hjemmeside);
  return labels;
}

/** One invoice line per recurring product (even a free one, at 0 kr), proportional to its share of the combined monthly price. */
export function recurringLineItems(
  products: ContractProducts,
  total: number,
  language: ContractLanguage = "da"
): InvoiceLineItem[] {
  const productLabels = language === "en" ? PRODUCT_LABELS_EN : PRODUCT_LABELS;
  const entries: { label: string; price: number }[] = [];
  if (products.nextviewTour.selected) entries.push({ label: productLabels.nextviewTour, price: products.nextviewTour.price });
  if (products.hjemmeside.selected) entries.push({ label: productLabels.hjemmeside, price: products.hjemmeside.price });
  if (entries.length === 0) return [];

  const amounts = distributeByWeights(total, entries.map((e) => e.price));
  return entries.map((e, i) => ({ description: e.label, amount: amounts[i] }));
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

  const selectedCount = [
    products.nextviewTour.selected,
    products.hjemmeside.selected,
    products.droneOptagelse.selected,
    products.visitkort.selected,
  ].filter(Boolean).length;

  return {
    client: {
      // Always the real, CVR-registered company name - never the internal
      // "kaldenavn" (displayName), which is a shorthand for the CRM's own
      // UI and not a legally valid party name for a contract, just like the
      // supplier side always reads "Nextview360 ApS", not some nickname.
      company: deal.companyName,
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
