"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import type { AbsenceKind, EmploymentKind, PayModel, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { WORKSPACE_DOMAIN, createWorkspaceUser, onOurDomain, workspaceReady } from "@/lib/google-workspace";
import { WORKSPACE_MAIL_APPROVED, sendWorkspaceMail } from "@/lib/workspace-mail";
import { copyToDrive, pdfFrom, saveContract } from "@/lib/hr-documents";
import { hashPassword } from "@/lib/password";
import { TEAM_ROLES } from "@/lib/team-roles";
import { employeeFor, hrViewer, isHrAdmin, requireHrAdmin } from "@/lib/hr-access";
import { ABSENCE_NAMES, KIND_NAMES, PAY_NAMES, START_TASKS, STOP_TASKS, TRIP_KINDS, cleanPlate, addDays, isYmd, mondayOf, noticeEnd, normMinutes, parseHours, registersTime, todayDk, weekOf } from "@/lib/hr";

/*
 * HR's actions. Every one asks who is asking (lib/hr-access.ts) and only ever trusts the ids and values it checks
 * itself. Registered working time is never deleted: a change writes the new total and a row in WorkDayChange.
 */

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const day = (f: FormData, k: string) => {
  const v = str(f, k, 10);
  return isYmd(v) ? v : null;
};
const asDate = (s: string) => new Date(`${s}T00:00:00Z`);
const ymdOfDate = (d: Date) => d.toISOString().slice(0, 10);
const kronerToOre = (raw: string): number | null => {
  const s = raw.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n < 10_000_000 ? Math.round(n * 100) : null;
};
const pct = (raw: string): number | null => {
  const n = Number(raw.replace(",", "."));
  return raw && Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
};
const oneOf = <T extends string>(v: string, all: readonly T[], fallback: T): T => ((all as readonly string[]).includes(v) ? (v as T) : fallback);
const KINDS = Object.keys(KIND_NAMES) as EmploymentKind[];
const MODELS = Object.keys(PAY_NAMES) as PayModel[];
const ABSENCES = Object.keys(ABSENCE_NAMES) as AbsenceKind[];
const back = (path: string, msg: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}saved=${encodeURIComponent(msg)}`);

/** The employment terms from the form (shared by create and update). */
function termsFrom(f: FormData) {
  const kind = oneOf(str(f, "kind"), KINDS, "SALARIED");
  const title = str(f, "title", 120);
  const startDate = day(f, "startDate");
  const endDate = day(f, "endDate");
  const probationEnd = day(f, "probationEnd");
  const hours = Number(str(f, "weeklyHours").replace(",", ".") || "37");
  const workDays = f
    .getAll("workDays")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
  if (!title) throw new Error("Skriv en stilling.");
  if (!startDate) throw new Error("Vælg den første arbejdsdag.");
  if (endDate && endDate < startDate) throw new Error("Sidste arbejdsdag ligger før den første.");
  if (probationEnd && probationEnd < startDate) throw new Error("Prøvetiden slutter før ansættelsen begynder.");
  if (!Number.isFinite(hours) || hours < 0 || hours > 48) throw new Error("Timer om ugen skal være mellem 0 og 48.");
  if (kind !== "FREELANCE" && !workDays.length) throw new Error("Vælg mindst én arbejdsdag.");
  return {
    kind,
    title,
    startDate: asDate(startDate),
    endDate: endDate ? asDate(endDate) : null,
    probationEnd: probationEnd ? asDate(probationEnd) : null,
    weeklyMinutes: kind === "FREELANCE" ? 0 : Math.round(hours * 60),
    workDays: [...new Set(workDays)].sort(),
    payrollNumber: str(f, "payrollNumber", 40) || null,
    note: str(f, "note", 2000) || null,
    rule120: kind === "SALARIED" && f.get("rule120") === "on",
    duties: str(f, "duties", 300) || null,
  };
}

async function managerFrom(f: FormData, selfUserId: string | null): Promise<string | null> {
  const id = str(f, "managerId", 40);
  if (!id || id === selfUserId) return null;
  const u = await prisma.user.findUnique({ where: { id }, select: { id: true, disabledAt: true } });
  return u && !u.disabledAt ? u.id : null;
}

function payFrom(f: FormData, kind: EmploymentKind) {
  const model = kind === "FREELANCE" ? "INVOICE" : oneOf(str(f, "payModel"), MODELS.filter((m) => m !== "INVOICE"), "MONTHLY");
  const monthlyOre = kronerToOre(str(f, "monthly"));
  const hourlyOre = kronerToOre(str(f, "hourly"));
  if ((model === "MONTHLY" || model === "MONTHLY_COMMISSION") && !monthlyOre) throw new Error("Skriv månedslønnen.");
  if (model === "HOURLY" && !hourlyOre) throw new Error("Skriv timelønnen.");
  return {
    model: model as PayModel,
    monthlyOre: model === "MONTHLY" || model === "MONTHLY_COMMISSION" ? monthlyOre : null,
    hourlyOre: model === "HOURLY" ? hourlyOre : null,
    commissionPct: model === "MONTHLY_COMMISSION" || model === "COMMISSION_ONLY" || model === "INVOICE" ? pct(str(f, "commissionPct")) : null,
    pensionEmployeePct: kind === "FREELANCE" ? null : pct(str(f, "pensionEmployeePct")),
    pensionEmployerPct: kind === "FREELANCE" ? null : pct(str(f, "pensionEmployerPct")),
    note: str(f, "payNote", 500) || null,
  };
}

/** A new person in HR: an existing Arpo user, or a new one (role Medarbejder unless chosen) who logs in with Google. */
export async function createEmployee(f: FormData) {
  const admin = await requireHrAdmin();
  const terms = termsFrom(f);
  // "Vi har allerede en underskrevet kontrakt": checked before anything is made, so a bad file leaves nothing half-done.
  const signed = f.get("contractMode") === "signed" ? await signedContractFrom(f) : null;
  let userId = str(f, "userId", 40);
  let newPerson: { privateEmail: string } | null = null;
  let ownEmail: string | null = null;
  if (userId) {
    const u = await prisma.user.findUnique({ where: { id: userId }, include: { employee: { select: { id: true } } } });
    if (!u) throw new Error("Brugeren findes ikke.");
    if (u.employee) throw new Error(`${u.name} er allerede i HR.`);
    // Someone already in Arpo: their own e-mail and phone from the form (the address is saved below).
    const email = str(f, "email", 200).toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Den private e-mail ser forkert ud.");
    ownEmail = email || null;
    const phone = str(f, "phone", 30);
    if (phone) await prisma.user.update({ where: { id: userId }, data: { phone } });
  } else {
    const name = str(f, "name", 80);
    const lastName = str(f, "lastName", 80) || null;
    const email = str(f, "email", 200).toLowerCase();
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Skriv navn og en gyldig e-mail.");
    if (await prisma.user.findUnique({ where: { email } })) throw new Error("Der findes allerede en bruger med den e-mail - vælg personen på listen.");
    const role = oneOf(str(f, "role"), TEAM_ROLES.filter((r) => r !== "ADMIN"), "EMPLOYEE") as Role;
    // No access to Arpo yet: they're let in once the contract is signed and they have a work account (activateAccess).
    // No password either: they log in with Google - a long random one nobody knows keeps the password door shut.
    const u = await prisma.user.create({
      data: {
        name,
        lastName,
        email,
        phone: str(f, "phone", 30) || null,
        role,
        disabledAt: new Date(),
        passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
        isCommissionBased: false,
        canAccessBilling: false,
        commissionRate: 0,
      },
    });
    userId = u.id;
    newPerson = { privateEmail: email };
  }
  const pay = payFrom(f, terms.kind);
  const e = await prisma.employee.create({
    data: {
      ...terms,
      userId,
      privateEmail: newPerson?.privateEmail ?? ownEmail,
      homeAddress: str(f, "homeAddress", 200) || null,
      managerId: await managerFrom(f, userId),
      pay: { create: { ...pay, effectiveFrom: terms.startDate, createdById: admin.id } },
      tasks: { create: (terms.kind === "FREELANCE" ? START_TASKS.filter((t) => !/lønsystemet|Pension/.test(t)) : START_TASKS).map((label, sort) => ({ phase: "start", label, sort })) },
    },
  });
  // "Garantiløn" in the wizard: from the chosen day (never before the first day of work), else the first day.
  const guarantee = kronerToOre(str(f, "guarantee", 20));
  const guaranteeFrom = day(f, "guaranteeFrom");
  if (guarantee && guarantee > 0 && guarantee <= 100_000_000)
    await prisma.contractTerm.create({ data: { employeeId: e.id, kind: "GUARANTEE", amountOre: guarantee, from: guaranteeFrom && asDate(guaranteeFrom) > terms.startDate ? asDate(guaranteeFrom) : terms.startDate, createdById: admin.id } });
  if (signed) await storeSignedContract(e.id, signed, admin.id);
  revalidatePath("/arpo/hr");
  back(`/arpo/hr/${e.id}`, signed ? "Medarbejderen er oprettet, og kontrakten er gemt" : newPerson ? "Medarbejderen er oprettet - næste skridt er kontrakten" : "Medarbejderen er oprettet");
}

/** The signed contract from a form: the PDF (checked by its bytes) and the day it was signed. */
async function signedContractFrom(f: FormData): Promise<{ pdf: Buffer; signedAt: Date }> {
  const file = await pdfFrom(f, "contractFile");
  if ("error" in file) throw new Error(file.error);
  const signedOn = day(f, "contractSignedOn");
  if (!signedOn) throw new Error("Vælg datoen, kontrakten blev underskrevet.");
  if (signedOn > todayDk()) throw new Error("Underskriftsdatoen kan ikke ligge i fremtiden.");
  return { pdf: file.buf, signedAt: asDate(signedOn) };
}

/** Keeps the contract (Arpo + Drev), marks the contract signed and its checklist line done. */
async function storeSignedContract(employeeId: string, c: { pdf: Buffer; signedAt: Date }, adminId: string) {
  const e = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, include: { user: { select: { name: true, lastName: true } } } });
  await saveContract(e.id, c.pdf, { signedAt: c.signedAt, uploadedById: adminId, personName: `${e.user.name}${e.user.lastName ? ` ${e.user.lastName}` : ""}` });
  await prisma.$transaction([
    prisma.employee.update({ where: { id: e.id }, data: { contractSignedAt: e.contractSignedAt ?? c.signedAt } }),
    prisma.hrTask.updateMany({ where: { employeeId: e.id, phase: "start", label: { startsWith: "Ansættelseskontrakt" }, doneAt: null }, data: { doneAt: new Date(), doneById: adminId } }),
  ]);
}

/** "Læg en underskrevet kontrakt ind" on the card - for a contract signed outside Arpo (e.g. on paper). */
export async function uploadSignedContract(employeeId: string, f: FormData) {
  const admin = await requireHrAdmin();
  const e = await prisma.employee.findUnique({ where: { id: String(employeeId) }, select: { id: true } });
  if (!e) throw new Error("Medarbejderen findes ikke.");
  await storeSignedContract(e.id, await signedContractFrom(f), admin.id);
  revalidatePath(`/arpo/hr/${e.id}`);
  back(`/arpo/hr/${e.id}`, "Kontrakten er gemt");
}

/**
 * "Særlige vilkår": a guaranteed minimum pay a month (counted against pay + hours + commission in lønsedler-grundlaget)
 * or another agreed term in words - from a date, maybe to one. They stand in the contract's § 17.
 */
export async function addContractTerm(employeeId: string, f: FormData) {
  const admin = await requireHrAdmin();
  const e = await prisma.employee.findUnique({ where: { id: String(employeeId) }, select: { id: true } });
  if (!e) throw new Error("Medarbejderen findes ikke.");
  await prisma.contractTerm.create({ data: { ...termFrom(f), employeeId: e.id, createdById: admin.id } });
  revalidatePath(`/arpo/hr/${e.id}`);
  back(`/arpo/hr/${e.id}`, "Vilkåret er gemt");
}

function termFrom(f: FormData) {
  const kind = str(f, "termKind") === "OTHER" ? "OTHER" : "GUARANTEE";
  const from = day(f, "termFrom");
  const to = day(f, "termTo");
  if (!from) throw new Error("Vælg datoen, vilkåret gælder fra.");
  if (to && to < from) throw new Error("Slutdatoen ligger før startdatoen.");
  if (kind === "GUARANTEE") {
    const amountOre = kronerToOre(str(f, "termAmount", 20));
    if (!amountOre || amountOre <= 0 || amountOre > 100_000_000) throw new Error("Skriv garantilønnen i kr. om måneden.");
    return { kind, amountOre, title: null, text: null, from: asDate(from), to: to ? asDate(to) : null };
  }
  const title = str(f, "termTitle", 80);
  const text = str(f, "termText", 1000);
  if (!title || !text) throw new Error("Skriv en overskrift og hvad der er aftalt.");
  return { kind, amountOre: null, title, text, from: asDate(from), to: to ? asDate(to) : null };
}

/** Ends a term on a date (it stays in the history and in contracts already signed). */
export async function endContractTerm(termId: string, f: FormData) {
  await requireHrAdmin();
  const t = await prisma.contractTerm.findUnique({ where: { id: String(termId) } });
  if (!t) throw new Error("Vilkåret findes ikke.");
  const to = day(f, "termTo");
  if (!to || asDate(to) < t.from) throw new Error("Vælg en slutdato efter startdatoen.");
  await prisma.contractTerm.update({ where: { id: t.id }, data: { to: asDate(to) } });
  revalidatePath(`/arpo/hr/${t.employeeId}`);
  back(`/arpo/hr/${t.employeeId}`, "Vilkåret slutter den valgte dag");
}

/** Removes a term made by mistake. */
export async function deleteContractTerm(termId: string) {
  await requireHrAdmin();
  const t = await prisma.contractTerm.findUnique({ where: { id: String(termId) } });
  if (!t) throw new Error("Vilkåret findes ikke.");
  await prisma.contractTerm.delete({ where: { id: t.id } });
  revalidatePath(`/arpo/hr/${t.employeeId}`);
  back(`/arpo/hr/${t.employeeId}`, "Vilkåret er slettet");
}

/** "Læg i Drev" for a document whose copy is missing (Drev was off, or failed). */
export async function copyDocumentToDrive(documentId: string) {
  await requireHrAdmin();
  const d = await prisma.employeeDocument.findUnique({ where: { id: String(documentId) }, select: { id: true, employeeId: true } });
  if (!d) throw new Error("Dokumentet findes ikke.");
  await copyToDrive(d.id);
  revalidatePath(`/arpo/hr/${d.employeeId}`);
  back(`/arpo/hr/${d.employeeId}`, "Kopien ligger i Drev");
}

/**
 * Adgang til Arpo: once the contract is signed and they have a work account (Google, e.g. @nextview360.dk), the person's
 * login becomes that address and is opened. Their own address stays on the card.
 */
export async function activateAccess(employeeId: string, f: FormData) {
  const admin = await requireHrAdmin();
  const e = await prisma.employee.findUnique({ where: { id: String(employeeId) }, include: { user: { select: { id: true, email: true, name: true, lastName: true } } } });
  if (!e) throw new Error("Medarbejderen findes ikke.");
  const email = str(f, "workEmail", 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Skriv arbejds-e-mailen (Google-kontoen).");
  const other = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (other && other.id !== e.userId) throw new Error("Den e-mail bruges allerede af en anden bruger.");
  const privateEmail = e.privateEmail ?? (e.user.email !== email ? e.user.email : null);

  // "Opret Google-kontoen også": made before anything changes in Arpo, so a no from Google leaves the card as it was.
  let password: string | null = null;
  if (f.get("createGoogle") === "on") {
    if (!WORKSPACE_MAIL_APPROVED) throw new Error("Mailen med login er ikke godkendt endnu - opret kontoen i Google Admin indtil da.");
    if (!workspaceReady()) throw new Error("Google Workspace er ikke sat op i Arpo endnu (se docs/google-workspace.md).");
    if (!onOurDomain(email)) throw new Error(`Arbejds-mailen skal ende på @${WORKSPACE_DOMAIN}.`);
    if (!privateEmail || onOurDomain(privateEmail)) throw new Error("Medarbejderen mangler en privat e-mail at sende login til - skriv den på kortet først.");
    ({ password } = await createWorkspaceUser({ email, givenName: e.user.name, familyName: e.user.lastName ?? "" }));
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: e.userId }, data: { email, disabledAt: null, sessionVersion: { increment: 1 } } }),
    prisma.employee.update({ where: { id: e.id }, data: { privateEmail } }),
    prisma.hrTask.updateMany({ where: { employeeId: e.id, phase: "start", label: { startsWith: "Google-konto" }, doneAt: null }, data: { doneAt: new Date(), doneById: admin.id } }),
  ]);
  if (password && privateEmail) {
    try {
      await sendWorkspaceMail("new", privateEmail, e.user.name, email, password);
    } catch (err) {
      // The password is never shown or kept - a new one is made in Google Admin.
      console.error("[hr] login-mail fejlede", err instanceof Error ? err.message : err);
      back(`/arpo/hr/${e.id}`, `Google-kontoen ${email} er oprettet, men mailen med login kunne ikke sendes - nulstil adgangskoden under Brugere`);
    }
    back(`/arpo/hr/${e.id}`, `Google-kontoen ${email} er oprettet, og login er sendt til ${privateEmail}`);
  }
  back(`/arpo/hr/${e.id}`, `Adgangen er åben - ${email} kan logge ind med Google`);
}

export async function updateEmployee(employeeId: string, f: FormData) {
  await requireHrAdmin();
  const e = await prisma.employee.findUnique({ where: { id: String(employeeId) } });
  if (!e) throw new Error("Medarbejderen findes ikke.");
  const terms = termsFrom(f);
  // Contact (in the contract): their own e-mail, phone and address - only when the form has them.
  const contact = f.has("privateEmail") ? contactFrom(f) : null;
  if (contact) await prisma.user.update({ where: { id: e.userId }, data: { phone: contact.phone } });
  const carry = Number(str(f, "vacationCarryDays").replace(",", ".") || "0");
  const carryFrom = day(f, "vacationCarryFrom");
  await prisma.employee.update({
    where: { id: e.id },
    data: {
      ...terms,
      managerId: await managerFrom(f, e.userId),
      ...(contact ? { privateEmail: contact.privateEmail, homeAddress: contact.homeAddress } : {}),
      vacationCarryDays: Number.isFinite(carry) && carry >= -30 && carry <= 60 ? carry : 0,
      vacationCarryFrom: carryFrom ? asDate(carryFrom) : null,
    },
  });
  revalidatePath(`/arpo/hr/${e.id}`);
  back(`/arpo/hr/${e.id}`, "Gemt");
}

/** A person's own e-mail, phone and address from a form - checked. */
function contactFrom(f: FormData) {
  const privateEmail = str(f, "privateEmail", 200).toLowerCase() || null;
  if (privateEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(privateEmail)) throw new Error("Den private e-mail ser forkert ud.");
  return { privateEmail, phone: str(f, "phone", 30) || null, homeAddress: str(f, "homeAddress", 200) || null };
}

/** New pay from a date - the earlier terms stay as history. */
export async function addPayTerms(employeeId: string, f: FormData) {
  const admin = await requireHrAdmin();
  const e = await prisma.employee.findUnique({ where: { id: String(employeeId) } });
  if (!e) throw new Error("Medarbejderen findes ikke.");
  const from = day(f, "effectiveFrom");
  if (!from) throw new Error("Vælg datoen, lønnen gælder fra.");
  await prisma.payTerms.create({ data: { ...payFrom(f, e.kind), employeeId: e.id, effectiveFrom: asDate(from), createdById: admin.id } });
  revalidatePath(`/arpo/hr/${e.id}`);
  back(`/arpo/hr/${e.id}`, "Lønnen er gemt");
}

/**
 * A week's registered time: each day's total (filled in with the agreed hours, corrected where it differs).
 * The employee saves and confirms their own week until it's approved; their leader or an admin may correct it
 * (also after approval - only an admin). Every change is kept.
 */
export async function saveWeek(employeeId: string, monday: string, back_: string, f: FormData) {
  const viewer = await hrViewer();
  const { e, reach } = await employeeFor(viewer, employeeId);
  if (!registersTime(e.kind)) throw new Error("Freelancere registrerer ikke arbejdstid.");
  if (!isYmd(monday) || mondayOf(monday) !== monday) throw new Error("Ugen findes ikke.");
  const week = await prisma.workWeek.findUnique({ where: { employeeId_weekStart: { employeeId: e.id, weekStart: asDate(monday) } } });
  if (week?.approvedAt && reach !== "admin") throw new Error("Ugen er godkendt - bed en admin om at rette den.");
  const today = todayDk();
  const submit = f.get("submit") === "1";
  const terms = { startDate: ymdOfDate(e.startDate), endDate: e.endDate ? ymdOfDate(e.endDate) : null, weeklyMinutes: e.weeklyMinutes, workDays: e.workDays };
  const days = weekOf(monday);
  const values = days.map((d) => {
    const m = parseHours(str(f, `d_${d}`, 8));
    if (m === null) throw new Error(`Tjek timerne for ${d} (0-24 timer, fx 7,4 eller 7:24).`);
    return { d, m };
  });
  if (submit && days[0] > today) throw new Error("Ugen er ikke begyndt endnu.");
  const old = await prisma.workDay.findMany({ where: { employeeId: e.id, date: { gte: asDate(days[0]), lte: asDate(days[6]) } } });
  const oldOf = new Map(old.map((w) => [ymdOfDate(w.date), w.minutes]));
  await prisma.$transaction(async (tx) => {
    for (const { d, m } of values) {
      // Days that haven't come yet, and days outside the employment, aren't registered.
      if (d > today || d < terms.startDate || (terms.endDate && d > terms.endDate)) continue;
      const before = oldOf.get(d);
      if (before === m) continue;
      if (before === undefined && !submit && m === normMinutes(terms, d)) continue; // still just the prefill
      await tx.workDay.upsert({ where: { employeeId_date: { employeeId: e.id, date: asDate(d) } }, create: { employeeId: e.id, date: asDate(d), minutes: m, updatedById: viewer.id }, update: { minutes: m, updatedById: viewer.id } });
      await tx.workDayChange.create({ data: { employeeId: e.id, date: asDate(d), oldMinutes: before ?? null, newMinutes: m, byId: viewer.id } });
    }
    if (submit)
      await tx.workWeek.upsert({
        where: { employeeId_weekStart: { employeeId: e.id, weekStart: asDate(monday) } },
        create: { employeeId: e.id, weekStart: asDate(monday), submittedAt: new Date() },
        update: { submittedAt: new Date() },
      });
  });
  revalidatePath("/arpo/mig");
  back(back_.startsWith("/arpo/") ? back_ : "/arpo/mig", submit ? "Ugen er registreret" : "Gemt");
}

/** A leader (or an admin) approves a registered week - never their own, unless they're an admin. */
export async function approveWeek(employeeId: string, monday: string, back_: string) {
  const viewer = await hrViewer();
  const { e } = await employeeFor(viewer, employeeId, isHrAdmin(viewer) ? "see" : "approve");
  if (!isYmd(monday)) throw new Error("Ugen findes ikke.");
  const week = await prisma.workWeek.findUnique({ where: { employeeId_weekStart: { employeeId: e.id, weekStart: asDate(monday) } } });
  if (!week?.submittedAt) throw new Error("Ugen er ikke registreret af medarbejderen endnu.");
  await prisma.workWeek.update({ where: { id: week.id }, data: { approvedAt: new Date(), approvedById: viewer.id } });
  revalidatePath("/arpo/mig/team");
  back(back_.startsWith("/arpo/") ? back_ : "/arpo/mig/team", "Ugen er godkendt");
}

/** Opens an approved week again (an admin) - e.g. when a day must be corrected. */
export async function reopenWeek(employeeId: string, monday: string) {
  await requireHrAdmin();
  if (!isYmd(monday)) throw new Error("Ugen findes ikke.");
  await prisma.workWeek.updateMany({ where: { employeeId: String(employeeId), weekStart: asDate(monday) }, data: { approvedAt: null, approvedById: null } });
  back(`/arpo/hr/${employeeId}?uge=${monday}`, "Ugen er åbnet igen");
}

/**
 * Absence: the employee asks (holiday, time off, leave) - or reports sickness, which needs no approval. A leader
 * or an admin registering it for someone approves it at once.
 */
export async function requestAbsence(employeeId: string, back_: string, f: FormData) {
  const viewer = await hrViewer();
  const { e, reach } = await employeeFor(viewer, employeeId);
  if (!registersTime(e.kind)) throw new Error("Freelancere har ikke fravær i HR.");
  const kind = oneOf(str(f, "kind"), ABSENCES, "VACATION");
  const from = day(f, "from");
  const to = day(f, "to") ?? from;
  if (!from || !to || to < from) throw new Error("Vælg fra og til.");
  if (to > addDays(from, 366)) throw new Error("Højst et år ad gangen.");
  const sickness = kind === "SICK" || kind === "CHILD_SICK";
  const byOther = reach !== "self";
  await prisma.absence.create({
    data: {
      employeeId: e.id,
      kind,
      from: asDate(from),
      to: asDate(to),
      halfDay: f.get("halfDay") === "on",
      note: str(f, "note", 500) || null,
      requestedById: viewer.id,
      ...(sickness || byOther ? { status: "APPROVED", decidedById: viewer.id, decidedAt: new Date() } : {}),
    },
  });
  revalidatePath("/arpo/mig");
  back(back_.startsWith("/arpo/") ? back_ : "/arpo/mig", sickness ? "Sygdom er registreret - god bedring" : byOther ? "Fraværet er registreret" : "Sendt til godkendelse");
}

export async function decideAbsence(absenceId: string, approve: boolean, back_: string) {
  const viewer = await hrViewer();
  const a = await prisma.absence.findUnique({ where: { id: String(absenceId) } });
  if (!a) throw new Error("Fraværet findes ikke.");
  await employeeFor(viewer, a.employeeId, isHrAdmin(viewer) ? "see" : "approve");
  if (a.status !== "REQUESTED") throw new Error("Fraværet er allerede afgjort.");
  await prisma.absence.update({ where: { id: a.id }, data: { status: approve ? "APPROVED" : "REJECTED", decidedById: viewer.id, decidedAt: new Date() } });
  revalidatePath("/arpo/mig/team");
  back(back_.startsWith("/arpo/") ? back_ : "/arpo/mig/team", approve ? "Godkendt" : "Afvist");
}

/** The employee takes back a request (or a holiday not begun yet); an admin may cancel any. */
export async function cancelAbsence(absenceId: string, back_: string) {
  const viewer = await hrViewer();
  const a = await prisma.absence.findUnique({ where: { id: String(absenceId) } });
  if (!a) throw new Error("Fraværet findes ikke.");
  const { reach } = await employeeFor(viewer, a.employeeId);
  const notBegun = ymdOfDate(a.from) > todayDk();
  if (reach !== "admin" && !(a.status === "REQUESTED" || (a.status === "APPROVED" && notBegun))) throw new Error("Fraværet er begyndt - bed en admin om at rette det.");
  await prisma.absence.update({ where: { id: a.id }, data: { status: "CANCELLED", decidedById: viewer.id, decidedAt: new Date() } });
  revalidatePath("/arpo/mig");
  back(back_.startsWith("/arpo/") ? back_ : "/arpo/mig", "Annulleret");
}

/**
 * Opsigelse: who gave notice and when - the last day of work is worked out under funktionærloven (lib/hr.ts
 * noticeEnd) unless another is written (an agreement, an hourly worker, a freelancer). The steps for leaving are
 * added, and the login closes by itself the day after the last day (lib/hr-retention.ts).
 */
export async function giveNotice(employeeId: string, f: FormData) {
  await requireHrAdmin();
  const e = await prisma.employee.findUnique({ where: { id: String(employeeId) }, include: { tasks: { where: { phase: "stop" }, select: { id: true } } } });
  if (!e) throw new Error("Medarbejderen findes ikke.");
  const by = str(f, "by") === "employee" ? "employee" : "employer";
  const noticeDay = day(f, "noticeDay");
  if (!noticeDay) throw new Error("Vælg datoen, opsigelsen blev givet.");
  const own = day(f, "lastDay");
  const law = noticeEnd(e.kind, ymdOfDate(e.startDate), e.probationEnd ? ymdOfDate(e.probationEnd) : null, noticeDay, by);
  const lastDay = own ?? law?.lastDay;
  if (!lastDay) throw new Error("Skriv sidste arbejdsdag - varslet følger her kontrakten, ikke funktionærloven.");
  if (lastDay < noticeDay) throw new Error("Sidste arbejdsdag ligger før opsigelsen.");
  await prisma.employee.update({
    where: { id: e.id },
    data: {
      noticeGivenAt: asDate(noticeDay),
      noticeBy: by,
      endDate: asDate(lastDay),
      ...(e.tasks.length ? {} : { tasks: { create: STOP_TASKS.map((label, sort) => ({ phase: "stop", label, sort })) } }),
    },
  });
  revalidatePath(`/arpo/hr/${e.id}`);
  back(`/arpo/hr/${e.id}`, `Sidste arbejdsdag er ${lastDay}`);
}

/** Takes the notice back (e.g. given by mistake) - the employment goes on. */
export async function withdrawNotice(employeeId: string) {
  await requireHrAdmin();
  await prisma.employee.update({ where: { id: String(employeeId) }, data: { noticeGivenAt: null, noticeBy: null, endDate: null } });
  back(`/arpo/hr/${employeeId}`, "Opsigelsen er trukket tilbage");
}

export async function toggleHrTask(taskId: string) {
  const admin = await requireHrAdmin();
  const t = await prisma.hrTask.findUnique({ where: { id: String(taskId) } });
  if (!t) throw new Error("Punktet findes ikke.");
  await prisma.hrTask.update({ where: { id: t.id }, data: t.doneAt ? { doneAt: null, doneById: null } : { doneAt: new Date(), doneById: admin.id } });
  revalidatePath(`/arpo/hr/${t.employeeId}`);
}

export async function addHrTask(employeeId: string, phase: string, f: FormData) {
  await requireHrAdmin();
  const label = str(f, "label", 200);
  if (!label) throw new Error("Skriv punktet.");
  const e = await prisma.employee.findUnique({ where: { id: String(employeeId) }, select: { id: true } });
  if (!e) throw new Error("Medarbejderen findes ikke.");
  await prisma.hrTask.create({ data: { employeeId: e.id, phase: phase === "stop" ? "stop" : "start", label, sort: 100 } });
  revalidatePath(`/arpo/hr/${e.id}`);
}

/**
 * Kørsel: a trip in one's own car for work - what Skattestyrelsen requires for tax-free kørepenge: the date, from
 * where to where (and stops), the purpose and the km. The employee registers their own; an admin approves it.
 */
export async function addTrip(employeeId: string, back_: string, f: FormData) {
  const viewer = await hrViewer();
  const { e, reach } = await employeeFor(viewer, employeeId);
  if (!registersTime(e.kind)) throw new Error("Freelancere får ikke kørepenge gennem lønnen - de fakturerer.");
  const date = day(f, "date");
  const from = str(f, "from", 200);
  const to = str(f, "to", 300);
  const purpose = str(f, "purpose", 300);
  const km = Number(str(f, "km", 10).replace(",", "."));
  const kind = oneOf(str(f, "kind"), TRIP_KINDS, "Andet");
  const plate = cleanPlate(str(f, "plate", 20)) || null;
  const dealId = str(f, "dealId", 40);
  const deal = dealId ? await prisma.deal.findUnique({ where: { id: dealId }, select: { id: true } }) : null;
  if (!date || date > todayDk()) throw new Error("Vælg datoen for turen (ikke en dag, der ikke er kommet).");
  if (!from || !to) throw new Error("Skriv hvorfra og hvortil (og eventuelle stop undervejs).");
  if (purpose.length < 3) throw new Error("Skriv formålet med turen, fx kundens navn og hvad du skulle.");
  if (!Number.isFinite(km) || km <= 0 || km > 2000) throw new Error("Skriv antal km (fx 42,5).");
  await prisma.trip.create({
    data: {
      employeeId: e.id,
      date: asDate(date),
      from,
      to,
      purpose,
      kind,
      plate,
      dealId: deal?.id ?? null,
      km: Math.round(km * 10) / 10,
      ...(reach === "admin" ? { status: "APPROVED", decidedById: viewer.id, decidedAt: new Date() } : {}),
    },
  });
  revalidatePath("/arpo/mig");
  back(back_.startsWith("/arpo/") ? back_ : "/arpo/mig", reach === "admin" ? "Turen er registreret" : "Turen er sendt til godkendelse");
}

export async function decideTrip(tripId: string, approve: boolean, back_: string) {
  const viewer = await hrViewer();
  const t = await prisma.trip.findUnique({ where: { id: String(tripId) } });
  if (!t) throw new Error("Turen findes ikke.");
  await employeeFor(viewer, t.employeeId, isHrAdmin(viewer) ? "see" : "approve");
  if (t.status !== "REQUESTED") throw new Error("Turen er allerede afgjort.");
  await prisma.trip.update({ where: { id: t.id }, data: { status: approve ? "APPROVED" : "REJECTED", decidedById: viewer.id, decidedAt: new Date() } });
  revalidatePath("/arpo/hr");
  back(back_.startsWith("/arpo/") ? back_ : "/arpo/hr", approve ? "Godkendt" : "Afvist");
}

/** Takes a trip back before it's approved (an admin: any). */
export async function cancelTrip(tripId: string, back_: string) {
  const viewer = await hrViewer();
  const t = await prisma.trip.findUnique({ where: { id: String(tripId) } });
  if (!t) throw new Error("Turen findes ikke.");
  const { reach } = await employeeFor(viewer, t.employeeId);
  if (reach !== "admin" && t.status !== "REQUESTED") throw new Error("Turen er godkendt - bed en admin om at rette den.");
  await prisma.trip.update({ where: { id: t.id }, data: { status: "CANCELLED", decidedById: viewer.id, decidedAt: new Date() } });
  back(back_.startsWith("/arpo/") ? back_ : "/arpo/mig", "Turen er annulleret");
}

/** The employee's own home address and number plates, for the kørselsregnskab (an admin may set them too). */
export async function saveCarDetails(employeeId: string, back_: string, f: FormData) {
  const viewer = await hrViewer();
  const { e, reach } = await employeeFor(viewer, employeeId);
  if (reach === "leader") throw new Error("Kun medarbejderen selv eller en admin kan rette det.");
  const plates = [...new Set(String(f.get("carPlates") ?? "").split(/[,;\n]+/).map(cleanPlate).filter(Boolean))].slice(0, 5);
  await prisma.employee.update({ where: { id: e.id }, data: { homeAddress: str(f, "homeAddress", 200) || null, carPlates: plates.join(", ") || null } });
  back(back_.startsWith("/arpo/") ? back_ : "/arpo/mig", "Gemt");
}

/**
 * The employment contract (the approved text, lib/employment-contract.ts) sent for signing through DocuSeal: to
 * Nextview360's signer and the employee. Once both have signed, the card and the start checklist show it.
 */
export async function sendEmploymentContract(employeeId: string, f: FormData) {
  await requireHrAdmin();
  const e = await prisma.employee.findUnique({ where: { id: String(employeeId) }, include: { user: { select: { name: true, lastName: true, email: true, phone: true } }, manager: { select: { name: true, lastName: true } }, pay: { orderBy: { effectiveFrom: "desc" }, take: 1 }, terms: { orderBy: { from: "asc" } } } });
  if (!e) throw new Error("Medarbejderen findes ikke.");
  const { contractProblem, employmentContractHtml, usesUnapprovedText } = await import("@/lib/employment-contract");
  const problem = contractProblem(e, e.pay[0]);
  if (problem) throw new Error(problem);
  if (usesUnapprovedText()) throw new Error("Den nye kontrakttekst venter på godkendelse - læs den som PDF først.");
  const { isDocuSealConfigured, createAndSendSubmission } = await import("@/lib/docuseal");
  if (!(await isDocuSealConfigured())) throw new Error("DocuSeal er ikke sat op eller er slået fra under Indstillinger.");
  const { renderContractPdf } = await import("@/lib/contract-pdf-renderer");
  const { CONTRACT_SIGNER } = await import("@/lib/contract-template-data");
  const sickTo = str(f, "sickTo", 80) || CONTRACT_SIGNER.name;
  const pdf = await renderContractPdf(employmentContractHtml(e, e.pay[0], sickTo, e.terms));
  const name = `${e.user.name}${e.user.lastName ? ` ${e.user.lastName}` : ""}`;
  const submission = await createAndSendSubmission({
    fileName: `Ansættelseskontrakt ${name}.pdf`,
    fileBuffer: pdf,
    documentName: `Ansættelseskontrakt - ${name}`,
    submitters: [
      { role: "Company", name: CONTRACT_SIGNER.name, email: CONTRACT_SIGNER.email, externalId: "director" },
      { role: "Employee", name, email: e.user.email, externalId: "employee" },
    ],
    metadata: { employeeId: e.id },
  });
  await prisma.employee.update({ where: { id: e.id }, data: { contractSubmissionId: String(submission.id), contractSentAt: new Date(), contractViewedAt: null, contractSignedAt: null } });
  back(`/arpo/hr/${e.id}`, "Kontrakten er sendt til underskrift");
}
