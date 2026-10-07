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
export function resolveTemplatePlaceholders(
  text: string,
  ctx: TemplatePlaceholderContext,
  /** Betalingsservice sign-up details (see betalingsservicePlaceholders). */
  extra: Record<string, string> = {}
): string {
  const values: Record<string, string> = {
    ...extra,
    firma: dealName(ctx.deal),
    kontaktperson: ctx.deal.contactName || "der",
    sælger: [ctx.seller.name, ctx.seller.lastName].filter(Boolean).join(" "),
    sælgertelefon: ctx.seller.phone ?? "",
    sælgeremail: ctx.seller.email,
  };

  return text.replace(/\{\{\s*([a-zæøå]+)\s*\}\}/gi, (match, key: string) => values[key.toLowerCase()] ?? match);
}

export const TEMPLATE_PLACEHOLDER_HELP =
  "{{firma}}, {{kontaktperson}}, {{sælger}}, {{sælgertelefon}}, {{sælgeremail}}, {{tilmeldingslink}}, {{kundenummer}}, {{pbsnr}}, {{debitorgruppe}}";

/** The Betalingsservice placeholders - only looked up when a text uses one,
 * since filling in {{kundenummer}} gives the deal its customer number. */
export function usesBetalingsservicePlaceholders(text: string): boolean {
  return /\{\{\s*(tilmeldingslink|kundenummer|pbsnr|debitorgruppe)\s*\}\}/i.test(text);
}

/** Ready-made template for sending the Betalingsservice sign-up link from a deal. */
export const BS_SIGNUP_TEMPLATE = {
  name: "Tilmeld Betalingsservice",
  subject: "Tilmeld jer Betalingsservice - {{firma}}",
  bodyHtml: [
    "Hej {{kontaktperson}},",
    "",
    "Fremover kan I betale jeres abonnement hos Nextview360 automatisk via Betalingsservice. Så bliver beløbet trukket på forfaldsdagen, og I slipper for at betale fakturaerne manuelt. I får stadig fakturaen fra os på mail.",
    "",
    "Tilmeld jer med MitID her:",
    "{{tilmeldingslink}}",
    "",
    "I skal bruge disse oplysninger:",
    "PBS-nr.: {{pbsnr}}",
    "Debitorgruppe: {{debitorgruppe}}",
    "Kundenummer: {{kundenummer}}",
    "",
    "I kan også tilmelde jer i jeres netbank med de samme oplysninger.",
  ].join("\n"),
};
