export function buildDealEmailAddress(dealId: string): string {
  const domain = process.env.EMAIL_INBOUND_DOMAIN || "inbox.nextview360.dk";
  return `deal-${dealId.slice(-10)}@${domain}`;
}
