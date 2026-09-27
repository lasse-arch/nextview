"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function createEmailTemplate(
  formData: FormData
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const name = String(formData.get("name") || "").trim();
  const subject = String(formData.get("subject") || "").trim();
  const bodyHtml = String(formData.get("bodyHtml") || "").trim();
  if (!name || !subject || !bodyHtml) return { ok: false, error: "Udfyld navn, emne og indhold." };

  const template = await prisma.emailTemplate.create({ data: { name, subject, bodyHtml, createdById: user.id } });
  revalidatePath("/settings/email-templates");
  return { ok: true, id: template.id };
}

export async function updateEmailTemplate(
  templateId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const template = await prisma.emailTemplate.findUniqueOrThrow({ where: { id: templateId } });
  if (template.createdById !== user.id && user.role !== "ADMIN") {
    return { ok: false, error: "Du kan kun redigere dine egne skabeloner." };
  }

  const name = String(formData.get("name") || "").trim();
  const subject = String(formData.get("subject") || "").trim();
  const bodyHtml = String(formData.get("bodyHtml") || "").trim();
  if (!name || !subject || !bodyHtml) return { ok: false, error: "Udfyld navn, emne og indhold." };

  await prisma.emailTemplate.update({ where: { id: templateId }, data: { name, subject, bodyHtml } });
  revalidatePath("/settings/email-templates");
  return { ok: true };
}

export async function deleteEmailTemplate(templateId: string): Promise<void> {
  const user = await requireUser();
  const template = await prisma.emailTemplate.findUniqueOrThrow({ where: { id: templateId } });
  if (template.createdById !== user.id && user.role !== "ADMIN") {
    throw new Error("Du kan kun slette dine egne skabeloner.");
  }
  await prisma.emailTemplate.delete({ where: { id: templateId } });
  revalidatePath("/settings/email-templates");
}
