import type { APIRoute } from "astro";
import { INDEXABLE, SITE_URL } from "../site";

/** Open to every search engine on the live site - closed on a preview (see site.ts). */
export const GET: APIRoute = () =>
  new Response(INDEXABLE ? `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n` : "User-agent: *\nDisallow: /\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
