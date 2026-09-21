import { prisma } from "@/lib/db";

/**
 * Daily job: a deal left sitting in "Møde booket" after its meeting date has
 * passed advances on its own to "Opfølgning" - nobody has to remember to
 * move it forward just because the meeting happened. Only touches deals
 * still exactly in MEETING_BOOKED, so one already moved on (e.g. straight to
 * "Kontrakt sendt") is left alone.
 */
export async function runAutoFollowUp(): Promise<{ movedToFollowUp: number }> {
  const result = await prisma.deal.updateMany({
    where: { stage: "MEETING_BOOKED", meetingDate: { lt: new Date() } },
    data: { stage: "FOLLOW_UP" },
  });

  return { movedToFollowUp: result.count };
}
