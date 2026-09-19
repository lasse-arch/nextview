"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addMonths } from "date-fns";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { recalcCommission } from "@/lib/commission-service";
import { buildDealEmailAddress } from "@/lib/email-address";
import { findDuplicateDeals } from "@/lib/duplicates";
import { syncDealMeetingToCalendar, type CalendarSyncResult } from "@/lib/calendar-service";
import { sendContractSignedNotification } from "@/lib/notification-service";
import type { DealStage, CommissionFrequency, CommissionStatus } from "@prisma/client";

const CONTRACT_MANAGED_STAGES: DealStage[] = ["CONTRACT_SENT", "CONTRACT_SIGNED"];

export async function createDealManual(formData: FormData) {
  const user = await requireUser();

  const companyName = String(formData.get("companyName") || "").trim();
  if (!companyName) throw new Error("Firmanavn er påkrævet");

  const displayName = String(formData.get("displayName") || "").trim() || null;
  const ownerId = String(formData.get("ownerId") || user.id);
  const cvrNumber = String(formData.get("cvrNumber") || "").trim() || null;
  const address = String(formData.get("address") || "") || null;
  const addressLatRaw = String(formData.get("addressLat") || "");
  const addressLonRaw = String(formData.get("addressLon") || "");
  const latitude = addressLatRaw ? parseFloat(addressLatRaw) : null;
  const longitude = addressLonRaw ? parseFloat(addressLonRaw) : null;
  const contactName = String(formData.get("contactName") || "") || null;
  const contactEmail = String(formData.get("contactEmail") || "") || null;
  const contactPhone = String(formData.get("contactPhone") || "") || null;

  const duplicates = await findDuplicateDeals(companyName);

  const deal = await prisma.deal.create({
    data: {
      companyName,
      displayName,
      cvrNumber,
      address,
      latitude,
      longitude,
      contactName,
      contactEmail,
      contactPhone,
      ownerId,
      importType: "MANUAL",
    },
  });

  await prisma.deal.update({
    where: { id: deal.id },
    data: { dealEmailAddress: buildDealEmailAddress(deal.id) },
  });

  revalidatePath("/deals");
  redirect(duplicates.length > 0 ? `/deals/${deal.id}?dup=${duplicates[0].id}` : `/deals/${deal.id}`);
}

/**
 * Duplicates a deal as a fresh lead - copies the company/contact info so it
 * doesn't need retyping, but resets stage, sale info, contract/integration
 * fields and notes so the copy starts its own pipeline from scratch.
 */
export async function createDuplicateDealRecord(dealId: string) {
  const source = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });

  const companyName = `${source.companyName} (kopi)`;
  const displayName = source.displayName ? `${source.displayName} (kopi)` : null;

  const deal = await prisma.deal.create({
    data: {
      companyName,
      displayName,
      cvrNumber: source.cvrNumber,
      address: source.address,
      latitude: source.latitude,
      longitude: source.longitude,
      contactName: source.contactName,
      contactEmail: source.contactEmail,
      contactPhone: source.contactPhone,
      invoiceEmail: source.invoiceEmail,
      ownerId: source.ownerId,
      importType: "MANUAL",
    },
  });

  await prisma.deal.update({
    where: { id: deal.id },
    data: { dealEmailAddress: buildDealEmailAddress(deal.id) },
  });

  return deal;
}

export async function duplicateDeal(dealId: string) {
  await requireUser();
  const deal = await createDuplicateDealRecord(dealId);

  revalidatePath("/deals");
  redirect(`/deals/${deal.id}`);
}

export type UpdateDealResult =
  | {
      ok: true;
      message: string;
      duplicate: { id: string; companyName: string } | null;
    }
  | { ok: false; error: string };

export async function updateDeal(dealId: string, formData: FormData): Promise<UpdateDealResult> {
  const user = await requireUser();

  try {
    return await updateDealInner(dealId, formData, user);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Der opstod en uventet fejl ved gem.";
    return { ok: false, error: message };
  }
}

