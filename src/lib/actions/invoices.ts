"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { runQuarterlyInvoiceGeneration, runAutoChurn, type InvoiceRunSummary } from "@/lib/invoice-service";

export async function runInvoiceGenerationNow(): Promise<InvoiceRunSummary> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan køre dette manuelt");

  const summary = await runQuarterlyInvoiceGeneration();
  const { churned } = await runAutoChurn();
  revalidatePath("/settings/dinero");
  revalidatePath("/deals");
  return { ...summary, churned };
}
