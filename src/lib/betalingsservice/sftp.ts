/**
 * Automatic file exchange with Mastercard's My File Transfer over SFTP
 * ("Send filer med en SFTP-løsning i My File Transfer", January 2026):
 *
 * - Server 185.96.138.21, port 10022 (IP only, no DNS name), host key
 *   fingerprint SHA256:RHWE6QOfc5yc4VMmZVzWtEk3adFKEkVVen/nN+NZ2Ng - checked
 *   on every connection, so we never talk to anything else.
 * - Login is the mailbox UserID + an RSA 2048-bit key with a passphrase.
 *   The public key is registered by uploading it (once, via the HTTPS
 *   browser solution) as sshPublicKeyAdd.SFG.YYYYMMDDNNN.txt; a .OK receipt
 *   confirms it.
 * - Everything lives in the root folder ("/"). Received files start with
 *   T (transmission receipt), V (validation receipt), D (data, e.g. BS
 *   0602/0603), Z (zipped data) or F (følgeseddel).
 * - GET/PUT/DELETE only; don't keep timestamps; no constant polling, and
 *   close the session promptly - so this runs a few times a day, not in a
 *   loop.
 *
 * The private key never leaves the database except into memory for a
 * connection: it is encrypted at rest with a key derived from AUTH_SECRET
 * (and is itself passphrase-protected, as Mastercard requires).
 */
import { createCipheriv, createDecipheriv, createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import SftpClient from "ssh2-sftp-client";
import { utils as ssh2Utils } from "ssh2";
import { prisma } from "@/lib/db";
import { getBsSettings, importBsReturnFile, createBsDelivery, listPendingBsCollections, missingBsSettings } from "./service";

export const MFT_DEFAULT_HOST = "185.96.138.21";
export const MFT_DEFAULT_PORT = 10022;
const MFT_HOST_KEY_SHA256 = "RHWE6QOfc5yc4VMmZVzWtEk3adFKEkVVen/nN+NZ2Ng";

function encryptionKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET mangler - kan ikke gemme SFTP-nøglen sikkert.");
  return createHash("sha256").update(`betalingsservice-sftp:${secret}`).digest();
}

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

function decrypt(stored: string): string {
  const [iv, tag, data] = stored.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** Mastercard's required name for the public key file: sshPublicKeyAdd.SFG.YYYYMMDDNNN.txt */
export function publicKeyFileName(createdAt: Date, keyNumber = 1): string {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen" }).format(createdAt).replaceAll("-", "");
  return `sshPublicKeyAdd.SFG.${ymd}${String(keyNumber).padStart(3, "0")}.txt`;
}

/**
 * Makes a new RSA 2048-bit key pair with a random passphrase and stores it
 * (replacing any earlier one). Returns the public key in OpenSSH format - the
 * content of the file to upload to the mailbox.
 */
export async function generateSftpKey(): Promise<string> {
  const passphrase = randomBytes(24).toString("base64url");
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs1", format: "pem", cipher: "aes-256-cbc", passphrase },
  });
  const parsed = ssh2Utils.parseKey(privateKey, passphrase);
  if (parsed instanceof Error) throw parsed;
  const publicKey = `ssh-rsa ${parsed.getPublicSSH().toString("base64")} nextview360-betalingsservice`;

  await getBsSettings();
  await prisma.bsSettings.update({
    where: { id: "default" },
    data: {
      sftpPrivateKeyEnc: encrypt(privateKey),
      sftpPassphraseEnc: encrypt(passphrase),
      sftpPublicKey: publicKey,
      sftpKeyCreatedAt: new Date(),
    },
  });
  return publicKey;
}

type SftpSettings = Awaited<ReturnType<typeof getBsSettings>>;

function connectionProblem(s: SftpSettings): string | null {
  if (!s.sftpUser) return "Angiv jeres UserID (postkasse) i My File Transfer.";
  if (!s.sftpPrivateKeyEnc || !s.sftpPassphraseEnc) return "Generér en SSH-nøgle først.";
  return null;
}