async function updateDealInner(
  dealId: string,
  formData: FormData,
  user: Awaited<ReturnType<typeof requireUser>>
): Promise<UpdateDealResult> {
  const companyName = String(formData.get("companyName") || "").trim();
  const displayName = String(formData.get("displayName") || "").trim() || null;
  const cvrNumber = String(formData.get("cvrNumber") || "").trim() || null;
  const address = String(formData.get("address") || "") || null;
  const addressLatRaw = String(formData.get("addressLat") || "");
  const addressLonRaw = String(formData.get("addressLon") || "");
  const contactName = String(formData.get("contactName") || "") || null;
  const contactEmail = String(formData.get("contactEmail") || "") || null;
  const contactPhone = String(formData.get("contactPhone") || "") || null;
  const invoiceEmail = String(formData.get("invoiceEmail") || "").trim() || null;
  const ownerId = String(formData.get("ownerId") || "");
  let stage = String(formData.get("stage") || "LEAD") as DealStage;
  const meetingDateRaw = String(formData.get("meetingDate") || "");

  const existing = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });

  // An empty field means "leave unchanged", not "clear".
  const meetingDate = meetingDateRaw ? new Date(meetingDateRaw) : existing.meetingDate;
  // Only block the save when the stage is actually changing into Møde
  // booket without a date - a deal that's already sitting in that stage
  // (e.g. one imported without a meeting date ever set) must still be
  // saveable for unrelated edits, not crash on every single save forever.
  if (stage === "MEETING_BOOKED" && existing.stage !== "MEETING_BOOKED" && !meetingDate) {
    throw new Error("Angiv en mødedato når stadiet er 'Møde booket'.");
  }

  // Non-admins can't manually jump into a contract-managed stage from this
  // dropdown - that's driven by the actual contract-sending flow instead.
  // Fall back to the existing stage rather than throwing, since this field
  // has no client-side guard and a thrown error here would otherwise crash
  // the whole page (Next.js redacts the real message in production anyway).
  const blockedStageChange = user.role !== "ADMIN" && CONTRACT_MANAGED_STAGES.includes(stage) && stage !== existing.stage;
  if (blockedStageChange) {
    stage = existing.stage;
  }

  // Solgt til, binding, salgsbeløb, solgt dato and etableringspris are set by
  // the contract-builder flow (or backfilled on import) and shown read-only
  // here - only an admin who's clicked "Ret manuelt" gets real inputs for
  // them, so their absence from the form means "leave unchanged", not "clear".
  const canEditContractFields = user.role === "ADMIN";
  const soldProduct =
    canEditContractFields && formData.has("soldProduct")
      ? formData.getAll("soldProduct").map(String).filter(Boolean).join(", ") || null
      : existing.soldProduct;
  const bindingMonths =
    canEditContractFields && formData.has("bindingMonths")
      ? (() => {
          const raw = String(formData.get("bindingMonths") || "");
          return raw ? parseInt(raw, 10) : null;
        })()
      : existing.bindingMonths;
  const saleAmount =
    canEditContractFields && formData.has("saleAmount")
      ? (() => {
          const raw = String(formData.get("saleAmount") || "");
          return raw ? Math.round(parseFloat(raw)) : null;
        })()
      : existing.saleAmount;
  const soldAt =
    canEditContractFields && formData.has("soldAt")
      ? (() => {
          const raw = String(formData.get("soldAt") || "");
          return raw ? new Date(raw) : null;
        })()
      : existing.soldAt;
  const establishmentFee =
    canEditContractFields && formData.has("establishmentFee")
      ? (() => {
          const raw = String(formData.get("establishmentFee") || "");
          return raw ? Math.round(parseFloat(raw)) : null;
        })()
      : existing.establishmentFee;

  // Live-dato is normally set automatically when a deal first moves to
  // Live; an admin with "Ret manuelt" open can override it explicitly.
  const liveAtOverrideRaw =
    canEditContractFields && formData.has("liveAt") ? String(formData.get("liveAt") || "") : "";
  const liveAt = liveAtOverrideRaw
    ? new Date(liveAtOverrideRaw)
    : stage === "LIVE" && !existing.liveAt
      ? new Date()
      : existing.liveAt;

  const stageDateUpdates: Record<string, Date> = {};
  if (["CONTRACT_SIGNED", "FILMED", "LIVE"].includes(stage) && !existing.contractSignedAt) {
    stageDateUpdates.contractSignedAt = new Date();
  }
  if (stage === "FILMED" && !existing.filmedAt) stageDateUpdates.filmedAt = new Date();
  // Fakturering skal altid regnes fra live-/afleveringsdatoen, ikke en
  // tidligere fastfrosset værdi - resync hver gang dealen gemmes mens den
  // er Live, så en senere rettelse af Live-dato ikke efterlader den skæv.
  if (stage === "LIVE" && liveAt) stageDateUpdates.billingStartDate = liveAt;
  // "Underskrevet" er i praksis samme begivenhed som salget - når en admin
  // retter salgsdatoen manuelt, skal den underskrevne dato følge med, så de
  // to ikke kan drive fra hinanden (fx efter en forkert automatisk dato).
  if (canEditContractFields && formData.has("soldAt") && soldAt) {
    stageDateUpdates.contractSignedAt = soldAt;
  }

  // A termination's "Ophører"-date is a term boundary computed from
  // billingStartDate - if it was registered before Live-dato existed (or
  // bindingMonths later got corrected), that boundary was based on
  // incomplete data and goes stale. Recompute it on every save of a deal
  // with an active, not-yet-churned opsigelse (cheap and idempotent) so it
  // self-heals instead of silently drifting from the actual binding terms.
  // Skipped once an admin has manually overridden it (e.g. a negotiated
  // exception to the usual tacit-renewal terms) - that's a deliberate,
  // stated value, not a stale one to correct back.
  const effectiveBillingStartDate = stageDateUpdates.billingStartDate ?? existing.billingStartDate;
  if (
    existing.terminationNoticeAt &&
    existing.noticePeriodMonths &&
    !existing.churnedAt &&
    !existing.contractEndDateManual
  ) {
    const recomputedEndDate = computeContractEndDate(
      { billingStartDate: effectiveBillingStartDate, bindingMonths },
      existing.terminationNoticeAt,
      existing.noticePeriodMonths
    );
    if (recomputedEndDate.getTime() !== existing.contractEndDate?.getTime()) {
      stageDateUpdates.contractEndDate = recomputedEndDate;
    }
  }

  // A suggestion picked from the address autocomplete comes with fresh coordinates to store directly.
  // Otherwise, if the address text changed, clear any stale coordinates so the map re-geocodes it.
  const addressChanged = address !== existing.address;
  const latitude = addressLatRaw ? parseFloat(addressLatRaw) : addressChanged ? null : existing.latitude;
  const longitude = addressLonRaw ? parseFloat(addressLonRaw) : addressChanged ? null : existing.longitude;

  const duplicates =
    companyName && companyName.toLowerCase() !== existing.companyName.toLowerCase()
      ? await findDuplicateDeals(companyName, dealId)
      : [];

  await prisma.deal.update({
    where: { id: dealId },
    data: {
      companyName,
      displayName,
      cvrNumber,
      address,
      latitude,
      longitude,
      contactName,
      contactEmail,
      contactPhone,
      invoiceEmail,
      ownerId,
      stage,
      meetingDate,
      soldProduct,
      bindingMonths,
      saleAmount,
      soldAt,
      establishmentFee,
      liveAt,
      ...stageDateUpdates,
    },
  });

  // A manually-corrected sold product/price (via "Ret manuelt") should also
  // show up in "Ydelser" below, not just the auto-fill from the contract
  // flow - otherwise a hand-fixed deal never gets tracked there. Only synced
  // for a single product, since the manual fields don't carry a per-product
  // price breakdown for us to split across several.
  if (canEditContractFields && formData.has("soldProduct") && soldProduct && !soldProduct.includes(",")) {
    const amount = saleAmount && saleAmount > 0 ? saleAmount : establishmentFee ?? 0;
    const existingItem = await prisma.dealItem.findFirst({ where: { dealId, productType: soldProduct } });
    if (existingItem) {
      await prisma.dealItem.update({ where: { id: existingItem.id }, data: { amount, isFree: amount === 0 } });
    } else {
      await prisma.dealItem.create({ data: { dealId, productType: soldProduct, amount, isFree: amount === 0 } });
    }
  }

  await recalcCommission(dealId);

  if (stage === "CONTRACT_SIGNED" && existing.stage !== "CONTRACT_SIGNED") {
    await sendContractSignedNotification(dealId);
  }

  revalidatePath("/deals");
  revalidatePath("/commission");
  revalidatePath(`/deals/${dealId}`);

  return {
    ok: true,
    message: blockedStageChange ? "Gemt (stadiet styres via kontrakten og blev ikke ændret)" : "Gemt",
    duplicate: duplicates.length > 0 ? { id: duplicates[0].id, companyName: duplicates[0].companyName } : null,
  };
}

