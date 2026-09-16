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
import type { DealStage } from "@prisma/client";

const CONTRACT_MANAGED_STAGES: DealStage[] = ["CONTRACT_SENT", "CONTRACT_SIGNED"];

export async function createDealManual(formData: FormData) {
  const user = await requireUser();

  const companyName = String(formData.get("companyName") || "").trim();
  if (!companyName) throw new Error("Firmanavn er påkrævet");

  const displayName = String(formData.get("displayName") || "").trim() || null;
  const ownerId = String(formData.get("ownerId") || user.id);
  const cvrNumber = String(formData.get("cvrNumber") || "").trim() || null;
  const address = String(formData.get("address") || "") || null;
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

export async function updateDeal(dealId: string, formData: FormData) {
  const user = await requireUser();

  const companyName = String(formData.get("companyName") || "").trim();
  const displayName = String(formData.get("displayName") || "").trim() || null;
  const cvrNumber = String(formData.get("cvrNumber") || "").trim() || null;
  const address = String(formData.get("address") || "") || null;
  const contactName = String(formData.get("contactName") || "") || null;
  const contactEmail = String(formData.get("contactEmail") || "") || null;
  const contactPhone = String(formData.get("contactPhone") || "") || null;
  const invoiceEmail = String(formData.get("invoiceEmail") || "").trim() || null;
  const ownerId = String(formData.get("ownerId") || "");
  const stage = String(formData.get("stage") || "LEAD") as DealStage;
  const meetingDateRaw = String(formData.get("meetingDate") || "");
  const soldProduct = formData.getAll("soldProduct").map(String).filter(Boolean).join(", ") || null;
  const bindingMonthsRaw = String(formData.get("bindingMonths") || "");
  const bindingMonths = bindingMonthsRaw ? parseInt(bindingMonthsRaw, 10) : null;
  const saleAmountRaw = String(formData.get("saleAmount") || "");
  const saleAmount = saleAmountRaw ? Math.round(parseFloat(saleAmountRaw)) : null;
  const soldAtRaw = String(formData.get("soldAt") || "");
  const soldAt = soldAtRaw ? new Date(soldAtRaw) : null;
  const establishmentFeeRaw = String(formData.get("establishmentFee") || "");
  const establishmentFee = establishmentFeeRaw ? Math.round(parseFloat(establishmentFeeRaw)) : null;
  const liveAtRaw = String(formData.get("liveAt") || "");

  if (stage === "MEETING_BOOKED" && !meetingDateRaw) {
    throw new Error("Angiv en mødedato når stadiet er 'Møde booket'.");
  }
  const meetingDate = meetingDateRaw ? new Date(meetingDateRaw) : null;

  const existing = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });

  if (user.role !== "ADMIN" && CONTRACT_MANAGED_STAGES.includes(stage) && stage !== existing.stage) {
    throw new Error("Denne fase styres automatisk via PandaDoc-kontrakten på dealens side.");
  }

  // The Live-dato field is explicit and editable; only fall back to "today"
  // when a deal is newly moved to Live without one having been set yet.
  const liveAt = liveAtRaw ? new Date(liveAtRaw) : stage === "LIVE" && !existing.liveAt ? new Date() : existing.liveAt;

  const stageDateUpdates: Record<string, Date> = {};
  if (stage === "FILMED" && !existing.filmedAt) stageDateUpdates.filmedAt = new Date();
  if (stage === "LIVE" && !existing.billingStartDate && liveAt) stageDateUpdates.billingStartDate = liveAt;

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
  params.set("saved", "1");
  redirect(`/deals/${dealId}?${params.toString()}`);
}

export async function updateDealStage(dealId: string, newStage: DealStage) {
  const user = await requireUser();

  if (user.role !== "ADMIN" && CONTRACT_MANAGED_STAGES.includes(newStage)) {
    throw new Error("Denne fase styres automatisk via PandaDoc-kontrakten på dealens side.");
  }

  const existing = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });

  if (newStage === "MEETING_BOOKED" && !existing.meetingDate) {
    throw new Error("Åbn dealen og angiv en mødedato før den kan sættes til 'Møde booket'.");
  }

  const stageDateUpdates: Record<string, Date> = {};
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

export async function renewContract(dealId: string, formData: FormData) {
  await requireUser();

  const newValueRaw = String(formData.get("newValue") || "");
  const newBindingMonthsRaw = String(formData.get("newBindingMonths") || "");
  const contractLink = String(formData.get("contractLink") || "").trim() || null;
  const establishmentFeeRaw = String(formData.get("establishmentFee") || "");

  const newValue = Math.round(parseFloat(newValueRaw));
  const newBindingMonths = parseInt(newBindingMonthsRaw, 10);
  if (isNaN(newValue) || newValue < 0) throw new Error("Angiv en gyldig ny kontraktværdi.");
  if (!newBindingMonths || newBindingMonths <= 0) throw new Error("Angiv en gyldig ny bindingsperiode.");
  const establishmentFee = establishmentFeeRaw ? Math.round(parseFloat(establishmentFeeRaw)) : null;

  const existing = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  const newTermNumber = existing.currentTermNumber + 1;

  await prisma.$transaction([
    prisma.contractRenewal.create({
      data: {
        dealId,
        termNumber: newTermNumber,
        previousValue: existing.saleAmount ?? 0,
        previousBindingMonths: existing.bindingMonths ?? 0,
        newValue,
        newBindingMonths,
        contractLink,
        establishmentFee,
      },
    }),
    prisma.deal.update({
      where: { id: dealId },
      data: {
        saleAmount: newValue,
        bindingMonths: newBindingMonths,
        contractSignedAt: new Date(),
        billingStartDate: new Date(),
        contractLink: contractLink ?? existing.contractLink,
        establishmentFee,
        currentTermNumber: newTermNumber,
        churnedAt: null,
        terminationNoticeAt: null,
        contractEndDate: null,
        stage: existing.stage === "LOST" ? "CONTRACT_SIGNED" : existing.stage,
      },
    }),
  ]);

  await recalcCommission(dealId);

  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
  revalidatePath("/commission");
  redirect(`/deals/${dealId}?saved=Kontrakt%20fornyet`);
}

export async function markCommissionPaid(commissionId: string) {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan markere provision som udbetalt");
  await prisma.commission.update({
    where: { id: commissionId },
    data: { status: "PAID", paidAt: new Date() },
  });
  revalidatePath("/commission");
}
