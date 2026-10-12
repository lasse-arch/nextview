import "server-only";
import { prisma } from "@/lib/db";
import { isIntegrationEnabled } from "@/lib/integration-settings";
import { downloadCompletedPdf } from "@/lib/docuseal";
import { findOrCreateContractsFolder, uploadPdfToDrive } from "@/lib/google-drive";

// Kept out of the "use server" actions file so it is not a public server action -
// called by the DocuSeal webhook and by the logged-in manual button.
/**
 * Picks which connected Google account to file contracts under - prefers an
 * admin's, since this is a company-wide filing job, not tied to whichever
 * salesperson happened to own the deal.
 */
export async function findArchivingGoogleAccount() {
  const accounts = await prisma.emailAccount.findMany({
    where: { provider: "GOOGLE" },
    include: { user: true },
  });
  return accounts.find((a) => a.user.role === "ADMIN") ?? accounts[0] ?? null;
}


/**
 * Downloads the fully-signed contract PDF from DocuSeal and files it into
 * the shared "Nextview360 - Underskrevne kontrakter" Google Drive folder.
 * Throws on any failure - callers decide whether that should be surfaced
 * (a manual retry button) or just logged (the automatic webhook path).
 */
export async function archiveSignedContractToDrive(dealId: string): Promise<void> {
  if (!(await isIntegrationEnabled("GOOGLE_DRIVE"))) {
    throw new Error("Google Drev-arkivering er slået fra under Indstillinger.");
  }

  const account = await findArchivingGoogleAccount();
  if (!account) {
    throw new Error(
      "Ingen Google-konto forbundet med Drev-adgang. Forbind (eller genforbind) Gmail under Indstillinger → E-mail."
    );
  }

  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!deal.docusealSubmissionId) throw new Error("Dealen har ingen kontrakt at arkivere.");

  const pdf = await downloadCompletedPdf(deal.docusealSubmissionId);
  const folderId = await findOrCreateContractsFolder(account);
  const fileName = `${deal.displayName || deal.companyName} - underskrevet kontrakt.pdf`;
  await uploadPdfToDrive(account, folderId, fileName, Buffer.from(pdf));
}