export async function updateDealStage(dealId: string, newStage: DealStage) {
  const user = await requireUser();

  if (user.role !== "ADMIN" && CONTRACT_MANAGED_STAGES.includes(newStage)) {
    throw new Error("Denne fase styres automatisk via kontrakten på dealens side.");
  }

  const existing = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });

  if (newStage === "MEETING_BOOKED" && !existing.meetingDate) {
    throw new Error("Åbn dealen og angiv en mødedato før den kan sættes til 'Møde booket'.");
  }

  const stageDateUpdates: Record<string, Date> = {};
  if (["CONTRACT_SIGNED", "FILMED", "LIVE"].includes(newStage) && !existing.contractSignedAt) {
    stageDateUpdates.contractSignedAt = new Date();
  }
  if (newStage === "FILMED" && !existing.filmedAt) stageDateUpdates.filmedAt = new Date();
  if (newStage === "LIVE" && !existing.liveAt) {
    stageDateUpdates.liveAt = new Date();
    if (!existing.billingStartDate) stageDateUpdates.billingStartDate = stageDateUpdates.liveAt;
  }

  // See the matching comment in updateDealInner: a termination's "Ophører"
  // date is a boundary computed from billingStartDate, so it must be
  // recomputed if that only just became known here.
  if (
    stageDateUpdates.billingStartDate &&
    existing.terminationNoticeAt &&
    existing.noticePeriodMonths &&
    !existing.churnedAt &&
    !existing.contractEndDateManual
  ) {
    stageDateUpdates.contractEndDate = computeContractEndDate(
      { billingStartDate: stageDateUpdates.billingStartDate, bindingMonths: existing.bindingMonths },
      existing.terminationNoticeAt,
      existing.noticePeriodMonths
    );
  }

  await prisma.deal.update({
    where: { id: dealId },
    data: { stage: newStage, ...stageDateUpdates },
  });

  revalidatePath("/deals");
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/commission");
}

