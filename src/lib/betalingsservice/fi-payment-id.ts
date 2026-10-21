/**
 * The invoice number behind an FI payment ID (+71 on the invoice's
 * FI-kort): Dinero builds it as organisation id + invoice number + a mod-10
 * (Luhn) check digit, e.g. 637871716 = organisation 63787, invoice 171.
 * Null when the ID isn't one of this Dinero organisation's.
 */
export function invoiceNumberFromFiPaymentId(paymentId: string, organizationId: string | undefined): string | null {
  const digits = paymentId.replace(/\D/g, "").replace(/^0+/, "");
  if (!organizationId || digits.length < organizationId.length + 2) return null;
  const base = digits.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < base.length; i++) {
    let d = Number(base[base.length - 1 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  if ((10 - (sum % 10)) % 10 !== Number(digits[digits.length - 1])) return null;
  if (!base.startsWith(organizationId)) return null;
  const invoiceNumber = base.slice(organizationId.length).replace(/^0+/, "");
  return invoiceNumber || null;
}
