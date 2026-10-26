/*
 * Where tours and customer portals live for the outside world. With
 * NEXT_PUBLIC_TOUR_ORIGIN (e.g. https://tour.nextview360.dk) and
 * NEXT_PUBLIC_PORTAL_ORIGIN (e.g. https://portal.nextview360.dk) set, links
 * and embed codes use those short addresses (proxy.ts maps them back to /t
 * and /r); without them, everything stays on Arpo's own address. The old
 * /t/<slug> and /r/<token> addresses keep working either way.
 */

const trim = (o: string | undefined) => o?.replace(/\/+$/, "") || null;
export const TOUR_ORIGIN = trim(process.env.NEXT_PUBLIC_TOUR_ORIGIN);
export const PORTAL_ORIGIN = trim(process.env.NEXT_PUBLIC_PORTAL_ORIGIN);

/** The published tour - `origin` is Arpo's own (used when no tour address is set). */
export const tourUrl = (slug: string, origin: string) => (TOUR_ORIGIN ? `${TOUR_ORIGIN}/${slug}` : `${origin}/t/${slug}`);
/** Kundegennemsyn (the review link) - a tour, so it lives with the tours. */
export const reviewUrl = (token: string, origin: string) => `${TOUR_ORIGIN ?? origin}/p/${token}`;
/** The customer portal. */
export const portalUrl = (token: string, origin: string) => (PORTAL_ORIGIN ? `${PORTAL_ORIGIN}/${token}` : `${origin}/r/${token}`);