/**
 * Used by the board view's drag-and-drop: dropping a deal into "Møde
 * booket" prompts for the meeting date right there, instead of requiring a
 * trip to the full edit form first (which updateDealStage otherwise demands).
 */
export async function setMeetingDateAndStage(dealId: string, meetingDateIso: string) {
  await requireUser();

  const meetingDate = new Date(meetingDateIso);
  if (isNaN(meetingDate.getTime())) throw new Error("Ugyldig mødedato.");

  await prisma.deal.update({
    where: { id: dealId },
    data: { stage: "MEETING_BOOKED", meetingDate },
  });

  revalidatePath("/deals");
  revalidatePath(`/deals/${dealId}`);
}

/** "Send kalender invitation" button on the deal page - calendar invites are
 * never sent automatically (e.g. just from booking a meeting or saving the
 * deal), only when explicitly requested here. `extraAttendeeUserIds` lets
 * whoever sends it pull in colleagues too (e.g. Gustav inviting Victor
 * along), on top of the deal owner and the customer contact. */
export async function sendCalendarInvite(
  dealId: string,
  extraAttendeeUserIds: string[] = []
): Promise<CalendarSyncResult> {
  await requireUser();
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!deal.meetingDate) return { synced: false, reason: "Angiv en mødedato først." };

  const extraUsers = extraAttendeeUserIds.length
    ? await prisma.user.findMany({ where: { id: { in: extraAttendeeUserIds } }, select: { email: true } })
    : [];

  const result = await syncDealMeetingToCalendar(
    dealId,
    extraUsers.map((u) => u.email)
  );
  revalidatePath(`/deals/${dealId}`);
  return result;
}

