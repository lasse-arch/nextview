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

/**
 * Live customers matching `query` (by kaldenavn/firmanavn), for the
 * @mention autocomplete dropdown shown while typing "@" in the calendar
 * invite's extra message field.
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

  return deals.map((deal) => {
    const name = deal.displayName || deal.companyName;
    return {
      token: mentionToken(name),
      label: name,
      hasLink: deal.items.some((i) => needsDeliveryLink(i.productType) && Boolean(i.url)),
    };
  });
}

/**
 * Replaces @mentions of a live customer's name (e.g. "@stidsholt") with a
 * direct link to their delivered product (virtual tour, website, etc. -
 * whichever's on file), so a seller can drop a quick example into a
 * calendar invite's custom message without hunting down the URL themselves.
 * A mention matching no live customer, or one with no delivered link on
 * file, is left as plain text rather than silently dropped.
 */
export async function resolveCustomerMentions(text: string): Promise<string> {
  const mentions = [...new Set([...text.matchAll(MENTION_PATTERN)].map((m) => m[1]))];
  if (mentions.length === 0) return text;

  let result = text;
  for (const mention of mentions) {
    const deal = await prisma.deal.findFirst({
      where: {
        stage: "LIVE",
        OR: [
          { displayName: { contains: mention, mode: "insensitive" } },
          { companyName: { contains: mention, mode: "insensitive" } },
        ],
      },
      include: { items: true },
    });
    if (!deal) continue;

    const link = deal.items.find((i) => needsDeliveryLink(i.productType) && i.url)?.url;
    if (!link) continue;

    result = result.replaceAll(`@${mention}`, link);
  }

  return result;
}
