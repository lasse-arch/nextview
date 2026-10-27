import "server-only";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import { del, list, put } from "@vercel/blob";
import { prisma } from "@/lib/db";

/*
 * Arpo's own nightly backup - independent of the database provider (Prisma
 * Postgres' free plan keeps none). Every table, every row, as JSON lines,
 * gzipped and encrypted (AES-256-GCM) before it leaves the server, then put
 * in Vercel Blob. The newest KEEP are kept. scripts/restore-backup.ts puts a
 * backup back into an empty database.
 *
 * The key is BACKUP_KEY, or AUTH_SECRET when that isn't set - the file says
 * which. Keep a copy of the key outside Vercel (a password manager): without
 * it a backup can't be opened.
 */

const KEEP = 30;
const BATCH = 1000;
const MAGIC = Buffer.from("ARPOBAK1");

export function backupKey(source: "BACKUP_KEY" | "AUTH_SECRET"): Buffer | null {
  const secret = process.env[source];
  return secret ? createHash("sha256").update(secret).digest() : null;
}

/** The file layout: MAGIC, key source (1 = BACKUP_KEY, 2 = AUTH_SECRET), 12-byte IV, ciphertext, 16-byte auth tag. */
function encrypt(plain: Buffer): Buffer {
  const source = process.env.BACKUP_KEY ? "BACKUP_KEY" : "AUTH_SECRET";
  const key = backupKey(source);
  if (!key) throw new Error("Hverken BACKUP_KEY eller AUTH_SECRET er sat - backuppen kan ikke krypteres.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, Buffer.from([source === "BACKUP_KEY" ? 1 : 2]), iv, body, cipher.getAuthTag()]);
}

/** Every table as JSON lines: a {"table": …, "rows": n} line, then one line per row. */
async function dump(): Promise<{ text: string; tables: number; rows: number }> {
  const tables = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`
  );
  const lines: string[] = [];
  let rows = 0;
  for (const { name } of tables) {
    const quoted = `"${name.replaceAll('"', '""')}"`;
    const [{ n }] = await prisma.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM ${quoted}`);
    lines.push(JSON.stringify({ table: name, rows: n }));
    for (let offset = 0; offset < n; offset += BATCH) {
      const batch = await prisma.$queryRawUnsafe<{ j: string }[]>(`SELECT row_to_json(t)::text AS j FROM ${quoted} t ORDER BY ctid LIMIT ${BATCH} OFFSET ${offset}`);
      for (const r of batch) lines.push(r.j);
      rows += batch.length;
    }
  }
  return { text: lines.join("\n"), tables: tables.length, rows };
}

export type BackupResult = { ok: true; url: string; size: number; tables: number; rows: number; ms: number } | { ok: false; error: string };

/** The backup file itself: the whole database, packed and encrypted. */
export async function backupFile() {
  const { text, tables, rows } = await dump();
  return { file: encrypt(gzipSync(Buffer.from(text))), tables, rows };
}

/**
 * Where backups go: a private Blob store of their own when it's connected
 * (BACKUP_BLOB_READ_WRITE_TOKEN - nothing in it can be opened by a link),
 * else the shared one the tours' pictures are in. Encrypted either way.
 */
const store = () => {
  const own = process.env.BACKUP_BLOB_READ_WRITE_TOKEN;
  return own ? { token: own, access: "private" as const } : { token: process.env.BLOB_READ_WRITE_TOKEN, access: "public" as const };
};

/** Takes a backup now and removes the ones beyond the newest KEEP. */
export async function createBackup(): Promise<BackupResult> {
  const { token, access } = store();
  if (!token) return { ok: false, error: "Vercel Blob er ikke sat op (BLOB_READ_WRITE_TOKEN mangler)." };
  const started = Date.now();
  try {
    const { file, tables, rows } = await backupFile();
    const stamp = new Date().toISOString().slice(0, 16).replace(":", "");
    const blob = await put(`backups/arpo-${stamp}.bak`, file, { access, token, contentType: "application/octet-stream", addRandomSuffix: true });
    const all = await backups();
    if (all.length > KEEP) await del(all.slice(KEEP).map((b) => b.url), { token });
    return { ok: true, url: blob.url, size: file.length, tables, rows, ms: Date.now() - started };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** The backups there are, newest first. */
export async function backups() {
  const found: { url: string; pathname: string; size: number; uploadedAt: Date }[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "backups/", cursor, token: store().token });
    found.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return found.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
}
