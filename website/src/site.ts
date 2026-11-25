/*
 * Settings for the whole site.
 *
 * INDEXABLE: only the live site may be in Google. A preview (its own vercel.app address, or the site before it
 * replaces nextview360.dk) says noindex everywhere and its robots.txt shuts crawlers out - else Google would see
 * the same pages twice. Turned on with SITE_INDEXABLE=1 in the Vercel project, when the site goes live.
 */
export const SITE_URL = "https://nextview360.dk";
export const INDEXABLE = process.env.SITE_INDEXABLE === "1";
/** Arpo (the Next app): where the customer band is read when the site is built, and where the contact form posts. */
export const ARPO_URL = (process.env.ARPO_URL ?? "https://nextview360.dk").replace(/\/+$/, "");
