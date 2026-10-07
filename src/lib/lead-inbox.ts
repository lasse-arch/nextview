import type { DealStage } from "@prisma/client";

/**
 * Stages a lead can sit in while in Leadindbakken (see Deal.inLeadInbox) -
 * not worked into a real deal yet, still just being called. Moving a deal to
 * any other stage (a meeting booked, or anything after) takes it out.
 */
export const LEAD_INBOX_STAGES: DealStage[] = ["LEAD", "CONTACTED", "LOST"];

/** Merge into a stage update's data: takes the deal out of Leadindbakken
 * once the new stage is past the inbox stages, leaves it alone otherwise. */
export function leadInboxExitData(stage: DealStage): { inLeadInbox?: false } {
  return LEAD_INBOX_STAGES.includes(stage) ? {} : { inLeadInbox: false };
}
