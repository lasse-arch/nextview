import "server-only";
import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";

/*
 * "Flyt database" (Indstillinger): copies every table from the database Arpo
 * runs on now to a new, empty one - NEW_DIRECT_URL, e.g. Neon in Frankfurt -
 * one batch per request, so no request runs long. The old database is only
 * ever read; the new one only written. Its tables come from the migrations
 * (vercel-build runs them on NEW_DIRECT_URL), its links between tables are
 * put back from the old database's own once everything is in, and then every
 * table's row count is compared. Moving over is then only a matter of
 * pointing DATABASE_URL at the new database.
 */

const SKIP = new Set(["_prisma_migrations"]);
/** Rows per batch - fewer for tables holding files (pictures, PDFs), so a batch stays a few MB. */
const ROWS = 500;
const ROWS_WITH_FILES = 10;

let target: PrismaClient | null = null;
export function newDatabaseUrl(): string | null {
  return process.env.NEW_DIRECT_URL || null;
}
function newDb(): PrismaClient {
  const url = newDatabaseUrl();
  if (!url) throw new Error("NEW_DIRECT_URL er ikke sat i Vercel.");
  const where = (u: string | undefined) => {
    try {
      const x = new URL(u ?? "");
      return `${x.hostname}${x.pathname}`;
    } catch {
      return null;
    }
  };
  // Never "move" a database onto itself - copying starts by emptying the target's tables.
  if ([process.env.DATABASE_URL, process.env.DIRECT_URL].some((u) => u && where(u) === where(url))) throw new Error("Den nye database er den samme som den nuværende.");
  target ??= new PrismaClient({ datasourceUrl: url });
  return target;
}

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

async function tablesOf(db: PrismaClient): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<{ t: string }[]>(
    `SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`
  );
  return rows.map((r) => r.t).filter((t) => !SKIP.has(t));
}

async function countOf(db: PrismaClient, table: string): Promise<number> {
  const [r] = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM ${q(table)}`);
  return Number(r.n);
}

type ForeignKey = { tbl: string; name: string; def: string };
async function foreignKeys(db: PrismaClient): Promise<ForeignKey[]> {
  return db.$queryRawUnsafe<ForeignKey[]>(
    `SELECT c.relname AS tbl, k.conname AS name, pg_get_constraintdef(k.oid) AS def
     FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE k.contype = 'f' AND n.nspname = 'public'`
  );
}

export type TableState = { table: string; old: number; new: number; skipped?: boolean };

/** The tables Arpo itself uses (its Prisma models). */
const arpoTables = () => new Set(Prisma.dmmf.datamodel.models.map((m) => m.dbName ?? m.name));

/**
 * The tables to copy: the old database's, minus leftovers Arpo no longer uses
 * (a table from a feature that was tried and taken out again) - those aren't
 * created in the new database and stay behind. A table Arpo does use but the
 * new database lacks stops the move.
 */
async function plan(db: PrismaClient): Promise<{ copy: string[]; leftovers: string[] }> {
  const [oldTables, newTables] = await Promise.all([tablesOf(prisma), tablesOf(db)]);
  const missing = oldTables.filter((t) => !newTables.includes(t));
  const used = arpoTables();
  const needed = missing.filter((t) => used.has(t));
  if (needed.length) throw new Error(`Den nye database mangler tabeller (${needed.slice(0, 5).join(", ")}) - lav et nyt deploy, så de bliver oprettet.`);
  return { copy: oldTables.filter((t) => newTables.includes(t)), leftovers: missing };
}

/** Every table with its row count in the old and the new database (leftovers marked as skipped). */
export async function compare(): Promise<TableState[]> {
  const db = newDb();
  const { copy, leftovers } = await plan(db);
  const rows = await Promise.all(copy.map(async (table) => ({ table, old: await countOf(prisma, table), new: await countOf(db, table) })));
  const left = await Promise.all(leftovers.map(async (table) => ({ table, old: await countOf(prisma, table), new: 0, skipped: true })));
  return [...rows, ...left];
}

/** Before copying: the new database's links between tables come off, so tables can be filled in any order. */
export async function prepare(): Promise<void> {
  const db = newDb();
  for (const fk of await foreignKeys(db)) await db.$executeRawUnsafe(`ALTER TABLE ${q(fk.tbl)} DROP CONSTRAINT ${q(fk.name)}`);
}

/** Copies one batch of a table, from row `offset`; the first batch empties the table in the new database first. */
export async function copyBatch(table: string, offset: number): Promise<{ copied: number; done: boolean }> {
  const db = newDb();
  if (!(await plan(db)).copy.includes(table)) throw new Error(`Ukendt tabel: ${table}`);
  if (offset === 0) await db.$executeRawUnsafe(`TRUNCATE ${q(table)}`);
  const [files] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*) AS n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND data_type = 'bytea'`,
    table
  );
  const rows = Number(files.n) ? ROWS_WITH_FILES : ROWS;
  // The rows as JSON - files (bytea) come as \x… hex text, which Postgres reads straight back in.
  const [batch] = await prisma.$queryRawUnsafe<{ j: string; n: bigint }[]>(
    `SELECT coalesce(json_agg(t), '[]'::json)::text AS j, count(*) AS n FROM (SELECT * FROM ${q(table)} ORDER BY ctid LIMIT ${rows} OFFSET ${Math.max(0, Math.floor(offset))}) t`
  );
  const n = Number(batch.n);
  if (n) await db.$executeRawUnsafe(`INSERT INTO ${q(table)} SELECT * FROM json_populate_recordset(NULL::${q(table)}, $1::json)`, batch.j);
  return { copied: n, done: n < rows };
}

/** After copying: the links between tables go back on, exactly as in the old database (checked against the data as they're added). */
export async function finish(): Promise<void> {
  const db = newDb();
  const { copy } = await plan(db);
  const have = new Set((await foreignKeys(db)).map((fk) => `${fk.tbl}.${fk.name}`));
  for (const fk of await foreignKeys(prisma)) {
    // Links of a left-behind table stay behind with it.
    if (copy.includes(fk.tbl) && !have.has(`${fk.tbl}.${fk.name}`)) await db.$executeRawUnsafe(`ALTER TABLE ${q(fk.tbl)} ADD CONSTRAINT ${q(fk.name)} ${fk.def}`);
  }
}
