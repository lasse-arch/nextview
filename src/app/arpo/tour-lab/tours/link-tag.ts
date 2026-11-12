import type { TourConfig } from "./types";

/**
 * A link to the customer's own pages (booking, order, contact form) carries
 * where the visitor came from - utm_source=nextview360 - so the customer's own
 * analytics and booking system can count the bookings the tour brought.
 * Maps, social media and our own links are left as they are.
 */
export function tagged(T: TourConfig, href: string): string {
  if (T.utm === false || !/^https?:\/\//i.test(href)) return href;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  if (/(^|\.)(nextview360\.dk|google\.[a-z.]+|goo\.gl|instagram\.com|facebook\.com|youtube\.com|drive\.google\.com)$/.test(url.hostname) || url.searchParams.has("utm_source")) return href;
  url.searchParams.set("utm_source", "nextview360");
  url.searchParams.set("utm_medium", "virtuel-tour");
  url.searchParams.set("utm_campaign", T.slug);
  return url.toString();
}
