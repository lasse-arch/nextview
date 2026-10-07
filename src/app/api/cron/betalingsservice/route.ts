import { NextResponse, type NextRequest } from "next/server";
import { getBsSettings } from "@/lib/betalingsservice/service";
import { runSftpExchange } from "@/lib/betalingsservice/sftp";

export const maxDuration = 120;

/** Daily exchange with My File Transfer: makes and sends the day's BS 0601
 * file when "send automatisk" is on, and takes in receipts and result files.
 * Once a day on purpose - Mastercard asks clients not to poll continuously. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const settings = await getBsSettings();
  if (!settings.sftpUser || !settings.sftpPrivateKeyEnc) {
    return NextResponse.json({ skipped: true, reason: "SFTP er ikke sat op" });
  }
  const result = await runSftpExchange({ autoCreate: true });
  return NextResponse.json(result);
}
