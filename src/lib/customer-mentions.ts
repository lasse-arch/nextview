"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { needsDeliveryLink } from "@/lib/labels";

const MENTION_PATTERN = /@([a-zA-ZæøåÆØÅ0-9-]+)/g;

export type MentionSuggestion = { token: string; label: string; hasLink: boolean };

/** The @mention token suggested for a customer - the first alphanumeric
 * word of their kaldenavn/firmanavn, lowercased (e.g. "Stidsholt
 * efterskole" -> "stidsholt"). Matches resolveCustomerMentions's
 * substring-based lookup either way, but this keeps the inserted text
 * short and matching the seller's own convention. */
function mentionToken(name: string): string {
  return (name.match(/[a-zA-ZæøåÆØÅ0-9]+/)?.[0] ?? "").toLowerCase();
}

/** Short slug for a product type, appended to a customer's mention token
 * (e.g. "@stidsholt-tour") when they have more than one delivered link on
 * file, so a specific one can be picked instead of always the first. */
function productSlug(productType: string): string {
  const p = productType.toLowerCase();
  if (p.includes("tour")) return "tour";
  if (p.includes("hjemmeside")) return "hjemmeside";
  if (p.includes("matterport")) return "matterport";
  return (productType.match(/[a-zA-ZæøåÆØÅ0-9]+/)?.[0] ?? "").toLowerCase();
}

/**
 * Live customers matching `query` (by kaldenavn/firmanavn), for the
 * @mention autocomplete dropdown shown while typing "@" in the calendar
 * invite's extra message field. A customer with more than one delivered
 * product/link gets one suggestion row per product (e.g. "Stidsholt
 * efterskole (Nextview360 Tour)"), so the right one can be picked instead
 * of always defaulting to whichever happens to be first.
 */
export async function searchMentionableCustomers(query: string): Promise<MentionSuggestion[]> {
  await requireUser();
  const q = query.trim();
  if (!q) return [];

  const deals = await prisma.deal.findMany({
    where: {
      stage: "LIVE",
      OR: [{ displayName: { contains: q, mode: "insensitive" } }, { companyName: { contains: q, mode: "insensitive" } }],
    },
    include: { items: true },
    take: 8,
    orderBy: { companyName: "asc" },
  });

  const suggestions: MentionSuggestion[] = [];
  for (const deal of deals) {
    const name = deal.displayName || deal.companyName;
    const base = mentionToken(name);
    const linkedItems = deal.items.filter((i) => needsDeliveryLink(i.productType) && i.url);

    if (linkedItems.length <= 1) {
      suggestions.push({ token: base, label: name, hasLink: linkedItems.length === 1 });
    } else {
      for (const item of linkedItems) {
        suggestions.push({ token: `${base}-${productSlug(item.productType)}`, label: `${name} (${item.productType})`, hasLink: true });
      }
    }
  }

  return suggestions.slice(0, 8);
}

/**
 * Replaces @mentions of a live customer's name (e.g. "@stidsholt", or
 * "@stidsholt-tour" to pick a specific one of several delivered products)
 * with a direct link to that delivered product, so a seller can drop a
 * quick example into a calendar invite's custom message without hunting
 * down the URL themselves. A mention matching no live customer, or one
 * with no delivered link on file, is left as plain text rather than
 * silently dropped. Without a product suffix (or one that doesn't match
 * any of the customer's products), falls back to whichever link is first.
 */
export async function resolveCustomerMentions(text: string): Promise<string> {
  const mentions = [...new Set([...text.matchAll(MENTION_PATTERN)].map((m) => m[1]))];
  if (mentions.length === 0) return text;

  let result = text;
  for (const mention of mentions) {
    const dashIndex = mention.lastIndexOf("-");
    const namePart = dashIndex === -1 ? mention : mention.slice(0, dashIndex);
    const slugPart = dashIndex === -1 ? null : mention.slice(dashIndex + 1);

    const deal = await prisma.deal.findFirst({
      where: {
        stage: "LIVE",
        OR: [
          { displayName: { contains: namePart, mode: "insensitive" } },
          { companyName: { contains: namePart, mode: "insensitive" } },
        ],
      },
      include: { items: true },
    });
    if (!deal) continue;

    const linkedItems = deal.items.filter((i) => needsDeliveryLink(i.productType) && i.url);
    const item = (slugPart && linkedItems.find((i) => productSlug(i.productType) === slugPart)) || linkedItems[0];
    if (!item?.url) continue;

    result = result.replaceAll(`@${mention}`, item.url);
  }

  return result;
}
