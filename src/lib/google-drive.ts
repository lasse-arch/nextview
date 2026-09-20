import { getValidAccessToken } from "@/lib/google-calendar";
import type { EmailAccount } from "@prisma/client";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";

/** Folder every signed contract gets filed into - created on first use. */
export const CONTRACTS_FOLDER_NAME = "Nextview360 - Underskrevne kontrakter";

/** Folder every generated customer visitor-stats report gets filed into. */
export const CUSTOMER_REPORTS_FOLDER_NAME = "Nextview360 - Besøgsrapporter";

/**
 * Finds a named folder among files this app has created, or creates it if it
 * doesn't exist yet. Scoped by drive.file, so this only ever sees/creates
 * files the app itself owns - never the connected account's other Drive
 * content.
 */
export async function findOrCreateFolder(account: EmailAccount, folderName: string): Promise<string> {
  const accessToken = await getValidAccessToken(account);

  const query = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`;
  const listRes = await fetch(`${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) throw new Error(`Google Drev-fejl ved mappesøgning (${listRes.status}): ${await listRes.text()}`);
  const listData = (await listRes.json()) as { files: { id: string; name: string }[] };
  if (listData.files.length > 0) return listData.files[0].id;

  const createRes = await fetch(`${DRIVE_API_BASE}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: folderName, mimeType: "application/vnd.google-apps.folder" }),
  });
  if (!createRes.ok) throw new Error(`Google Drev-fejl ved oprettelse af mappe (${createRes.status}): ${await createRes.text()}`);
  const created = (await createRes.json()) as { id: string };
  return created.id;
}

export async function findOrCreateContractsFolder(account: EmailAccount): Promise<string> {
  return findOrCreateFolder(account, CONTRACTS_FOLDER_NAME);
}

export async function findOrCreateCustomerReportsFolder(account: EmailAccount): Promise<string> {
  return findOrCreateFolder(account, CUSTOMER_REPORTS_FOLDER_NAME);
}

/** Uploads a PDF into the given Drive folder, returning its file ID and a viewable link. */
export async function uploadPdfToDrive(
  account: EmailAccount,
  folderId: string,
  fileName: string,
  pdfBuffer: Buffer
): Promise<{ id: string; webViewLink: string }> {
  const accessToken = await getValidAccessToken(account);

  const boundary = "nextview360-drive-upload";
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/pdf\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    `${pdfBuffer.toString("base64")}\r\n` +
    `--${boundary}--`;

  const res = await fetch(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,webViewLink`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) throw new Error(`Google Drev-fejl ved upload (${res.status}): ${await res.text()}`);
  return res.json();
}
