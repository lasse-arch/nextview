import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceNumberFromFiPaymentId } from "./fi-payment-id";

test("FI payment IDs from Dinero map back to the invoice number", () => {
  // Real ones from Mastercard's 0602 (organisation 63787).
  assert.equal(invoiceNumberFromFiPaymentId("637871716", "63787"), "171");
  assert.equal(invoiceNumberFromFiPaymentId("637871765", "63787"), "176");
  // As printed on a test-company invoice: +71<000000659185326+...
  assert.equal(invoiceNumberFromFiPaymentId("000000659185326", "659185"), "32");
});

test("anything else is not treated as one of our invoices", () => {
  assert.equal(invoiceNumberFromFiPaymentId("637871717", "63787"), null); // wrong check digit
  assert.equal(invoiceNumberFromFiPaymentId("637871716", "12345"), null); // another organisation
  assert.equal(invoiceNumberFromFiPaymentId("637871716", undefined), null);
  assert.equal(invoiceNumberFromFiPaymentId("NV00011", "63787"), null); // a Betalingsservice customer number
});
