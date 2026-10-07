/**
 * Data delivery BS 0601 - Opkrævningsdata (collection data), section 0112
 * "Automatic payments and payment slips" - Betalingsservice as a total
 * solution: a collection for a customer with a mandate is drawn
 * automatically; one without gets a payment slip (indbetalingskort) sent
 * by Betalingsservice. Every collection therefore carries the customer's
 * name and address (data record type 022).
 *
 * Field positions follow "Betalingsservice Guidelines for Data Suppliers -
 * Automatic payments and payment slips" (11 February 2025), chapter 5,
 * tables 12-20 and 28.
 */
import {
  alpha,
  num,
  blank,
  record,
  encodeDelivery,
  formatBsDate6,
  BsFormatError,
} from "./fixed-width";

const SYSTEM = "BS";
const SECTION = "0112";
const MAX_TEXT_LINE = 60;
const MAX_ADDRESS_LINES = 5;
/** "For automatic payments and payment slips, the payment date may be up to
 * 90 days in the future." */
const MAX_DAYS_AHEAD = 90;

export type Bs0601Config = {
  /** Data supplier number (8 digits) - from the data supplier agreement. */
  dataSupplierNumber: string;
  /** Agreed subsystem identifier - "BS1" unless agreed otherwise. */
  subsystem: string;
  /** Creditor's PBS number (8 digits). */
  pbsNumber: string;
  /** Debtor group number (5 digits). */
  debtorGroupNumber: string;
  /** Unique reference for this delivery (up to 10 digits), e.g. a running number. */
  deliveryId: number;
  /** Optional main text line on payment notifications (defaults to the debtor group name). */
  mainText?: string;
  creationDate?: Date;
};

export type Bs0601Collection = {
  /** The customer's number with the creditor - stable per customer. */
  customerNumber: string;
  /** Mandate number once the customer has signed up; omitted/null means a payment slip. */
  mandateNumber?: string | null;
  /** Line 1: name. Further lines: street address etc. (max 5 lines in total). */
  nameAndAddressLines: string[];
  postalCode: string;
  /** ISO 3166 two-letter code; "DK" (or omitted) for Denmark. */
  countryCode?: string | null;
  /** CVR (or CPR) number - lets payment slips reach e-Boks/Digital Post. */
  cvrNumber?: string | null;
  dueDate: Date;
  /** Amount in øre (DKK x 100), > 0. */
  amountOre: number;
  /** Own reference returned in BS 0602 (max 30; payment slips only return the first 9). */
  reference?: string | null;
  /** Text lines for the debtor (wrapped to 60 characters each). */
  textLines: string[];
};

/**
 * Customer number rules (chapter 4): upper case, Danish letters allowed, no
 * "&" and no blank spaces, up to 15 characters.
 */
export function normalizeCustomerNumber(raw: string): string {
  const v = raw.trim().toUpperCase();
  if (!v) throw new BsFormatError("Kundenummer mangler.");
  if (/[\s&]/.test(v)) throw new BsFormatError(`Kundenummer må ikke indeholde mellemrum eller &: "${raw}"`);
  if (!/^[0-9A-ZÆØÅ]+$/.test(v)) throw new BsFormatError(`Kundenummer må kun indeholde tal og bogstaver: "${raw}"`);
  if (v.length > 15) throw new BsFormatError(`Kundenummer er for langt (max 15 tegn): "${raw}"`);
  return v;
}

/** Splits text into lines of at most 60 characters, on word boundaries. */
export function wrapTextLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const words = line.trim().split(/\s+/).filter(Boolean);
    let current = "";
    for (const word of words) {
      if (word.length > MAX_TEXT_LINE) {
        if (current) out.push(current);
        for (let i = 0; i < word.length; i += MAX_TEXT_LINE) out.push(word.slice(i, i + MAX_TEXT_LINE));
        current = "";
        continue;
      }
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > MAX_TEXT_LINE) {
        out.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) out.push(current);
    else if (words.length === 0) out.push("");
  }
  return out;
}

