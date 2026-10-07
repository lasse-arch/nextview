/**
 * Parses the data deliveries Betalingsservice sends back to the creditor:
 *
 * - BS 0602 - Payment information (chapter 6): what happened to each
 *   collection - paid, rejected, cancelled or charged back - for automatic
 *   payments (section 0211) and payment slips (section 0215).
 * - BS 0603 - Mandate information (chapter 8): which customers have signed
 *   up for (or left) automatic payments - all active mandates (section
 *   0210) and/or those registered/cancelled since the last delivery (0212).
 *
 * Field positions follow "Betalingsservice Guidelines for Data Suppliers -
 * Automatic payments and payment slips" (11 February 2025), tables 30-41
 * and 51-61.
 */
import { decodeDelivery, field, parseBsDate, BsFormatError } from "./fixed-width";

export type BsPaymentOutcome = "PAID" | "REJECTED" | "CANCELLED" | "CHARGED_BACK";

export type BsPayment = {
  outcome: BsPaymentOutcome;
  /** "automatic" = Betalingsservice (section 0211), "slip" = indbetalingskort (0215). */
  channel: "automatic" | "slip";
  transactionCode: string;
  customerNumber: string;
  mandateNumber: string | null;
  dueDate: Date | null;
  amountOre: number;
  /** As sent in BS 0601 field 12 - payment slips only return the first 9 characters. */
  reference: string;
  /** Actual payment (or charge-back) date; null when there was none. */
  paymentDate: Date | null;
  bookkeepingDate: Date | null;
  /** Amount actually paid (or charged back). */
  paidAmountOre: number;
  /** Rejection fee charged on a payment slip, if any. */
  feeOre: number;
};

export type BsMandateEvent = "ACTIVE" | "REGISTERED" | "CANCELLED_BY_BANK" | "CANCELLED_BY_CREDITOR" | "CANCELLED_BY_BS";

export type BsMandate = {
  event: BsMandateEvent;
  transactionCode: string;
  customerNumber: string;
  mandateNumber: string;
  /** Registration date, or the date the cancellation was made. */
  date: Date | null;
  /** End/deletion date, if any. */
  endDate: Date | null;
};

export type BsReturnDelivery = {
  deliveryType: "0602" | "0603";
  creationDate: Date | null;
  payments: BsPayment[];
  mandates: BsMandate[];
};

const AUTOMATIC_OUTCOMES: Record<string, BsPaymentOutcome> = {
  "0236": "PAID",
  "0237": "REJECTED",
  "0238": "CANCELLED",
  "0239": "CHARGED_BACK",
};
const SLIP_OUTCOMES: Record<string, BsPaymentOutcome> = { "0297": "PAID", "0299": "CHARGED_BACK" };
const MANDATE_EVENTS: Record<string, BsMandateEvent> = {
  "0230": "ACTIVE",
  "0231": "REGISTERED",
  "0232": "CANCELLED_BY_BANK",
  "0233": "CANCELLED_BY_CREDITOR",
  "0234": "CANCELLED_BY_BS",
};

const numberAt = (r: string, from: number, to: number) => Number(field(r, from, to).trim() || "0");
const mandateAt = (r: string) => {
  const m = field(r, 41, 49).trim();
  return m && !/^0+$/.test(m) ? m : null;
};

export function parseBsReturnDelivery(file: Buffer | string): BsReturnDelivery {
  const records = decodeDelivery(file);
  const start = records.find((r) => field(r, 3, 5) === "002");
  if (!start || field(start, 1, 2) !== "BS") throw new BsFormatError("Filen ligner ikke en Betalingsservice-leverance (mangler BS002-start).");
  const deliveryType = field(start, 17, 20);
  if (deliveryType !== "0602" && deliveryType !== "0603") {
    throw new BsFormatError(`Leverancetype ${deliveryType} understøttes ikke - forventede BS 0602 eller BS 0603.`);
  }

  const result: BsReturnDelivery = {
    deliveryType,
    creationDate: parseBsDate(field(start, 50, 55)),
    payments: [],
    mandates: [],
  };

  let section = "";
  let count042 = 0;
  for (const r of records) {
    const type = field(r, 3, 5);
    if (type === "012") {
      section = field(r, 14, 17);
      continue;
    }
    if (type !== "042") continue;
    count042++;
    const code = field(r, 14, 17);

    if (deliveryType === "0602" && section === "0211" && AUTOMATIC_OUTCOMES[code]) {
      result.payments.push({
        outcome: AUTOMATIC_OUTCOMES[code],
        channel: "automatic",
        transactionCode: code,
        customerNumber: field(r, 26, 40).trim(),
        mandateNumber: mandateAt(r),
        dueDate: parseBsDate(field(r, 50, 55)),
        amountOre: numberAt(r, 57, 69),
        reference: field(r, 70, 99).trim(),
        paymentDate: code === "0238" ? null : parseBsDate(field(r, 104, 109)),
        bookkeepingDate: code === "0238" ? null : parseBsDate(field(r, 110, 115)),
        paidAmountOre: code === "0238" ? 0 : numberAt(r, 116, 128),
        feeOre: 0,
      });
    } else if (deliveryType === "0602" && section === "0215" && SLIP_OUTCOMES[code]) {
      result.payments.push({
        outcome: SLIP_OUTCOMES[code],
        channel: "slip",
        transactionCode: code,
        customerNumber: field(r, 30, 44).trim(),
        mandateNumber: null,
        dueDate: parseBsDate(field(r, 53, 58)),
        amountOre: numberAt(r, 60, 72),
        reference: field(r, 73, 81).trim(),
        paymentDate: parseBsDate(field(r, 104, 109)),
        bookkeepingDate: parseBsDate(field(r, 110, 115)),
        paidAmountOre: numberAt(r, 116, 128),
        feeOre: field(r, 47, 47) === "1" ? numberAt(r, 48, 52) : 0,
      });
    } else if (deliveryType === "0603" && MANDATE_EVENTS[code]) {
      result.mandates.push({
        event: MANDATE_EVENTS[code],
        transactionCode: code,
        customerNumber: field(r, 26, 40).trim(),
        mandateNumber: field(r, 41, 49).trim(),
        date: parseBsDate(field(r, 50, 55)),
        endDate: parseBsDate(field(r, 56, 61)),
      });
    } else {
      throw new BsFormatError(`Ukendt record i sektion ${section || "?"}: transaktionskode ${code}.`);
    }
  }

  // The delivery end record's count of 042 records is a checksum for a
  // complete, uncorrupted file.
  const end = records.find((r) => field(r, 3, 5) === "992");
  if (!end) throw new BsFormatError("Filen er ufuldstændig (mangler BS992-slutrecord).");
  const expected = numberAt(end, 32, 42);
  if (expected !== count042) {
    throw new BsFormatError(`Filen er ufuldstændig: slutrecorden angiver ${expected} poster, men der er ${count042}.`);
  }

  return result;
}
