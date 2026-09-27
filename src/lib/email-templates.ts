import { dealName } from "@/lib/labels";

export type TemplatePlaceholderContext = {
  deal: { companyName: string; displayName: string | null; contactName: string | null };
  seller: { name: string; lastName: string | null; phone: string | null; email: string };
};

/**
 * Replaces {{placeholder}} tokens in a template's subject/body with real
 * values from the deal and the sending seller - kept deliberately small
 * (a handful of the fields people actually reach for), not a general
 * templating engine.
 */
export function resolveTemplatePlaceholders(text: string, ctx: TemplatePlaceholderContext): string {
  const values: Record<string, string> = {
    firma: dealName(ctx.deal),
    kontaktperson: ctx.deal.contactName || "der",
    sælger: [ctx.seller.name, ctx.seller.lastName].filter(Boolean).join(" "),
    sælgertelefon: ctx.seller.phone ?? "",
    sælgeremail: ctx.seller.email,
  };

  return text.replace(/\{\{\s*([a-zæøå]+)\s*\}\}/gi, (match, key: string) => values[key.toLowerCase()] ?? match);
}

export const TEMPLATE_PLACEHOLDER_HELP =
  "{{firma}}, {{kontaktperson}}, {{sælger}}, {{sælgertelefon}}, {{sælgeremail}}";
