import { test } from "node:test";
import assert from "node:assert/strict";
import { annualRefilming, contractYear } from "./refilming";

const d = (s: string) => new Date(`${s}T10:00:00Z`);
const products = (locations?: number) => ({
  nextviewTour: { selected: true, setupFee: 5000, price: 500, ...(locations ? { locations: Array.from({ length: locations }, (_, i) => ({ name: `L${i}`, address: "", setupFee: 0, price: 0 })) } : {}) },
  hjemmeside: { selected: false, setupFee: 0, price: 0 },
  droneOptagelse: { selected: false, setupFee: 0 },
  visitkort: { selected: false, setupFee: 0, quantity: 0 },
  bindingMonths: 36,
  noticeMonths: 3,
  additionalTerms: "",
  language: "da",
});

test("the contract year runs from the signing's anniversary", () => {
  const y = contractYear(new Date("2025-03-15T00:00:00Z"), d("2026-11-26"));
  assert.equal(y.from.toISOString().slice(0, 10), "2026-03-15");
  assert.equal(y.to.toISOString().slice(0, 10), "2027-03-15");
  assert.equal(contractYear(new Date("2025-03-15T00:00:00Z"), d("2026-03-01")).from.toISOString().slice(0, 10), "2025-03-15");
});

test("one yearly refilming per location, used in the contract year", () => {
  const deal = { contractProducts: products(), contractSignedAt: new Date("2025-03-15T00:00:00Z") };
  assert.deepEqual(annualRefilming(deal, [], d("2026-11-26"))?.left, 1);
  const used = [{ at: d("2026-05-01"), annual: true, cancelledAt: null }];
  assert.equal(annualRefilming(deal, used, d("2026-11-26"))?.left, 0);
  assert.equal(annualRefilming(deal, used, d("2027-04-01"))?.left, 1); // a new contract year
  assert.equal(annualRefilming(deal, [{ ...used[0], cancelledAt: d("2026-04-01") }], d("2026-11-26"))?.left, 1); // cancelled
  assert.equal(annualRefilming({ ...deal, contractProducts: products(3) }, used, d("2026-11-26"))?.left, 2);
  assert.equal(annualRefilming({ ...deal, contractSignedAt: null }, [], d("2026-11-26")), null);
});
