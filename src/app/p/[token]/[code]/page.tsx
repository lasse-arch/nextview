import type { Metadata, Viewport } from "next";
import { ReviewPage, reviewMetadata } from "../../review-page";

/** The tour fills the whole phone screen, also behind the island (its buttons keep clear of it - safe-area insets). */
export const viewport: Viewport = { viewportFit: "cover", themeColor: "#0d1b20", width: "device-width", initialScale: 1, minimumScale: 1, maximumScale: 1, userScalable: false };

/* Kundegennemsyn with the tour's name in the link: /p/<tour>/<token> (see ../../review-page.tsx) - the first segment is the tour's slug. */

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  return reviewMetadata((await params).code);
}

export default async function NamedReviewTourPage({ params, searchParams }: { params: Promise<{ token: string; code: string }>; searchParams: Promise<{ sprog?: string }> }) {
  const { token: slug, code } = await params;
  return <ReviewPage token={code} slug={slug} sprog={(await searchParams).sprog} />;
}
