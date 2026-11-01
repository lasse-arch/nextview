/*
 * Text and links from a tour's setup are untrusted: developers, nextviewAI and
 * the customer's own website all write into it. Anything put into HTML by hand
 * (innerHTML) or opened from code goes through these.
 */

const HTML: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** Text made safe to put inside HTML (element content or a quoted attribute). */
export const escapeHtml = (s: unknown): string => String(s ?? "").replace(/[&<>"']/g, (c) => HTML[c]);

/** A CSS colour from the setup - only #hex, rgb()/rgba() or hsl()/hsla(); anything else becomes `fallback`. */
export function safeColor(c: unknown, fallback = "#0071e3"): string {
  const v = String(c ?? "").trim();
  return /^#[0-9a-f]{3,8}$/i.test(v) || /^(rgb|hsl)a?\(\s*[\d.\s,%/-]+\)$/i.test(v) ? v : fallback;
}

/** Schemes a link may never have - they run code instead of opening a page. */
export const UNSAFE_SCHEME = /^[\s\u0000-\u001f]*(javascript|vbscript|data|file|blob):/i;

/** A link that may be opened from code: http(s), mailto, tel, in-page (#…) and our own paths (/…). Anything else is dropped (null). */
export function safeHref(href: unknown): string | null {
  const v = String(href ?? "").trim();
  if (!v || UNSAFE_SCHEME.test(v)) return null;
  if (v.startsWith("#") || (v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\"))) return v;
  return /^(https?:|mailto:|tel:)/i.test(v) ? v : null;
}