async function withSftp<T>(s: SftpSettings, fn: (sftp: SftpClient) => Promise<T>): Promise<T> {
  const sftp = new SftpClient("betalingsservice");
  await sftp.connect({
    host: s.sftpHost || MFT_DEFAULT_HOST,
    port: s.sftpPort || MFT_DEFAULT_PORT,
    username: s.sftpUser!,
    privateKey: decrypt(s.sftpPrivateKeyEnc!),
    passphrase: decrypt(s.sftpPassphraseEnc!),
    readyTimeout: 30_000,
    retries: 1,
    hostVerifier: (key: Buffer) => {
      if (process.env.BS_SFTP_SKIP_HOST_CHECK === "1") return true;
      return createHash("sha256").update(key).digest("base64").replace(/=+$/, "") === MFT_HOST_KEY_SHA256;
    },
  });
  try {
    return await fn(sftp);
  } finally {
    await sftp.end().catch(() => {});
  }
}

export type SftpRunResult = { ok: boolean; lines: string[] };

/** Connects and lists the mailbox - "Test forbindelse". */
export async function testSftpConnection(): Promise<SftpRunResult> {
  const s = await getBsSettings();
  const problem = connectionProblem(s);
  if (problem) return { ok: false, lines: [problem] };
  try {
    const files = await withSftp(s, (sftp) => sftp.list("/"));
    return { ok: true, lines: [`Forbundet til My File Transfer. ${files.length} fil(er) i postkassen.`] };
  } catch (err) {
    return { ok: false, lines: [`Kunne ikke forbinde: ${err instanceof Error ? err.message : String(err)}`] };
  }
}

/**
 * Only files Mastercard puts in the mailbox for us are ever taken in (and
 * then deleted): receipts (T/V/F, and the .OK/.ERROR/.REJECTED answers to a
 * key upload) and data files (D, Z). Anything else - above all our own
 * uploaded BS 0601 files, which Mastercard may not have picked up yet - is
 * never read or deleted.
 */
export function classifyMailboxFile(fileName: string): "receipt" | "data" | null {
  if (/\.(OK|ERROR|REJECTED)$/i.test(fileName)) return "receipt";
  if (/^BS0601-/i.test(fileName) || /^sshPublicKey/i.test(fileName)) return null;
  const first = fileName.charAt(0).toUpperCase();
  if (first === "T" || first === "V" || first === "F") return "receipt";
  if (first === "D" || first === "Z") return "data";
  return null;
}

/** Deliveries waiting to go to Mastercard over SFTP, oldest first. */
export function queuedSftpUploads() {
  return prisma.bsDelivery.findMany({ where: { sendViaSftp: true, sftpSentAt: null }, orderBy: { sequence: "asc" } });
}

/**
 * Records an upload's outcome. A failed one is never retried by itself: the
 * upload may still have reached Mastercard, and a delivery must not be sent
 * twice unless a negative receipt says so - someone checks the receipts and
 * sends it again by hand.
 */
export async function recordSftpUpload(deliveryId: string, error: string | null): Promise<string> {
  const d = await prisma.bsDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
  if (error) {
    await prisma.bsDelivery.update({ where: { id: d.id }, data: { sftpError: error, sendViaSftp: false } });
    return `FEJL ved afsendelse af ${d.fileName}: ${error} - tjek kvitteringerne før den sendes igen.`;
  }
  await prisma.bsDelivery.update({
    where: { id: d.id },
    data: { sftpSentAt: new Date(), submittedAt: d.submittedAt ?? new Date(), sftpError: null },
  });
  return `Sendt: ${d.fileName}`;
}

/**
 * Takes in one file found in the mailbox: stored first, then (for BS
 * 0602/0603 data files) imported. Says whether it may now be deleted from
 * the mailbox - only Mastercard's own files that are safely stored, so
 * nothing is ever lost if a step fails half-way.
 */
