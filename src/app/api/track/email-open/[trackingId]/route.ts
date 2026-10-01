import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

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
 * deal-email.ts) whenever a recipient's mail client loads images. Always
 * returns the pixel even if the trackingId is unknown/already recorded, so a
 * broken or repeated request never surfaces as a visible error in the email.
 *
 * Deal emails now send the primary contact and each Cc'ed colleague their
 * own separately-tracked copy (see deal-email.ts), so a trackingId usually
 * belongs to one specific EmailRecipientOpen row - looked up first. Falls
 * back to the older shared-pixel EmailMessage.trackingId for mails sent
 * before that change, which only ever had the one combined pixel.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ trackingId: string }> }) {
  const { trackingId } = await params;
  const now = new Date();

  try {
    const recipientOpen = await prisma.emailRecipientOpen.findUnique({
      where: { trackingId },
      select: { id: true, openedAt: true, isPrimary: true, messageId: true },
    });

    if (recipientOpen) {
      await prisma.emailRecipientOpen.update({
        where: { trackingId },
        data: {
          openedAt: recipientOpen.openedAt ?? now,
          openCount: { increment: 1 },
          openTimestamps: { push: now },
        },
      });

      // The parent EmailMessage's own trackingId/openedAt/openCount mirror
      // the PRIMARY recipient specifically (see schema comment) - only that
      // one's opens should update them, not a Cc'ed colleague's.
      if (recipientOpen.isPrimary) {
        await prisma.emailMessage.update({
          where: { id: recipientOpen.messageId },
          data: { openedAt: recipientOpen.openedAt ?? now, openCount: { increment: 1 } },
        });
      }
    } else {
      const message = await prisma.emailMessage.findUnique({ where: { trackingId }, select: { openedAt: true } });
      if (message) {
        await prisma.emailMessage.update({
          where: { trackingId },
          data: { openedAt: message.openedAt ?? now, openCount: { increment: 1 } },
        });
      }
    }
  } catch (err) {
    console.error("Kunne ikke registrere e-mail-åbning", err);
  }

  return new NextResponse(TRANSPARENT_GIF, { headers: PIXEL_HEADERS });
}
