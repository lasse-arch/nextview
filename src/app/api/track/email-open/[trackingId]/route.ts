import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { dealName } from "@/lib/labels";

// 1x1 transparent GIF, served from a byte literal rather than a file so this
// route has zero dependencies - a mail client fetching it is what marks the
// message as opened.
const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7",
  "base64"
);

const PIXEL_HEADERS = {
  "Content-Type": "image/gif",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

/**
 * Hit by the tracking pixel embedded in a templated email (see
 * send-email.ts) whenever the recipient's mail client loads images. Always
 * returns the pixel even if the trackingId is unknown/already recorded, so a
 * broken or repeated request never surfaces as a visible error in the email.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ trackingId: string }> }) {
  const { trackingId } = await params;

  try {
    const message = await prisma.emailMessage.findUnique({
      where: { trackingId },
      select: { openedAt: true, dealId: true, subject: true, deal: { select: { companyName: true, displayName: true } } },
    });
    if (message) {
      const now = new Date();
      await prisma.emailMessage.update({
        where: { trackingId },
        data: { openedAt: message.openedAt ?? now, openCount: { increment: 1 }, openTimestamps: { push: now } },
      });

      // Only the first open becomes a dashboard activity entry - a recipient
      // re-opening the same mail isn't a new event worth surfacing there,
      // it'd just be noise (the badge on the deal page already shows every
      // individual open for anyone who wants that detail).
      if (!message.openedAt) {
        await logActivity({
          type: "EMAIL_OPENED",
          message: `${dealName(message.deal)} åbnede ${message.subject ? `"${message.subject}"` : "en e-mail"}`,
          dealId: message.dealId,
        });
      }
    }
  } catch (err) {
    console.error("Kunne ikke registrere e-mail-åbning", err);
  }

  return new NextResponse(TRANSPARENT_GIF, { headers: PIXEL_HEADERS });
}
