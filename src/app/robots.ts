import type { MetadataRoute } from "next";

/**
 * Crawling stays allowed on purpose: a page Google may not fetch can't
 * show it its "noindex", and can then still turn up in results as a bare
 * link. Every response says noindex (layout metadata + X-Robots-Tag), so
 * the pages drop out of the index and stay out.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/" }] };
}
