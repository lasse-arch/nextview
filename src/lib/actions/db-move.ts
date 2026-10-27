"use server";

import { requireUser } from "@/lib/auth";
import { compare, copyBatch, finish, prepare, type TableState } from "@/lib/db-move";

/* The steps of "Flyt database" - admins only; the page drives them one at a time. */

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

async function admin<T>(run: () => Promise<T>): Promise<Result<T>> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { ok: false, error: "Kun admin kan flytte databasen." };
  try {
    return { ok: true, value: await run() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function moveCompare(): Promise<Result<TableState[]>> {
  return admin(compare);
}
export async function movePrepare(): Promise<Result<null>> {
  return admin(async () => (await prepare(), null));
}
export async function moveBatch(table: string, offset: number): Promise<Result<{ copied: number; done: boolean }>> {
  return admin(() => copyBatch(table, offset));
}
export async function moveFinish(): Promise<Result<TableState[]>> {
  return admin(async () => (await finish(), compare()));
}
