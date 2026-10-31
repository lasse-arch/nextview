import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/*
 * Deleting a deal used to be final - with it went its notes, e-mails,
 * invoices, commission and contract history. Now the whole thing is kept in
 * DeletedDeal first, in the same transaction as the delete, and can be put
 * back from "Slettede kunder". Which tables hang on a deal is read from the
 * database itself, so a table added later is covered without touching this.
 */

type Tx = Prisma.TransactionClient;

/** Stages a customer only reaches by signing. */
const SIGNED_STAGES = ["CONTRACT_SIGNED", "FILMED", "REVIEW", "LIVE"];

/**
 * A customer who has signed isn't deleted in the normal way (the database
 * refuses too, see the deal_signed_no_delete trigger) - lost or inactive
 * instead. Only an admin can, typing the customer's name (deleteDeal).
 */
export function hasSigned(deal: { contractSignedAt: Date | null; contractStatus: string; stage: string }) {
  return Boolean(deal.contractSignedAt) || deal.contractStatus === "SIGNED" || SIGNED_STAGES.includes(deal.stage);
}

export const SIGNED_NO_DELETE = "Kunden har skrevet under og kan ikke slettes. Brug \"Markér som tabt\" eller \"Inaktiv\" i stedet.";
type Ref = { table: string; column: string; cascade: boolean };
type Archive = { deal: unknown; rows: Record<string, unknown[]>; links: Record<string, { column: string; ids: string[] }> };

const q = (name: string) => `"${name.replaceAll('"', '""')}"`;

/** The tables pointing at Deal: deleted with it (cascade) or just unlinked (set null). */
async function refsToDeal(tx: Tx): Promise<Ref[]> {
  const rows = await tx.$queryRawUnsafe<{ table: string; column: string; del: string }[]>(`
    SELECT cl.relname AS "table", a.attname AS "column", c.confdeltype AS del
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = '"Deal"'::regclass`);
  return rows.map((r) => ({ table: r.table, column: r.column, cascade: r.del === "c" }));
}

/**
 * Deletes a deal - after keeping everything that goes with it. `signedOk`:
 * an admin has confirmed deleting a signed customer (checked by the caller);
 * the database lets this one transaction through.
 */
export async function deleteDealArchived(dealId: string, deletedByName: string, signedOk = false) {
  await prisma.$transaction(
    async (tx) => {
      const [deal] = await tx.$queryRawUnsafe<{ j: Record<string, unknown> }[]>(`SELECT to_jsonb(d) AS j FROM "Deal" d WHERE id = $1`, dealId);
      if (!deal) throw new Error("Dealen findes ikke.");
      const signed = deal.j as { contractSignedAt: string | null; contractStatus: string; stage: string };
      if (hasSigned({ ...signed, contractSignedAt: signed.contractSignedAt ? new Date(signed.contractSignedAt) : null })) {
        if (!signedOk) throw new Error(SIGNED_NO_DELETE);
        await tx.$executeRawUnsafe(`SET LOCAL arpo.delete_signed = 'on'`);
      }
      const archive: Archive = { deal: deal.j, rows: {}, links: {} };
      for (const ref of await refsToDeal(tx)) {
        if (ref.cascade) {
          const rows = await tx.$queryRawUnsafe<{ j: unknown }[]>(`SELECT to_jsonb(t) AS j FROM ${q(ref.table)} t WHERE ${q(ref.column)} = $1`, dealId);
          if (rows.length) archive.rows[ref.table] = rows.map((r) => r.j);
        } else {
          const rows = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id::text AS id FROM ${q(ref.table)} WHERE ${q(ref.column)} = $1`, dealId);
          if (rows.length) archive.links[ref.table] = { column: ref.column, ids: rows.map((r) => r.id) };
        }
      }
      const name = String(deal.j.displayName || deal.j.companyName || "Ukendt");
      await tx.deletedDeal.create({ data: { dealId, name, deletedByName, data: archive as unknown as Prisma.InputJsonValue } });
      await tx.deal.delete({ where: { id: dealId } });
    },
    { timeout: 30_000 }
  );
}

/** Puts a deleted deal back, with everything that was deleted along with it and its links. */
export async function restoreDeletedDeal(id: string): Promise<{ ok: true; dealId: string } | { ok: false; error: string }> {
  const archived = await prisma.deletedDeal.findUnique({ where: { id } });
  if (!archived || archived.restoredAt) return { ok: false, error: "Den er allerede sat tilbage." };
  const data = archived.data as unknown as Archive;
  try {
    await prisma.$transaction(
      async (tx) => {
        const insert = (table: string, rows: unknown[]) =>
          tx.$executeRawUnsafe(`INSERT INTO ${q(table)} SELECT * FROM jsonb_populate_recordset(NULL::${q(table)}, $1::jsonb)`, JSON.stringify(rows));
        // The deal itself - a branch whose parent is gone too starts out on its own.
        const deal = { ...(data.deal as Record<string, unknown>) };
        if (deal.parentDealId) {
          const parent = await tx.deal.findUnique({ where: { id: String(deal.parentDealId) }, select: { id: true } });
          if (!parent) deal.parentDealId = null;
        }
        await insert("Deal", [deal]);
        // Tables that point at each other (an invoice at its Betalingsservice collection) go in once what they point at is back.
        let waiting = Object.entries(data.rows);
        while (waiting.length) {
          const left: typeof waiting = [];
          let lastError: unknown = null;
          for (const [table, rows] of waiting) {
            await tx.$executeRawUnsafe("SAVEPOINT restore_rows");
            try {
              await insert(table, rows);
              await tx.$executeRawUnsafe("RELEASE SAVEPOINT restore_rows");
            } catch (err) {
              await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT restore_rows");
              left.push([table, rows]);
              lastError = err;
            }
          }
          if (left.length === waiting.length) throw lastError;
          waiting = left;
        }
        for (const [table, { column, ids }] of Object.entries(data.links)) {
          await tx.$executeRawUnsafe(`UPDATE ${q(table)} SET ${q(column)} = $1 WHERE id::text = ANY($2::text[]) AND ${q(column)} IS NULL`, archived.dealId, ids);
        }
        await tx.deletedDeal.update({ where: { id }, data: { restoredAt: new Date() } });
      },
      { timeout: 30_000 }
    );
    return { ok: true, dealId: archived.dealId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: /unique|duplicate/i.test(msg) ? "Noget af det findes allerede igen (fx samme kundenummer eller e-mail) - ret det først." : msg.slice(0, 300) };
  }
}
