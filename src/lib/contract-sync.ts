import { prisma } from "@/lib/db";
import { submissionEvents } from "@/lib/docuseal";
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

/** Every contract still waiting for the customer (sent within the last half year) - the daily backstop. */
export async function syncWaitingContracts(): Promise<{
  checked: number;
  signed: number;
  failed: number;
}> {
  const since = new Date(Date.now() - 183 * 86_400_000);
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
