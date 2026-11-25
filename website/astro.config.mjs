// @ts-check
import { defineConfig } from "astro/config";

/*
 * nextview360.dk as a static Astro site (the pages were site-web/ in the Next app). Every page is built to its
 * own .html file (/priser.html …), the same addresses as before - links and Google's index keep working.
 * Arpo builds it on every deploy (scripts/build-website.mjs) and sends the pages itself.
 */
export default defineConfig({
  site: "https://nextview360.dk",
  // "/" on nextview360.dk; "/web/" when Arpo builds it as the team's preview (scripts/build-website.mjs).
  base: process.env.SITE_BASE || "/",
  build: { format: "file", inlineStylesheets: "auto" },
  trailingSlash: "ignore",
  compressHTML: true,
});