export async function takeInMailboxFile(fileName: string, buffer: Buffer): Promise<{ delete: boolean; line: string | null }> {
  const kind = classifyMailboxFile(fileName);
  if (!kind) return { delete: false, line: null };
  if (await prisma.bsDelivery.findFirst({ where: { fileName }, select: { id: true } })) return { delete: false, line: null };
  const contentHash = createHash("sha256").update(buffer).digest("hex");
  const existing = await prisma.bsMailboxFile.findUnique({ where: { contentHash } });
  if (existing) return { delete: true, line: null };
  let note: string;
  if (kind === "data" && fileName.charAt(0).toUpperCase() === "D") {
    const result = await importBsReturnFile(fileName, buffer, null);
    note = result.ok ? result.lines.join("\n") : `Kunne ikke indlæses: ${result.error}`;
  } else {
    note = buffer.toString("latin1").slice(0, 2000);
  }
  await prisma.bsMailboxFile.create({
    data: { fileName, contentHash, size: buffer.length, content: new Uint8Array(buffer), kind, note },
  });
  return { delete: true, line: `Hentet: ${fileName}` };
}

/** "Lav og send automatisk": makes the day's BS 0601 file (queued for SFTP) when invoices are ready. */
export async function autoCreateDelivery(): Promise<string | null> {
  const s = await getBsSettings();
  if (!s.autoSend || missingBsSettings(s).length > 0) return null;
  const ready = (await listPendingBsCollections()).filter((p) => p.problems.length === 0 && !p.notYet);
  if (ready.length === 0) return null;
  const created = await createBsDelivery(null, { sendViaSftp: true });
  if (created.ok) await prisma.bsSettings.update({ where: { id: "default" }, data: { lastAutoDeliveryAt: new Date() } });
  return created.ok
    ? [`Betalingsfil lavet automatisk med ${created.collections} opkrævning(er).`, ...(created.notes ?? [])].join(" ")
    : `Kunne ikke lave betalingsfil automatisk: ${created.error}`;
}

/**
 * One exchange with the mailbox: upload every delivery queued for SFTP, then
 * take in everything waiting in the mailbox (see takeInMailboxFile).
 */
export async function runSftpExchange(options: { autoCreate?: boolean } = {}): Promise<SftpRunResult> {
  const s = await getBsSettings();
  const lines: string[] = [];
  const problem = connectionProblem(s);
  if (problem) return { ok: false, lines: [problem] };

  if (options.autoCreate) {
    const line = await autoCreateDelivery();
    if (line) lines.push(line);
  }

  try {
    await withSftp(s, async (sftp) => {
      const queued = await queuedSftpUploads();
      for (const d of queued) {
        let error: string | null = null;
        try {
          // Uploaded last and never touched again afterwards (Mastercard's
          // own advice) - the receipts arrive as separate T/V files.
          await sftp.put(Buffer.from(d.content), `/${d.fileName}`);
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
        }
        lines.push(await recordSftpUpload(d.id, error));
      }

      const files = (await sftp.list("/")).filter((f) => f.type === "-" && classifyMailboxFile(f.name));
      for (const f of files) {
        const buffer = (await sftp.get(`/${f.name}`)) as Buffer;
        const taken = await takeInMailboxFile(f.name, buffer);
        if (taken.line) lines.push(taken.line);
        if (taken.delete) {
          await sftp.delete(`/${f.name}`).catch((err: unknown) => {
            lines.push(`Kunne ikke slette ${f.name} fra postkassen: ${err instanceof Error ? err.message : String(err)}`);
          });
        }
      }
      if (files.length === 0 && queued.length === 0) lines.push("Intet at sende eller hente.");
    });
    await prisma.bsSettings.update({ where: { id: "default" }, data: { sftpLastRunAt: new Date(), sftpLastError: null } });
    return { ok: true, lines };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await prisma.bsSettings.update({ where: { id: "default" }, data: { sftpLastRunAt: new Date(), sftpLastError: error } });
    return { ok: false, lines: [...lines, `Forbindelsen fejlede: ${error}`] };
  }
}
