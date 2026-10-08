import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBsReturnDelivery } from "./bs-returns";

/** Builds a 128-char record from [position, value] pairs (1-based). */
function rec(parts: [number, string][]): string {
  const chars = Array(128).fill(" ");
  for (const [pos, value] of parts) for (let i = 0; i < value.length; i++) chars[pos - 1 + i] = value[i];
  return chars.join("");
}
const start = (type: string) => rec([[1, "BS002"], [6, "12345678"], [14, "BS1"], [17, type], [21, "0000000001"], [50, "011126"]]);
const sectionStart = (no: string) => rec([[1, "BS012"], [6, "87654321"], [14, no], [18, "000"], [21, "00001"], [50, "011126"]]);
const end = (type: string, n042: number) =>
  rec([[1, "BS992"], [6, "12345678"], [14, "BS1"], [17, type], [21, "00000000001"], [32, String(n042).padStart(11, "0")]]);

test("BS 0602: automatic payment completed and payment slip completed", () => {
  const file = [
    start("0602"),
    sectionStart("0211"),
    rec([[1, "BS042"], [6, "87654321"], [14, "0236"], [18, "000"], [21, "00001"], [26, "1001"], [41, "123456789"], [50, "011126"], [56, "1"], [57, "0000001500000"], [70, "INV-abc123"], [104, "031126"], [110, "031126"], [116, "0000001500000"]]),
    rec([[1, "BS042"], [6, "87654321"], [14, "0237"], [18, "000"], [21, "00001"], [26, "1003"], [41, "123456790"], [50, "011126"], [56, "1"], [57, "0000000899700"], [70, "INV-def"], [104, "000000"], [110, "000000"], [116, "0000000000000"]]),
    sectionStart("0215"),
    rec([[1, "BS042"], [6, "87654321"], [14, "0297"], [18, "000"], [21, "00001"], [26, "0000"], [30, "1002"], [45, "71"], [47, "0"], [48, "00000"], [53, "011126"], [59, "1"], [60, "0000000899700"], [73, "A00000042"], [82, "0".repeat(22)], [104, "051126"], [110, "061126"], [116, "0000000899700"]]),
    end("0602", 3),
  ].join("\r\n");

  const d = parseBsReturnDelivery(file);
  assert.equal(d.deliveryType, "0602");
  assert.equal(d.payments.length, 3);
  const [auto, rejected, slip] = d.payments;
  assert.equal(auto.outcome, "PAID");
  assert.equal(auto.channel, "automatic");
  assert.equal(auto.customerNumber, "1001");
  assert.equal(auto.mandateNumber, "123456789");
  assert.equal(auto.amountOre, 1500000);
  assert.equal(auto.reference, "INV-abc123");
  assert.equal(auto.paymentDate?.toISOString().slice(0, 10), "2026-11-03");
  assert.equal(rejected.outcome, "REJECTED");
  assert.equal(rejected.paymentDate, null, "rejected before due date: dates are 0");
  assert.equal(slip.outcome, "PAID");
  assert.equal(slip.channel, "slip");
  assert.equal(slip.customerNumber, "1002");
  assert.equal(slip.reference, "A00000042");
  assert.equal(slip.paidAmountOre, 899700);
});

test("BS 0603: zero-padded customer numbers, as Mastercard really returns them", () => {
  const file = [
    start("0603"),
    sectionStart("0212"),
    rec([[1, "BS042"], [6, "87654321"], [14, "0230"], [18, "000"], [21, "00001"], [26, "00000000TEST001"], [41, "123456789"], [50, "201026"], [56, "000000"]]),
    rec([[1, "BS042"], [6, "87654321"], [14, "0230"], [18, "000"], [21, "00001"], [26, "00000000NV00012"], [41, "123456790"], [50, "201026"], [56, "000000"]]),
    end("0603", 2),
  ].join("\n");
  assert.deepEqual(parseBsReturnDelivery(file).mandates.map((m) => m.customerNumber), ["TEST001", "NV00012"]);
});

test("BS 0603: registered and cancelled mandates", () => {
  const file = [
    start("0603"),
    sectionStart("0212"),
    rec([[1, "BS042"], [6, "87654321"], [14, "0231"], [18, "000"], [21, "00001"], [26, "1001"], [41, "123456789"], [50, "201026"], [56, "000000"]]),
    rec([[1, "BS042"], [6, "87654321"], [14, "0232"], [18, "000"], [21, "00001"], [26, "1004"], [41, "123456700"], [50, "211026"], [56, "311026"]]),
    end("0603", 2),
  ].join("\n");
  const d = parseBsReturnDelivery(file);
  assert.equal(d.deliveryType, "0603");
  assert.deepEqual(d.mandates.map((m) => [m.event, m.customerNumber, m.mandateNumber]), [
    ["REGISTERED", "1001", "123456789"],
    ["CANCELLED_BY_BANK", "1004", "123456700"],
  ]);
  assert.equal(d.mandates[0].endDate, null);
  assert.equal(d.mandates[1].endDate?.toISOString().slice(0, 10), "2026-10-31");
});

test("rejects incomplete or unexpected files", () => {
  assert.throws(() => parseBsReturnDelivery("hello"), /BS002/);
  assert.throws(() => parseBsReturnDelivery([start("0601"), end("0601", 0)].join("\n")), /understøttes ikke/);
  assert.throws(
    () => parseBsReturnDelivery([start("0603"), sectionStart("0212"), end("0603", 1)].join("\n")),
    /ufuldstændig/
  );
});
