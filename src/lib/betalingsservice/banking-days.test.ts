import { test } from "node:test";
import assert from "node:assert/strict";
import {
  utcDay,
  isBankingDay,
  sixthLastBankingDay,
  deliveryDeadline,
  collectionDateForPeriod,
  earliestCollectionDate,
} from "./banking-days";

const iso = (d: Date) => d.toISOString().slice(0, 10);

test("weekends and Danish bank holidays are not banking days", () => {
  assert.equal(isBankingDay(utcDay(2026, 9, 3)), false); // Saturday
  assert.equal(isBankingDay(utcDay(2026, 9, 1)), true); // Thursday 1 Oct
  assert.equal(isBankingDay(utcDay(2027, 0, 1)), false); // New Year's Day
  assert.equal(isBankingDay(utcDay(2027, 2, 25)), false); // Maundy Thursday 2027
  assert.equal(isBankingDay(utcDay(2027, 2, 29)), false); // Easter Monday 2027
  assert.equal(isBankingDay(utcDay(2027, 4, 7)), false); // Friday after Ascension 2027
  assert.equal(isBankingDay(utcDay(2027, 5, 5)), false); // Constitution Day (Saturday anyway)
  assert.equal(isBankingDay(utcDay(2026, 11, 24)), false);
  assert.equal(isBankingDay(utcDay(2026, 11, 31)), false);
});

test("collection date is the quarter's first banking day", () => {
  assert.equal(iso(collectionDateForPeriod(new Date(2026, 9, 1))), "2026-10-01");
  // 1 Jan 2027 is a holiday (Friday), so the 4th (Monday).
  assert.equal(iso(collectionDateForPeriod(new Date(2027, 0, 1))), "2027-01-04");
  // 1 Apr 2028 is a Saturday -> Monday 3 Apr.
  assert.equal(iso(collectionDateForPeriod(new Date(2028, 3, 1))), "2028-04-03");
});

test("deadline is 11:00 Copenhagen on the sixth last banking day of the month before", () => {
  // September 2026: last banking days 30, 29, 28, 25, 24, 23 -> 23 Sep.
  assert.equal(iso(sixthLastBankingDay(2026, 8)), "2026-09-23");
  assert.equal(deliveryDeadline(utcDay(2026, 9, 1)).toISOString(), "2026-09-23T09:00:00.000Z");
  // December 2026: 30, 29, 28, 23, 22, 21 (24/25/26/31 closed) -> 21 Dec, winter time.
  assert.equal(deliveryDeadline(utcDay(2027, 0, 4)).toISOString(), "2026-12-21T10:00:00.000Z");
});

test("earliest collection date skips a month whose deadline has passed", () => {
  assert.equal(iso(earliestCollectionDate(new Date("2026-09-10T08:00:00Z"))), "2026-10-01");
  assert.equal(iso(earliestCollectionDate(new Date("2026-09-23T08:00:00Z"))), "2026-11-02");
});
