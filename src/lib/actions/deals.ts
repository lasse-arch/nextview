"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addMonths } from "date-fns";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { recalcCommission } from "@/lib/commission-service";
import { buildDealEmailAddress } from "@/lib/email-address";
import { findDuplicateDeals } from "@/lib/duplicates";
import { syncDealMeetingToCalendar } from "@/lib/calendar-service";
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

export async function updateDeal(dealId: string, formData: FormData) {
  const user = await requireUser();

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

  if (stage === "MEETING_BOOKED" && !meetingDateRaw) {
    throw new Error("Angiv en mødedato når stadiet er 'Møde booket'.");
  }
  const meetingDate = meetingDateRaw ? new Date(meetingDateRaw) : null;

  const existing = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });

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
  if (stage === "LIVE" && !existing.billingStartDate && liveAt) stageDateUpdates.billingStartDate = liveAt;

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

  await recalcCommission(dealId);

  if (stage === "CONTRACT_SIGNED" && existing.stage !== "CONTRACT_SIGNED") {
    await sendContractSignedNotification(dealId);
  }

  let calendarWarning: string | null = null;
  if (stage === "MEETING_BOOKED" && meetingDate) {
    const result = await syncDealMeetingToCalendar(dealId);
    if (!result.synced) calendarWarning = result.reason ?? "Kunne ikke synkronisere med Google Kalender.";
  }

  revalidatePath("/deals");
  revalidatePath("/commission");

  const params = new URLSearchParams();
  if (duplicates.length > 0) params.set("dup", duplicates[0].id);
  if (calendarWarning) params.set("calendarWarning", calendarWarning);
  params.set(
    "saved",
    blockedStageChange ? "Gemt (stadiet styres via kontrakten og blev ikke ændret)" : "1"
  );
  redirect(`/deals/${dealId}?${params.toString()}`);
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

  await prisma.deal.update({
    where: { id: dealId },
    data: { stage: newStage, ...stageDateUpdates },
  });

  if (newStage === "MEETING_BOOKED") {
    await syncDealMeetingToCalendar(dealId);
  }

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

  await syncDealMeetingToCalendar(dealId);

  revalidatePath("/deals");
  revalidatePath(`/deals/${dealId}`);
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
  if (user.role !== "ADMIN") throw new Error("Kun admin kan slette en deal.");
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
export async function linkDealToParent(dealId: string, formData: FormData) {
  await requireUser();
  const parentDealId = String(formData.get("parentDealId") || "");
  if (!parentDealId) throw new Error("Vælg en kunde at kæde sammen med.");
  if (parentDealId === dealId) throw new Error("En deal kan ikke kædes sammen med sig selv.");

  const parent = await prisma.deal.findUniqueOrThrow({ where: { id: parentDealId } });
  if (parent.parentDealId) {
    throw new Error("Den valgte kunde er allerede en afdeling af en anden kunde.");
  }

  await prisma.deal.update({ where: { id: dealId }, data: { parentDealId } });
  revalidatePath(`/deals/${dealId}`);
  revalidatePath(`/deals/${parentDealId}`);
  redirect(`/deals/${dealId}?saved=Kunde%20sammenkædet`);
}

/**
 * Attaches several deals as branches under this deal in one go - lets a
 * customer with many locations (e.g. 5 addresses under the same chain) be
 * linked up from the parent's page instead of one-by-one from each branch.
 */
export async function linkBranchesToDeal(parentDealId: string, formData: FormData) {
  await requireUser();
  const branchDealIds = formData.getAll("branchDealIds").map(String).filter(Boolean);
  if (branchDealIds.length === 0) throw new Error("Vælg mindst én afdeling at kæde sammen.");
  if (branchDealIds.includes(parentDealId)) {
    throw new Error("En deal kan ikke kædes sammen med sig selv.");
  }

  const parent = await prisma.deal.findUniqueOrThrow({ where: { id: parentDealId } });
  if (parent.parentDealId) {
    throw new Error("Denne kunde er allerede en afdeling af en anden kunde.");
  }

  const branches = await prisma.deal.findMany({ where: { id: { in: branchDealIds } } });
  if (branches.some((b) => b.parentDealId)) {
    throw new Error("En af de valgte afdelinger er allerede kædet sammen med en anden kunde.");
  }

  await prisma.deal.updateMany({ where: { id: { in: branchDealIds } }, data: { parentDealId } });
  revalidatePath(`/deals/${parentDealId}`);
  for (const id of branchDealIds) revalidatePath(`/deals/${id}`);
  redirect(`/deals/${parentDealId}?saved=Afdelinger%20kædet%20sammen`);
}

export async function unlinkDealFromParent(dealId: string) {
  await requireUser();
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  await prisma.deal.update({ where: { id: dealId }, data: { parentDealId: null } });
  revalidatePath(`/deals/${dealId}`);
  if (deal.parentDealId) revalidatePath(`/deals/${deal.parentDealId}`);
}

export async function addNote(dealId: string, formData: FormData) {
  const user = await requireUser();
  const body = String(formData.get("body") || "").trim();
  const kind = String(formData.get("kind") || "MANUAL") === "AI_MEETING" ? "AI_MEETING" : "MANUAL";
  if (!body) return;

  await prisma.note.create({
    data: { dealId, authorId: user.id, body, kind },
  });

  revalidatePath(`/deals/${dealId}`);
  redirect(`/deals/${dealId}?saved=Note%20tilf%C3%B8jet`);
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
 * Registers a contract termination with notice: billing keeps rolling on
 * (past the binding period if needed) until the later of the binding
 * period's end and noticeDate + noticePeriodMonths - the deal isn't marked
 * inactive immediately, since the customer is still being billed until
 * that computed end date. A daily job auto-churns the deal once it's passed.
 */
export async function terminateContract(dealId: string, formData: FormData) {
  await requireUser();

  const noticeDateRaw = String(formData.get("noticeDate") || "");
  if (!noticeDateRaw) throw new Error("Angiv en opsigelsesdato.");
  const noticeDate = new Date(noticeDateRaw);
  if (isNaN(noticeDate.getTime())) throw new Error("Ugyldig opsigelsesdato.");

  const noticePeriodMonthsRaw = String(formData.get("noticePeriodMonths") || "");
  const noticePeriodMonths = parseInt(noticePeriodMonthsRaw, 10);
  if (!noticePeriodMonths || noticePeriodMonths <= 0) throw new Error("Angiv et gyldigt opsigelsesvarsel.");

  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  const bindingEnd =
    deal.billingStartDate && deal.bindingMonths ? addMonths(deal.billingStartDate, deal.bindingMonths) : null;
  const noticeEnd = addMonths(noticeDate, noticePeriodMonths);
  const contractEndDate = bindingEnd && bindingEnd > noticeEnd ? bindingEnd : noticeEnd;

  await prisma.deal.update({
    where: { id: dealId },
    data: { terminationNoticeAt: noticeDate, noticePeriodMonths, contractEndDate },
  });

  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
  redirect(`/deals/${dealId}?saved=Opsigelse%20registreret`);
}

export async function withdrawTermination(dealId: string) {
  await requireUser();
  await prisma.deal.update({
    where: { id: dealId },
    data: { terminationNoticeAt: null, contractEndDate: null },
  });
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
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
