import "server-only";

/**
 * Whether a page lets itself be shown inside another site (an iframe) - many
 * don't (X-Frame-Options / CSP frame-ancestors), and a popup of such a page
 * would just be empty. Checked once a day per URL.
 */
export async function canEmbed(url: string): Promise<boolean> {
  const embedUrl = url.replace(/(drive\.google\.com\/file\/d\/[^/]+)\/view.*$/, "$1/preview");
  try {
    const res = await fetch(embedUrl, { redirect: "follow", next: { revalidate: 86400 }, signal: AbortSignal.timeout(5000) });
    const xfo = res.headers.get("x-frame-options");
    if (xfo && /deny|sameorigin/i.test(xfo)) return false;
    const ancestors = /frame-ancestors([^;]*)/i.exec(res.headers.get("content-security-policy") ?? "")?.[1]?.trim();
    if (ancestors && !/(^|\s)(\*|https:)(\s|$)/.test(ancestors)) return false;
    return res.ok;
  } catch {
    return false;
  }
}