export async function markDealLost(dealId: string) {
  await requireUser();
  await prisma.deal.update({ where: { id: dealId }, data: { stage: "LOST" } });
  revalidatePath("/deals");
  revalidatePath(`/deals/${dealId}`);
}

/**
 * Excludes/re-includes a deal from provision entirely - e.g. so the owner
 * (say Gustav) can stay on the deal for pipeline tracking without it ever
 * generating commission for them.
 */
export async function setCommissionExcluded(dealId: string, excluded: boolean) {
  await requireUser();
  await prisma.deal.update({ where: { id: dealId }, data: { commissionExcluded: excluded } });
  await recalcCommission(dealId);
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/commission");
}

/**
 * Permanently deletes a deal and everything tied to it (notes, emails,
 * invoices, commission, items, renewal history) via cascade. Admin-only -
 * this can't be undone.
 */
export async function deleteDeal(dealId: string) {
  const user = await requireUser();
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (user.role !== "ADMIN" && deal.ownerId !== user.id) {
    throw new Error("Du kan kun slette dine egne deals.");
  }
  await prisma.deal.delete({ where: { id: dealId } });
  revalidatePath("/deals");
  redirect("/deals");
}

/** Resolves a detected import duplicate by keeping one deal and deleting the other. */
export async function resolveDuplicate(keepId: string, deleteId: string) {
  await requireUser();
  await prisma.deal.delete({ where: { id: deleteId } });
  revalidatePath("/deals");
  return { keptId: keepId };
}

/**
 * Groups a deal under another deal (customer) as a branch/department - e.g.
 * several locations of the same chain shown together - without merging any
 * actual data: each branch keeps its own CVR number, contract, invoicing
 * and commission entirely independently.
 */
export async function linkDealToParent(
  dealId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser();
  const parentDealId = String(formData.get("parentDealId") || "");
  if (!parentDealId) return { ok: false, error: "Vælg en kunde at kæde sammen med." };
  if (parentDealId === dealId) return { ok: false, error: "En deal kan ikke kædes sammen med sig selv." };

  const parent = await prisma.deal.findUniqueOrThrow({ where: { id: parentDealId } });
  if (parent.parentDealId) {
    return { ok: false, error: "Den valgte kunde er allerede en afdeling af en anden kunde." };
  }

  await prisma.deal.update({ where: { id: dealId }, data: { parentDealId } });
  revalidatePath(`/deals/${dealId}`);
  revalidatePath(`/deals/${parentDealId}`);
  return { ok: true };
}

/**
 * Attaches several deals as branches under this deal in one go - lets a
 * customer with many locations (e.g. 5 addresses under the same chain) be
 * linked up from the parent's page instead of one-by-one from each branch.
 */
