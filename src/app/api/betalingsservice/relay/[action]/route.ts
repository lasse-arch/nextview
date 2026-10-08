import { NextResponse, type NextRequest } from "next/server";
import { relayExchangeDone, relayPoll, verifyRelayToken } from "@/lib/betalingsservice/relay";
import { recordSftpUpload, takeInMailboxFile } from "@/lib/betalingsservice/sftp";

export const maxDuration = 60;

/**
 * The relay server's calls (see src/lib/betalingsservice/relay.ts):
 * poll - what to do now (and its public key); sent - an upload's outcome;
 * file - a file found in the mailbox, answered with whether it may be
 * deleted there; done - the exchange finished.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  if (!(await verifyRelayToken(request.headers.get("authorization")))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { action } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  switch (action) {
    case "poll": {
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
      return NextResponse.json(await relayPoll({ publicKey: typeof body.publicKey === "string" ? body.publicKey : null, ip }));
    }
    case "sent": {
      if (typeof body.id !== "string") return NextResponse.json({ error: "id mangler" }, { status: 400 });
      const line = await recordSftpUpload(body.id, typeof body.error === "string" && body.error ? body.error : null);
      return NextResponse.json({ ok: true, line });
    }
    case "file": {
      if (typeof body.fileName !== "string" || typeof body.content !== "string") {
        return NextResponse.json({ error: "fileName/content mangler" }, { status: 400 });
      }
      const taken = await takeInMailboxFile(body.fileName, Buffer.from(body.content, "base64"));
      return NextResponse.json(taken);
    }
    case "done": {
      await relayExchangeDone(body.ok === true, typeof body.error === "string" ? body.error : null);
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: "ukendt handling" }, { status: 404 });
  }
}
