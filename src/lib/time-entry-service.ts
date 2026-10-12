import "server-only";
import { prisma } from "@/lib/db";

// Kept out of the "use server" actions file so it is not a public server action.
/** Auto-logs a flat 15 minutes whenever an email goes out to a deal's
 * contact - see sendTemplatedEmailAction. Never rounds (it's already exactly
 * one quarter-hour) and is attributed to whoever sent the email. */
/** An e-mail sent from a deal counts as a quarter of an hour. */
const QUARTER_HOUR_MINUTES = 15;

export async function logEmailTimeEntry(dealId: string, userId: string): Promise<void> {
  await prisma.timeEntry.create({
    data: {
      dealId,
      userId,
      date: new Date(),
      minutes: QUARTER_HOUR_MINUTES,
      source: "EMAIL",
      createdById: userId,
    },
  });
}

