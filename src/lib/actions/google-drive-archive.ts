"use server";
import { archiveSignedContractToDrive } from "@/lib/contract-drive-archive";
import { requireUser } from "@/lib/auth";

/** Server action for the manual "Arkivér i Google Drev" button on a deal's page. */
export async function archiveSignedContractToDriveManual(
  dealId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireUser();
    await archiveSignedContractToDrive(dealId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Der opstod en fejl ved arkivering i Google Drev." };
  }
}
