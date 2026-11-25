// @ts-check
import { defineConfig } from "astro/config";

/*
 * nextview360.dk as a static Astro site (the pages were site-web/ in the Next app). Every page is built to its
 * own .html file (/priser.html …), the same addresses as before - links and Google's index keep working.
 */
export default defineConfig({
  site: "https://nextview360.dk",
  build: { format: "file", inlineStylesheets: "auto" },
  trailingSlash: "ignore",
  compressHTML: true,
});
