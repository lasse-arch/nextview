import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBs0601, normalizeCustomerNumber, wrapTextLines } from "./bs0601";
import { decodeDelivery, field, RECORD_LENGTH } from "./fixed-width";

const config = {
  dataSupplierNumber: "12345678",
  subsystem: "BS1",
  pbsNumber: "87654321",
  debtorGroupNumber: "00001",
  deliveryId: 42,
  mainText: "Nextview360",
  creationDate: new Date("2026-10-05T10:00:00Z"),
};
const due = new Date("2026-11-01T00:00:00+01:00");

const collection = {
  customerNumber: "1001",
  nameAndAddressLines: ["Askov Højskole", "Maltvej 1"],
  postalCode: "6600",
  cvrNumber: "12345678",
  dueDate: due,
  amountOre: 1500000,
  reference: "INV-abc123",
  textLines: ["Nextview360 Tour - 4. kvartal 2026", "Beløb inkl. moms: 15.000,00 kr."],
};

test("every record is 128 characters and the file ends with CR-LF", () => {
  const { records, file } = buildBs0601(config, [collection]);
  for (const r of records) assert.equal(r.length, RECORD_LENGTH);
  const text = file.toString("latin1");
  assert.ok(text.endsWith("\r\n"));
  assert.ok(!/ \r\n/.test(text), "trailing spaces must be removed");
  assert.ok(text.includes("Askov Højskole"), "ø survives as ISO 8859-1");
  assert.equal(file.includes(Buffer.from("Højskole", "latin1")), true);
});

test("start, section and end records follow tables 12, 13, 20 and 28", () => {
  const { records } = buildBs0601(config, [collection]);
  const [start, section] = records;
  assert.equal(field(start, 1, 5), "BS002");
  assert.equal(field(start, 6, 13), "12345678");
  assert.equal(field(start, 14, 16), "BS1");
  assert.equal(field(start, 17, 20), "0601");
  assert.equal(field(start, 21, 30), "0000000042");
  assert.equal(field(start, 50, 55), "051026");

  assert.equal(field(section, 1, 5), "BS012");
  assert.equal(field(section, 6, 13), "87654321");
  assert.equal(field(section, 14, 17), "0112");
  assert.equal(field(section, 23, 27), "00001");
  assert.equal(field(section, 69, 128).trim(), "Nextview360");

  const sectionEnd = records.at(-2)!;
  assert.equal(field(sectionEnd, 1, 5), "BS092");
  assert.equal(field(sectionEnd, 14, 17), "0112");
  assert.equal(Number(field(sectionEnd, 32, 42)), 1, "one 042 record");
  assert.equal(Number(field(sectionEnd, 43, 57)), 1500000, "amount total in øre");
  assert.equal(Number(field(sectionEnd, 58, 68)), 2, "two 052 text records");
  assert.equal(Number(field(sectionEnd, 84, 94)), 4, "name + address + postcode + CVR = four 022 records");

  const end = records.at(-1)!;
  assert.equal(field(end, 1, 5), "BS992");
  assert.equal(field(end, 17, 20), "0601");
  assert.equal(Number(field(end, 21, 31)), 1, "one section");
  assert.equal(Number(field(end, 32, 42)), 1);
  assert.equal(Number(field(end, 43, 57)), 1500000);
  assert.equal(Number(field(end, 84, 94)), 4);
});

test("022, 042 and 052 records follow tables 14-18", () => {
  const { records } = buildBs0601(config, [collection]);
  const r022 = records.filter((r) => r.startsWith("BS022"));
  assert.deepEqual(r022.map((r) => field(r, 18, 22)), ["00001", "00002", "00009", "00010"]);
  for (const r of r022) {
    assert.equal(field(r, 14, 17), "0240");
    assert.equal(field(r, 28, 42), "1001           ");
  }
  assert.equal(field(r022[0], 52, 86).trim(), "Askov Højskole");
  assert.equal(field(r022[1], 52, 86).trim(), "Maltvej 1");
  assert.equal(field(r022[2], 67, 70), "6600");
  assert.equal(field(r022[2], 71, 73), "DK ");
  assert.equal(field(r022[3], 83, 92), "0012345678");

  const r042 = records.find((r) => r.startsWith("BS042"))!;
  assert.equal(field(r042, 14, 17), "0280");
  assert.equal(field(r042, 18, 22), "00000");
  assert.equal(field(r042, 43, 51), "000000000", "no mandate yet -> payment slip");
  assert.equal(field(r042, 52, 59), "01112026");
  assert.equal(field(r042, 60, 60), "1");
  assert.equal(field(r042, 61, 73), "0000001500000");
  assert.equal(field(r042, 74, 103).trim(), "INV-abc123");
  assert.equal(field(r042, 104, 105), "00");

  const r052 = records.filter((r) => r.startsWith("BS052"));
  assert.deepEqual(r052.map((r) => field(r, 18, 22)), ["00001", "00002"]);
  assert.equal(field(r052[0], 14, 17), "0241");
  assert.equal(field(r052[0], 53, 112).trim(), "Nextview360 Tour - 4. kvartal 2026");
});

test("a mandate number is carried on the 042 and 052 records", () => {
  const { records } = buildBs0601(config, [{ ...collection, mandateNumber: "123456789" }]);
  assert.equal(field(records.find((r) => r.startsWith("BS042"))!, 43, 51), "123456789");
  assert.equal(field(records.find((r) => r.startsWith("BS052"))!, 43, 51), "123456789");
});

test("totals add up across several collections", () => {
  const { records, totals } = buildBs0601(config, [
    collection,
    { ...collection, customerNumber: "1002", cvrNumber: null, amountOre: 899700 },
  ]);
  assert.equal(totals.collections, 2);
  assert.equal(totals.amountOre, 2399700);
  assert.equal(Number(field(records.at(-1)!, 43, 57)), 2399700);
  assert.equal(Number(field(records.at(-1)!, 84, 94)), 7, "4 + 3 (no CVR record)");
});

test("rejects what Betalingsservice would reject", () => {
  assert.throws(() => buildBs0601(config, [collection, { ...collection }]), /mere end én opkrævning/);
  assert.throws(() => buildBs0601(config, [{ ...collection, nameAndAddressLines: ["Kun navn"] }]), /mindst være 2 linjer/);
  assert.throws(() => buildBs0601(config, [{ ...collection, postalCode: "" }]), /postnummer/);
  assert.throws(() => buildBs0601(config, [{ ...collection, amountOre: 0 }]), /Ugyldigt beløb/);
  assert.throws(() => buildBs0601(config, [{ ...collection, dueDate: new Date(Date.now() + 120 * 864e5) }]), /90 dage/);
  assert.throws(() => normalizeCustomerNumber("A&B"), /mellemrum eller &/);
  assert.throws(() => normalizeCustomerNumber("12 34"), /mellemrum/);
  assert.equal(normalizeCustomerNumber(" abc1 "), "ABC1");
});

test("long text is wrapped to 60-character lines", () => {
  const lines = wrapTextLines(["ord ".repeat(40)]);
  assert.ok(lines.every((l) => l.length <= 60));
  assert.equal(lines.join(" "), "ord ".repeat(40).trim());
});

test("a received file decodes back into 128-character records", () => {
  const { file } = buildBs0601(config, [collection]);
  const decoded = decodeDelivery(file);
  assert.ok(decoded.every((r) => r.length === 128));
  assert.equal(field(decoded[0], 1, 5), "BS002");
});