export async function linkBranchesToDeal(
  parentDealId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser();
  const branchDealIds = formData.getAll("branchDealIds").map(String).filter(Boolean);
  if (branchDealIds.length === 0) return { ok: false, error: "Vælg mindst én afdeling at kæde sammen." };
  if (branchDealIds.includes(parentDealId)) {
    return { ok: false, error: "En deal kan ikke kædes sammen med sig selv." };
  }

  const parent = await prisma.deal.findUniqueOrThrow({ where: { id: parentDealId } });
  if (parent.parentDealId) {
    return { ok: false, error: "Denne kunde er allerede en afdeling af en anden kunde." };
  }

  const branches = await prisma.deal.findMany({ where: { id: { in: branchDealIds } } });
  if (branches.some((b) => b.parentDealId)) {
    return { ok: false, error: "En af de valgte afdelinger er allerede kædet sammen med en anden kunde." };
  }

  await prisma.deal.updateMany({ where: { id: { in: branchDealIds } }, data: { parentDealId } });
  revalidatePath(`/deals/${parentDealId}`);
  for (const id of branchDealIds) revalidatePath(`/deals/${id}`);
  return { ok: true };
}

export async function unlinkDealFromParent(dealId: string) {
  await requireUser();
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  await prisma.deal.update({ where: { id: dealId }, data: { parentDealId: null } });
  revalidatePath(`/deals/${dealId}`);
  if (deal.parentDealId) revalidatePath(`/deals/${deal.parentDealId}`);
}

export async function addNote(
  dealId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const body = String(formData.get("body") || "").trim();
  const kind = String(formData.get("kind") || "MANUAL") === "AI_MEETING" ? "AI_MEETING" : "MANUAL";
  if (!body) return { ok: false, error: "Skriv en note først." };

  await prisma.note.create({
    data: { dealId, authorId: user.id, body, kind },
  });

  revalidatePath(`/deals/${dealId}`);
  return { ok: true };
}

/** Used by the board view's Quick-note popup - adds a note without navigating away. */
export async function addQuickNote(dealId: string, body: string) {
  const user = await requireUser();
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Skriv en note først.");

  await prisma.note.create({
    data: { dealId, authorId: user.id, body: trimmed, kind: "MANUAL" },
  });

  revalidatePath(`/deals/${dealId}`);
}

export async function markDealInactive(dealId: string) {
  await requireUser();
  await prisma.deal.update({ where: { id: dealId }, data: { churnedAt: new Date() } });
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
}

export async function reactivateDeal(dealId: string) {
  await requireUser();
  // Clear any past termination too - otherwise a deal auto-churned by an
  // expired notice would just get immediately re-churned on the next run.
  await prisma.deal.update({
    where: { id: dealId },
    data: { churnedAt: null, terminationNoticeAt: null, contractEndDate: null },
  });
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
}

/**
 * A contract auto-renews for another full binding term (tacit renewal) if
 * notice isn't given at least noticePeriodMonths before the current term's
 * end - it isn't just tailed out by the notice period. This finds the
 * earliest term boundary (billingStartDate + k * bindingMonths) that
 * noticeDate + noticePeriodMonths actually reaches: giving notice with
 * enough lead time before the very next boundary exits there as normal;
 * giving it too late (or not at all until after a boundary has passed)
 * locks the deal into however many additional full terms are needed before
 * the notice period is satisfied.
 */
function computeContractEndDate(
  deal: { billingStartDate: Date | null; bindingMonths: number | null },
  noticeDate: Date,
  noticePeriodMonths: number
): Date {
  const deadline = addMonths(noticeDate, noticePeriodMonths);
  if (!deal.billingStartDate || !deal.bindingMonths) return deadline;
  let k = 1;
  let boundary = addMonths(deal.billingStartDate, deal.bindingMonths * k);
  while (boundary < deadline) {
    k++;
    boundary = addMonths(deal.billingStartDate, deal.bindingMonths * k);
  }
  return boundary;
}

/**
 * Registers a contract termination with notice: billing keeps rolling on
 * until the effective end date computed by computeContractEndDate above -
 * the deal isn't marked inactive immediately, since the customer is still
 * being billed until then. A daily job auto-churns the deal once it's passed.
 */
