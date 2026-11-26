import { parseContractProducts } from "@/lib/contract-template-data";

/*
 * The contract's yearly refilming: a Nextview360 Tour includes "1 årlig genoptagelse pr. lokation". The year is the
 * contract year - from the day it was signed, a year at a time - so the count starts again on each anniversary.
 */

export type AnnualRefilming = { included: number; used: number; left: number; from: Date; to: Date } | null;

/** The contract year `at` is in: from the anniversary of the signing before it, to the next. */
export function contractYear(signedAt: Date, at: Date): { from: Date; to: Date } {
  const y = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear() + n, d.getUTCMonth(), d.getUTCDate()));
  let n = at.getUTCFullYear() - signedAt.getUTCFullYear();
  if (y(signedAt, n) > at) n--;
  return { from: y(signedAt, Math.max(0, n)), to: y(signedAt, Math.max(0, n) + 1) };
}

/** How many yearly refilmings the contract includes, and how many are used in the contract year `at` is in. */
export function annualRefilming(
  deal: { contractProducts: unknown; contractSignedAt: Date | null },
  refilmings: { at: Date; annual: boolean; cancelledAt: Date | null }[],
  at: Date = new Date()
): AnnualRefilming {
  const p = parseContractProducts(deal.contractProducts);
  if (!p?.nextviewTour?.selected || !deal.contractSignedAt) return null;
  const included = Math.max(1, p.nextviewTour.locations?.length ?? 1);
  const { from, to } = contractYear(deal.contractSignedAt, at);
  const used = refilmings.filter((r) => r.annual && !r.cancelledAt && r.at >= from && r.at < to).length;
  return { included, used, left: Math.max(0, included - used), from, to };
}
