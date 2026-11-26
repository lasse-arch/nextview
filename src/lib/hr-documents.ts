import "server-only";
import { prisma } from "@/lib/db";
import { isIntegrationEnabled } from "@/lib/integration-settings";
import { findOrCreateFolder, uploadPdfToDrive } from "@/lib/google-drive";
import { getValidAccessToken } from "@/lib/google-calendar";
import { findArchivingGoogleAccount } from "@/lib/contract-drive-archive";

/*
 * An employee's papers: kept in Arpo's database (never a public file address - they hold pay and address), shown by
 * /api/hr/dokument/<id> only to an admin and the person themself, and copied to Google Drev in its own folder when
 * Drev is on. Kept out of the "use server" files - called by checked actions and the DocuSeal webhook.
 */

export const HR_DRIVE_FOLDER = "Nextview360 - Ansættelseskontrakter";
const MAX_BYTES = 15 * 1024 * 1024;

/** A real PDF of a sensible size - checked by its bytes, not by its name or the type the browser claims. */
export function checkPdf(buf: Buffer): string | null {
  if (!buf.length) return "Vælg PDF-filen med kontrakten.";
  if (buf.length > MAX_BYTES) return "Filen er for stor (højst 15 MB).";
  if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") return "Filen er ikke en PDF.";
  return null;
}

/** The uploaded file from a form, checked. */
export async function pdfFrom(f: FormData, field: string): Promise<{ buf: Buffer; name: string } | { error: string }> {
  const file = f.get(field);
  if (!(file instanceof File) || !file.size) return { error: "Vælg PDF-filen med kontrakten." };
  if (file.size > MAX_BYTES) return { error: "Filen er for stor (højst 15 MB)." };
  const buf = Buffer.from(await file.arrayBuffer());
  const problem = checkPdf(buf);
  return problem ? { error: problem } : { buf, name: file.name };
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

/**
 * Saves a signed employment contract with the employee, and files a copy in Drev (when Drev is on). Drev failing never
 * loses the contract - it's in Arpo, and the card says the copy is missing.
 */
export async function saveContract(employeeId: string, pdf: Buffer, opts: { signedAt: Date; uploadedById?: string | null; personName: string }) {
  const name = safeName(`Ansættelseskontrakt ${opts.personName} ${opts.signedAt.toISOString().slice(0, 10)}`) + ".pdf";
  const doc = await prisma.employeeDocument.create({
    data: { employeeId, kind: "contract", name, contentType: "application/pdf", size: pdf.length, data: new Uint8Array(pdf), signedAt: opts.signedAt, uploadedById: opts.uploadedById ?? null },
    select: { id: true },
  });
  await copyToDrive(doc.id).catch((err) => console.error("[hr] kontrakten kom ikke i Drev", err instanceof Error ? err.message : err));
  return doc.id;
}

/** A document's copy in Drev - made now if it's missing. Throws with the reason. */
export async function copyToDrive(documentId: string): Promise<void> {
  if (!(await isIntegrationEnabled("GOOGLE_DRIVE"))) return;
  const doc = await prisma.employeeDocument.findUniqueOrThrow({ where: { id: documentId } });
  if (doc.driveFileId) return;
  const account = await findArchivingGoogleAccount();
  if (!account) throw new Error("Ingen Google-konto med Drev-adgang.");
  const folderId = await findOrCreateFolder(account, HR_DRIVE_FOLDER);
  const file = await uploadPdfToDrive(account, folderId, doc.name, Buffer.from(doc.data));
  await prisma.employeeDocument.update({ where: { id: doc.id }, data: { driveFileId: file.id } });
}

/** Removes Drev copies (when HR clears a former employee's papers). Best effort - a failure is logged. */
export async function deleteDriveCopies(fileIds: string[]): Promise<void> {
  if (!fileIds.length) return;
  const account = await findArchivingGoogleAccount();
  if (!account) return;
  const token = await getValidAccessToken(account);
  for (const id of fileIds) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok && res.status !== 404) console.error("[hr] kunne ikke slette en kontrakt i Drev", res.status);
  }
}
