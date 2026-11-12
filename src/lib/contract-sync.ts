import { prisma } from "@/lib/db";
import { isDocuSealConfigured, submissionEvents } from "@/lib/docuseal";
import { handleDocuSealEvent } from "@/lib/docuseal-events";

/*
 * Asks DocuSeal itself what has happened to a sent contract and makes up for
 * any webhook that never arrived (e.g. DocuSeal still sending to an old
 * address that redirects - it doesn't follow redirects). The same handling
 * as the webhook, so a contract found signed here is marked signed with
 * everything that comes with it - only once, since only contracts still
 * waiting (sent / opened) are checked.
 */

type Waiting = { submissionId: string; viewedAt: Date | null };

/** One contract: what's new since Arpo last heard. "signed" when it turned out to be signed. */
export async function syncContract(
  c: Waiting,
): Promise<"signed" | "declined" | "viewed" | "unchanged"> {
  const events = (await submissionEvents(c.submissionId)).filter(
    (e) => !(e.event_type === "form.viewed" && c.viewedAt),
  );
  for (const e of events) await handleDocuSealEvent(e);
  const types = new Set(events.map((e) => e.event_type));
  return types.has("form.completed") || types.has("submission.completed")
    ? "signed"
    : types.has("form.declined")
      ? "declined"
      : types.has("form.viewed")
        ? "viewed"
        : "unchanged";
}

/** Every contract still waiting for the customer (sent within the last half year, or `days`) - the daily backstop. */
export async function syncWaitingContracts(days = 183): Promise<{
  checked: number;
  signed: number;
  failed: number;
}> {
  const since = new Date(Date.now() - days * 86_400_000);
  const where = {
    contractStatus: { in: ["SENT" as const, "VIEWED" as const] },
    docusealSubmissionId: { not: null },
    contractSentAt: { gte: since },
  };
  const [deals, standalone] = await Promise.all([
    prisma.deal.findMany({
      where,
      select: { docusealSubmissionId: true, contractViewedAt: true },
    }),
    prisma.standaloneContract.findMany({
      where,
      select: { docusealSubmissionId: true, contractViewedAt: true },
    }),
  ]);
  let signed = 0;
  let failed = 0;
  const all = [...deals, ...standalone];
  for (const c of all) {
    try {
      if (
        (await syncContract({
          submissionId: c.docusealSubmissionId!,
          viewedAt: c.contractViewedAt,
        })) === "signed"
      )
        signed++;
    } catch (err) {
      failed++;
      console.error(
        `Kontraktstatus kunne ikke hentes for ${c.docusealSubmissionId}:`,
        err,
      );
    }
  }
  return { checked: all.length, signed, failed };
}

const EVERY_MS = 4 * 60_000;

/**
 * While the team is in Arpo (called after each page, see arpo/layout.tsx):
 * contracts sent within the last two months are checked with DocuSeal at most
 * every four minutes - so "opened" and "signed" show up within minutes even
 * when DocuSeal's webhook doesn't arrive. One instance at a time: the check is
 * claimed in the database first.
 */
export async function syncContractsIfDue(): Promise<void> {
  try {
    if (!(await isDocuSealConfigured())) return;
    const key = "CONTRACT_SYNC_AT";
    await prisma.integrationSetting.upsert({ where: { key }, create: { key, value: "0", updatedAt: new Date(0) }, update: {} });
    const claimed = await prisma.integrationSetting.updateMany({
      where: { key, updatedAt: { lt: new Date(Date.now() - EVERY_MS) } },
      data: { value: new Date().toISOString() },
    });
    if (claimed.count !== 1) return;
    await syncWaitingContracts(62);
  } catch (err) {
    console.error("Kontraktstatus kunne ikke tjekkes:", err);
  }
}
