import type { Metadata, Viewport } from "next";
import { ReviewPage, reviewMetadata } from "../review-page";

/** The tour fills the whole phone screen, also behind the island (its buttons keep clear of it - safe-area insets). */
// The tour is a full-screen app: pinching zooms its picture, never the page itself (a pinch on the drone picture made the whole page zoom).
export const viewport: Viewport = { viewportFit: "cover", themeColor: "#0d1b20", width: "device-width", initialScale: 1, minimumScale: 1, maximumScale: 1, userScalable: false };

/* Kundegennemsyn on the first form of the link, /p/<token> (see ../review-page.tsx). */

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  return reviewMetadata((await params).token);
}

export default async function ReviewTourPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ sprog?: string }> }) {
  return <ReviewPage token={(await params).token} sprog={(await searchParams).sprog} />;
}
