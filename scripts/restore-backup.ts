/*
 * Puts one of Arpo's nightly backups (src/lib/backup.ts) back into a database.
 *
 *   1. Make an empty Postgres database and give it Arpo's tables:
 *        DATABASE_URL=<new database> npx prisma migrate deploy
 *   2. Restore into it (the key the backup was made with - BACKUP_KEY, or AUTH_SECRET):
 *        BACKUP_KEY=<key> npx tsx scripts/restore-backup.ts <backup file or URL> <new database URL>
 *   3. Point Arpo's DATABASE_URL at the new database.
 *
 * Refuses a database in use (one with users or customers). Rows are put back in an
 * order that respects their links to each other (several passes, so the
 * order of the tables doesn't matter).
 */
import { createDecipheriv, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { PrismaClient } from "@prisma/client";

const MAGIC = "ARPOBAK1";
const BATCH = 500;

function decrypt(file: Buffer): Buffer {
  if (file.subarray(0, 8).toString() !== MAGIC) throw new Error("Det er ikke en Arpo-backup.");
  const source = file[8] === 1 ? "BACKUP_KEY" : "AUTH_SECRET";
  const secret = process.env[source];
  if (!secret) throw new Error(`Backuppen er krypteret med ${source} - sæt den som miljøvariabel.`);
  const key = createHash("sha256").update(secret).digest();
  const iv = file.subarray(9, 21);
  const tag = file.subarray(file.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(file.subarray(21, file.length - 16)), decipher.final()]);
}

async function main() {
  const [from, target] = process.argv.slice(2);
  if (!from || !target) throw new Error("Brug: npx tsx scripts/restore-backup.ts <backup-fil eller URL> <database-URL>");
  const raw = /^https?:\/\//.test(from) ? Buffer.from(await (await fetch(from)).arrayBuffer()) : await readFile(from);
  const lines = gunzipSync(decrypt(raw)).toString().split("\n");

  const tables = new Map<string, string[]>();
  let current: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    const head = line.startsWith('{"table":') ? (JSON.parse(line) as { table?: string; rows?: number }) : null;
    if (head?.table && typeof head.rows === "number" && Object.keys(head).length === 2) {
      current = [];
      tables.set(head.table, current);
    } else current.push(line);
  }

  const db = new PrismaClient({ datasources: { db: { url: target } } });
  try {
    // A database in use has users and customers - never restore over one. What the migrations put in a new one is cleared.
    for (const name of ["User", "Deal"]) {
      const [{ n }] = await db.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${name}"`);
      if (n > 0) throw new Error(`Databasen er i brug (${name} har ${n} rækker) - brug en ny, tom database.`);
    }
    const existing = await db.$queryRawUnsafe<{ name: string }[]>(
      `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'`
    );
    if (existing.length) await db.$executeRawUnsafe(`TRUNCATE ${existing.map((t) => `"${t.name.replaceAll('"', '""')}"`).join(", ")} CASCADE`);

    const insert = (name: string, rows: string[]) =>
      db.$executeRawUnsafe(`INSERT INTO "${name.replaceAll('"', '""')}" SELECT * FROM json_populate_recordset(NULL::"${name.replaceAll('"', '""')}", $1::json)`, `[${rows.join(",")}]`);

    // Rows that point at rows not put back yet wait for a later pass.
    let waiting = [...tables].filter(([name]) => name !== "_prisma_migrations").map(([name, rows]) => ({ name, rows }));
    for (let pass = 1; waiting.length && pass <= 20; pass++) {
      const next: typeof waiting = [];
      let progress = 0;
      for (const { name, rows } of waiting) {
        const left: string[] = [];
        for (let i = 0; i < rows.length; i += BATCH) {
          const batch = rows.slice(i, i + BATCH);
          try {
            await insert(name, batch);
            progress += batch.length;
          } catch {
            for (const row of batch) {
              try {
                await insert(name, [row]);
                progress++;
              } catch {
                left.push(row);
              }
            }
          }
        }
        if (left.length) next.push({ name, rows: left });
      }
      console.log(`Runde ${pass}: ${progress} rækker sat ind, ${next.reduce((s, t) => s + t.rows.length, 0)} venter.`);
      waiting = next;
      if (!progress) break;
    }
    if (waiting.length) {
      for (const { name, rows } of waiting) {
        const err = await insert(name, rows.slice(0, 1)).catch((e: unknown) => e);
        console.error(`${name}: ${rows.length} rækker kunne ikke sættes ind - fx: ${String(err).slice(0, 300)}`);
      }
      process.exitCode = 1;
    }

    // Counters (autoincrement columns) continue after the restored rows.
    await db.$executeRawUnsafe(`
      DO $$ DECLARE r record; BEGIN
        FOR r IN SELECT c.table_name, c.column_name, pg_get_serial_sequence(format('%I', c.table_name), c.column_name) AS seq
                 FROM information_schema.columns c WHERE c.table_schema = 'public' AND pg_get_serial_sequence(format('%I', c.table_name), c.column_name) IS NOT NULL
        LOOP
          EXECUTE format('SELECT setval(%L, GREATEST(COALESCE((SELECT max(%I) FROM %I), 0), 1))', r.seq, r.column_name, r.table_name);
        END LOOP;
      END $$;`);

    for (const [name, rows] of tables) {
      if (name === "_prisma_migrations") continue;
      const [{ n }] = await db.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${name.replaceAll('"', '""')}"`);
      if (n !== rows.length) console.error(`${name}: ${n} af ${rows.length} rækker`);
    }
    console.log(process.exitCode ? "Færdig - med fejl (se ovenfor)." : `Færdig: ${tables.size} tabeller sat tilbage.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
