/*
 * Settings for the whole site.
 *
 * INDEXABLE: only the live site may be in Google. The team's preview (/web/ in Arpo) says noindex everywhere and
 * its robots.txt shuts crawlers out - else Google would see the same pages twice. Turned on with SITE_INDEXABLE=1
 * when the site is built for nextview360.dk itself.
 */
export const SITE_URL = "https://nextview360.dk";
export const INDEXABLE = process.env.SITE_INDEXABLE === "1";
/** Where the site lives: "/" on nextview360.dk, "/web/" for the team's preview (SITE_BASE). Ends with "/". */
export const BASE = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
