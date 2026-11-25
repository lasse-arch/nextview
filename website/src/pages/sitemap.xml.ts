import type { APIRoute } from "astro";
import { SITE_URL } from "../site";

/*
 * Every page of the site for Google - found from the pages themselves (a new page is in it at once), each with the
 * day it was built. The front page first and most important, then the solutions and trades, the rest after.
 */
const pages = Object.keys(import.meta.glob("./*.astro"))
  .map((f) => f.slice(2, -6))
  .filter((p) => p !== "404");
const priority = (name: string) =>
  name === "index" ? "1.0" : ["virtuel-rundvisning", "droneoptagelser", "priser", "kontakt", "brancher", "cases"].includes(name) ? "0.9" : name.startsWith("ringet-op") || name === "sitemap" ? "0.3" : "0.7";

export const GET: APIRoute = () => {
  const today = new Date().toISOString().slice(0, 10);
  const urls = pages
    .sort((a, b) => Number(priority(b)) - Number(priority(a)) || a.localeCompare(b))
    .map((p) => `  <url><loc>${SITE_URL}${p === "index" ? "/" : `/${p}.html`}</loc><lastmod>${today}</lastmod><priority>${priority(p)}</priority></url>`);
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
