import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEanNumber } from "./ean";

test("EAN numbers: 13 digits with a valid GS1 check digit", () => {
  assert.equal(normalizeEanNumber("5790002647024"), "5790002647024"); // Kragelund Efterskole
  assert.equal(normalizeEanNumber("5798 0005 55815"), "5798000555815"); // spaces are fine
  assert.equal(normalizeEanNumber(""), null);
  assert.throws(() => normalizeEanNumber("579000264702"), /13 cifre/);
  assert.throws(() => normalizeEanNumber("5790002647025"), /kontrolcifferet/);
});
