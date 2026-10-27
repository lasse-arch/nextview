/*
 * Where the tour reaches Arpo (measurement, live units, feedback). In Arpo and
 * on /t/<slug> that's the same address ("/api/…"). A tour published as plain
 * files (Cloudflare, tour.nextview360.dk) is told Arpo's address by its page
 * (window.__TOUR_API__) - and keeps running if Arpo doesn't answer.
 */
const base = () => (typeof window !== "undefined" && (window as { __TOUR_API__?: string }).__TOUR_API__) || "";

export const apiUrl = (path: string) => `${base()}${path}`;
/** True for a tour published as plain files - one that must fetch what a server would otherwise have given it. */
export const isStaticTour = () => Boolean(base());
