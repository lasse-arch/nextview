import { prisma } from "@/lib/db";
import { needsDeliveryLink } from "@/lib/labels";

const MENTION_PATTERN = /@([a-zA-ZæøåÆØÅ0-9-]+)/g;

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