export type Bs0601Result = {
  records: string[];
  file: Buffer;
  totals: { collections: number; amountOre: number; textRecords: number; addressRecords: number };
};

export function buildBs0601(config: Bs0601Config, collections: Bs0601Collection[]): Bs0601Result {
  if (collections.length === 0) throw new BsFormatError("Ingen opkrævninger at sende.");
  const creationDate = config.creationDate ?? new Date();
  const pbs = num(config.pbsNumber, 8, "PBS-nummer");
  const group = num(config.debtorGroupNumber, 5, "Debitorgruppenummer");
  const supplier = num(config.dataSupplierNumber, 8, "Dataleverandørnummer");
  const subsystem = alpha(config.subsystem || "BS1", 3, "Delsystem");

  // "You can only have one collection on a payment date for a customer."
  const seen = new Set<string>();
  for (const c of collections) {
    const key = `${normalizeCustomerNumber(c.customerNumber)}|${c.dueDate.toISOString().slice(0, 10)}`;
    if (seen.has(key)) {
      throw new BsFormatError(
        `Kunde ${c.customerNumber} har mere end én opkrævning på ${c.dueDate.toISOString().slice(0, 10)} - læg dem sammen eller brug forskellige datoer.`
      );
    }
    seen.add(key);
  }

  const records: string[] = [];

  // Data delivery start (table 12).
  records.push(
    record(
      [
        SYSTEM,
        "002",
        supplier,
        subsystem,
        "0601",
        num(config.deliveryId, 10, "Leverance-ID"),
        blank(19),
        formatBsDate6(creationDate),
        blank(73),
      ],
      "BS002"
    )
  );

  // Section 0112 start (table 13).
  records.push(
    record(
      [
        SYSTEM,
        "012",
        pbs,
        SECTION,
        blank(5),
        group,
        blank(15),
        blank(4),
        "00000000",
        blank(4),
        blank(10),
        alpha(config.mainText ?? "", 60, "Hovedtekstlinje", { truncate: true }),
      ],
      "BS012"
    )
  );

  let count042 = 0;
  let amountTotal = 0;
  let count052 = 0;
  let count022 = 0;
  const latestDue = Date.now() + MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000;

  for (const c of collections) {
    const customer = alpha(normalizeCustomerNumber(c.customerNumber), 15, "Kundenummer");
    const mandate = num(c.mandateNumber?.trim() || "0", 9, "Aftalenummer");
    const country = (c.countryCode?.trim().toUpperCase() || "DK").slice(0, 2);
    const domestic = country === "DK";

    if (!Number.isInteger(c.amountOre) || c.amountOre <= 0) {
      throw new BsFormatError(`Ugyldigt beløb for kunde ${c.customerNumber}: ${c.amountOre} øre.`);
    }
    if (c.dueDate.getTime() > latestDue) {
      throw new BsFormatError(`Betalingsdatoen for kunde ${c.customerNumber} ligger mere end 90 dage ude i fremtiden.`);
    }

    const nameLines = c.nameAndAddressLines.map((l) => l.trim()).filter(Boolean);
    const minLines = domestic ? 2 : 3;
    if (nameLines.length < minLines) {
      throw new BsFormatError(
        `Kunde ${c.customerNumber} mangler navn/adresse - der skal mindst være ${minLines} linjer (navn og adresse).`
      );
    }
    if (nameLines.length > MAX_ADDRESS_LINES) {
      throw new BsFormatError(`Kunde ${c.customerNumber} har mere end ${MAX_ADDRESS_LINES} navne-/adresselinjer.`);
    }
    const postal = c.postalCode?.trim() ?? "";
    if (domestic && !/^\d{4}$/.test(postal)) {
      throw new BsFormatError(`Kunde ${c.customerNumber} mangler et gyldigt dansk postnummer (fik "${postal}").`);
    }

    // Name and address lines (table 14), records 00001-00005.
    nameLines.forEach((line, i) => {
      records.push(
        record(
          [
            SYSTEM,
            "022",
            pbs,
            "0240",
            num(i + 1, 5, "Recordnummer"),
            group,
            customer,
            "000000000",
            alpha(line, 35, "Navn/adresse", { truncate: true }),
            blank(42),
          ],
          "BS022 navn/adresse"
        )
      );
      count022++;
    });

    // Postcode and country (table 15), record 00009.
    records.push(
      record(
        [
          SYSTEM,
          "022",
          pbs,
          "0240",
          "00009",
          group,
          customer,
          "000000000",
          blank(15),
          alpha(domestic ? postal : postal || "0000", 4, "Postnummer"),
          alpha(country, 3, "Landekode"),
          blank(55),
        ],
        "BS022 postnummer"
      )
    );
    count022++;

    // Optional functionality incl. CVR for e-Boks/Digital Post (table 16), record 00010.
    const cvrDigits = (c.cvrNumber ?? "").replace(/\D/g, "");
    if (cvrDigits.length === 8 || cvrDigits.length === 10) {
      records.push(
        record(
          [SYSTEM, "022", pbs, "0240", "00010", group, customer, blank(40), num(cvrDigits, 10, "CVR-nummer"), blank(1), blank(1), blank(34)],
          "BS022 CVR"
        )
      );
      count022++;
    }

    // Payment due date and amount (table 17).
    records.push(
      record(
        [
          SYSTEM,
          "042",
          pbs,
          "0280",
          "00000",
          group,
          customer,
          mandate,
          formatDueDate(c.dueDate),
          "1",
          num(c.amountOre, 13, "Beløb"),
          alpha(c.reference ?? "", 30, "Reference"),
          "00",
          blank(15),
          blank(8),
        ],
        "BS042"
      )
    );
    count042++;
    amountTotal += c.amountOre;

    // Text to debtor (table 18), records 00001-05000.
    const textLines = wrapTextLines(c.textLines).slice(0, 5000);
    textLines.forEach((line, i) => {
      records.push(
        record(
          [
            SYSTEM,
            "052",
            pbs,
            "0241",
            num(i + 1, 5, "Recordnummer"),
            group,
            customer,
            mandate,
            blank(1),
            alpha(line, 60, "Tekstlinje"),
            blank(16),
          ],
          "BS052"
        )
      );
      count052++;
    });
  }

  // Section 0112 end (table 20).
  records.push(
    record(
      [
        SYSTEM,
        "092",
        pbs,
        SECTION,
        "00000",
        group,
        blank(4),
        num(count042, 11, "Antal 042"),
        num(amountTotal, 15, "Beløb i alt"),
        num(count052, 11, "Antal 052/062"),
        blank(15),
        num(count022, 11, "Antal 022"),
        blank(34),
      ],
      "BS092"
    )
  );

  // Data delivery end (table 28).
  records.push(
    record(
      [
        SYSTEM,
        "992",
        supplier,
        subsystem,
        "0601",
        num(1, 11, "Antal sektioner"),
        num(count042, 11, "Antal 042"),
        num(amountTotal, 15, "Beløb i alt"),
        num(count052, 11, "Antal 052/062"),
        "0".repeat(15),
        num(count022, 11, "Antal 022"),
        "0".repeat(34),
      ],
      "BS992"
    )
  );

  return {
    records,
    file: encodeDelivery(records),
    totals: { collections: count042, amountOre: amountTotal, textRecords: count052, addressRecords: count022 },
  };
}

/** Payment due date, ddmmyyyy, as the Danish calendar day. */
function formatDueDate(date: Date): string {
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Copenhagen", day: "2-digit", month: "2-digit", year: "numeric" });
  return fmt.format(date).split("/").join("");
}