export async function terminateContract(
  dealId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser();

  const noticeDateRaw = String(formData.get("noticeDate") || "");
  if (!noticeDateRaw) return { ok: false, error: "Angiv en opsigelsesdato." };
  const noticeDate = new Date(noticeDateRaw);
  if (isNaN(noticeDate.getTime())) return { ok: false, error: "Ugyldig opsigelsesdato." };

  const noticePeriodMonthsRaw = String(formData.get("noticePeriodMonths") || "");
  const noticePeriodMonths = parseInt(noticePeriodMonthsRaw, 10);
  if (!noticePeriodMonths || noticePeriodMonths <= 0) return { ok: false, error: "Angiv et gyldigt opsigelsesvarsel." };

  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  const contractEndDate = computeContractEndDate(deal, noticeDate, noticePeriodMonths);

  await prisma.deal.update({
    where: { id: dealId },
    // A fresh opsigelse always starts from the computed value - clear any
    // earlier manual override rather than let it survive and go stale.
    data: { terminationNoticeAt: noticeDate, noticePeriodMonths, contractEndDate, contractEndDateManual: false },
  });

  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
  return { ok: true };
}

export async function withdrawTermination(dealId: string) {
  await requireUser();
  await prisma.deal.update({
    where: { id: dealId },
    data: { terminationNoticeAt: null, contractEndDate: null, contractEndDateManual: false },
  });
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
}

/**
 * Lets an admin override the computed "Ophører"-dato directly - for a
 * negotiated exception to the usual tacit-renewal terms (e.g. a customer
 * granted a plain notice-period exit instead of being locked into the next
 * full binding term). Marks it manual so the self-heal recompute in
 * updateDealInner/updateDealStage leaves it alone afterwards.
 */
export async function setManualContractEndDate(
  dealId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { ok: false, error: "Kun admin kan rette ophørsdatoen manuelt." };

  const raw = String(formData.get("contractEndDate") || "");
  if (!raw) return { ok: false, error: "Angiv en ophørsdato." };
  const contractEndDate = new Date(raw);
  if (isNaN(contractEndDate.getTime())) return { ok: false, error: "Ugyldig ophørsdato." };

  await prisma.deal.update({
    where: { id: dealId },
    data: { contractEndDate, contractEndDateManual: true },
  });

  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
  return { ok: true };
}

export async function markCommissionPaid(commissionId: string) {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan markere provision som udbetalt");
  const commission = await prisma.commission.update({
    where: { id: commissionId },
    data: { status: "PAID", paidAt: new Date() },
  });
  revalidatePath("/commission");
  revalidatePath(`/deals/${commission.dealId}`);
}

/** Lets admin manually correct any field on a commission - rate, amounts, payout, due date and status/paid date. */
export async function updateCommission(commissionId: string, formData: FormData) {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan redigere provision.");

  const rate = parseFloat(String(formData.get("rate") || ""));
  const baseAmount = Math.round(parseFloat(String(formData.get("baseAmount") || "")));
  const amount = Math.round(parseFloat(String(formData.get("amount") || "")));
  const frequency = String(formData.get("frequency") || "MONTHLY") as CommissionFrequency;
  const status = String(formData.get("status") || "PENDING") as CommissionStatus;
  const dueDateRaw = String(formData.get("dueDate") || "");
  const paidAtRaw = String(formData.get("paidAt") || "");

  if (isNaN(rate) || isNaN(baseAmount) || isNaN(amount)) {
    throw new Error("Angiv gyldige tal for sats, grundlag og provision.");
  }

  const commission = await prisma.commission.update({
    where: { id: commissionId },
    data: {
      rate,
      baseAmount,
      amount,
      frequency,
      status,
      dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
      paidAt: status === "PAID" ? (paidAtRaw ? new Date(paidAtRaw) : new Date()) : null,
    },
  });

  revalidatePath("/commission");
  revalidatePath(`/deals/${commission.dealId}`);
}
