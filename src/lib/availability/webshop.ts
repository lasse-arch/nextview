import "server-only";
import { readLimited, safeFetch } from "@/lib/safe-fetch";

/*
 * A customer's webshop product with a date calendar (e.g. Nymarksminde's
 * "Bed and Breakfast" on webshop.nymarksminde.dk): the dates it can be booked
 * (the calendar's own list - a full or closed day isn't on it), what it costs,
 * and the kinds of guests it's priced by. Read from the product page as the
 * shop itself shows it, cached 10 minutes; the price for a stay is asked of
 * the shop's own price lookup (the same the page uses - nothing is put in a
 * basket, nothing is booked). The page's contents are data, never trusted
 * further than the numbers and short labels taken from it.
 */

export type ShopProduct = {
  name: string;
  productId: string;
  /** The days that can be booked, "YYYY-MM-DD", sorted. */
  dates: string[];
  /** The price per night before guests, kr. (null when the page doesn't say). */
  basePrice: number | null;
  /** The guest kinds the price is made of (e.g. "Voksne (15 + år)", 150 kr. a night). */
  guests: { id: string; label: string; price: number | null; max: number }[];
};

const cache = new Map<string, { at: number; product: ShopProduct }>();
const TEN_MINUTES = 10 * 60_000;
const UA = "Mozilla/5.0 (compatible; Nextview360-tour)";

const kr = (s: string | undefined) => {
  if (!s) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** Only a plain https address on a public host. */
export function shopUrl(raw: string): URL | null {
  try {
    const u = new URL(String(raw).trim());
    return u.protocol === "https:" && !u.username && !u.password ? u : null;
  } catch {
    return null;
  }
}

export async function readShopProduct(raw: string): Promise<ShopProduct> {
  const url = shopUrl(raw);
  if (!url) throw new Error("Adressen skal være et https-link til produktet i webshoppen.");
  const key = url.toString();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TEN_MINUTES) return hit.product;

  const res = await safeFetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`Webshoppen svarede ${res.status}.`);
  const html = (await readLimited(res, 3_000_000)).toString("utf8");

  const productId = html.match(/addToCartBtn[^>]*?data-product-id="(\d+)"/)?.[1] ?? html.match(/data-product-id="(\d+)"/)?.[1];
  if (!productId) throw new Error("Siden ligner ikke et produkt med en kalender.");
  const dates = [...new Set([...html.matchAll(/name="options\[dateRangeDates\]\[\]"\s+value="(\d{4}-\d{2}-\d{2})"/g)].map((m) => m[1]))].sort();
  if (!dates.length) throw new Error("Produktet har ingen datoer at vælge.");
  const name = text(html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "").split(" - ")[0].slice(0, 80) || "Overnatning";
  const basePrice = kr(text(html).match(/Grundpris\s*([\d.,]+)\s*DKK/i)?.[1]);
  const guests = [...html.matchAll(/<label>\s*([^<]{1,80}?)\s*<\/label>\s*<div class="input-group">[\s\S]{0,400}?max="(\d+)"\s+data-prop-id="(\d+)"/g)].map((m) => {
    const [label, price] = text(m[1]).replace(/^Antal\s+/i, "").split("|");
    return { id: m[3], label: label.trim().slice(0, 60), price: kr(price?.match(/([\d.,]+)/)?.[1]), max: Math.min(20, Number(m[2]) || 6) };
  });

  const product = { name, productId, dates, basePrice, guests };
  if (cache.size > 200) cache.clear();
  cache.set(key, { at: Date.now(), product });
  return product;
}

/** The nights in a stay: from the arrival day up to (not including) the departure day. */
export function nightsOf(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (d < end && out.length < 60) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * The shop's own price for a stay (the price lookup its page uses), or null
 * when the shop doesn't answer with one.
 */
export async function shopPrice(raw: string, product: ShopProduct, from: string, to: string, guests: Record<string, number>): Promise<number | null> {
  const url = shopUrl(raw);
  if (!url) return null;
  const nights = nightsOf(from, to).length;
  const form = new FormData();
  form.set("productId", product.productId);
  form.set("productSubId", "0");
  form.set("productQty", String(Math.max(1, nights)));
  form.set("departmentId", "0");
  form.set(
    "productsOptions",
    encodeURIComponent(JSON.stringify({ productsOptionsQuantity: product.guests.map((g) => ({ propId: g.id, optionQty: String(guests[g.id] ?? 0) })), productsOptionsSupplemental: [] }))
  );
  form.set("dateRange", encodeURIComponent(JSON.stringify({ fromDate: from, toDate: to })));
  const res = await safeFetch(new URL("/content/plugins/shop/ajaxHandlerShop.php?handler=getItemPrice", url.origin), {
    method: "POST",
    headers: { "User-Agent": UA },
    body: form,
    signal: AbortSignal.timeout(10_000),
    maxRedirects: 0,
  });
  if (!res.ok) return null;
  const data = JSON.parse((await readLimited(res, 20_000)).toString("utf8") || "{}") as { error?: boolean; priceInclVat?: unknown };
  return !data.error && typeof data.priceInclVat === "number" && Number.isFinite(data.priceInclVat) ? data.priceInclVat : null;
}

/*
 * Whole weeks sold as their own products (e.g. Nymarksminde's "Bondegårdsferie":
 * a page linking to "Ferie - Standard lejlighed - Uge 27", "… - Camping - Uge
 * 28" …): each week's options, its days, price and whether it's still in
 * stock - so the days the calendar can't be booked by the night can be booked
 * as a week. Read from the page and its products, cached 10 minutes; only
 * products on the page's own site.
 */
export type ShopWeek = { url: string; name: string; week: number; from: string; to: string; price: number | null; available: boolean };

const weekCache = new Map<string, { at: number; weeks: ShopWeek[] }>();
const MONTHS_DA = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];
const month = (m: string) => MONTHS_DA.findIndex((x) => x.startsWith(m.toLowerCase().replace(/\.$/, "").slice(0, 3)));

/** "(3. juli - 10. juli)" in a year → the days, YYYY-MM-DD. */
function period(textOf: string, year: number): { from: string; to: string } | null {
  const m = textOf.match(/\((\d{1,2})\.\s*([a-zæøå]+)\.?\s*-\s*(\d{1,2})\.\s*([a-zæøå]+)\.?\)/i);
  if (!m) return null;
  const a = month(m[2]);
  const b = month(m[4]);
  if (a < 0 || b < 0) return null;
  const iso = (y: number, mo: number, d: number) => new Date(Date.UTC(y, mo, d)).toISOString().slice(0, 10);
  return { from: iso(year, a, Number(m[1])), to: iso(b < a ? year + 1 : year, b, Number(m[3])) };
}

async function readWeek(url: URL): Promise<ShopWeek | null> {
  const res = await safeFetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) return null;
  const html = (await readLimited(res, 3_000_000)).toString("utf8");
  const plain = text(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ""));
  const title = text(html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "");
  const wk = title.match(/uge\s*(\d{1,2})/i) ?? plain.match(/uge\s*(\d{1,2})\s+(\d{4})/i);
  const year = Number(plain.match(/uge\s*\d{1,2}\s+(\d{4})/i)?.[1] ?? new Date().getUTCFullYear());
  const days = period(plain, year);
  if (!wk || !days) return null;
  // "Sommerferie - Standard lejlighed - Uge 27" → "Standard lejlighed".
  const parts = title.split(/\s+-\s+/).map((p) => p.trim()).filter((p) => p && !/^uge\s*\d+/i.test(p));
  const name = (parts.length > 1 ? parts.slice(1) : parts).join(" - ").slice(0, 60) || "Uge";
  const stock = html.match(/"availability":\s*"https?:\/\/schema\.org\/(\w+)"/)?.[1];
  return { url: url.toString(), name, week: Number(wk[1]), ...days, price: kr(plain.match(/Grundpris\s*([\d.,]+)\s*DKK/i)?.[1]), available: !stock || /InStock|LimitedAvailability|PreOrder/i.test(stock) };
}

export async function readShopWeeks(raw: string): Promise<ShopWeek[]> {
  const page = shopUrl(raw);
  if (!page) throw new Error("Adressen skal være et https-link til siden med ugerne.");
  const key = page.toString();
  const hit = weekCache.get(key);
  if (hit && Date.now() - hit.at < TEN_MINUTES) return hit.weeks;
  const res = await safeFetch(page, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`Webshoppen svarede ${res.status}.`);
  const html = (await readLimited(res, 3_000_000)).toString("utf8");
  const links = [
    ...new Set(
      [...html.matchAll(/href="([^"]*\/product\/[^"#?]*uge[^"#?]*)"/gi)]
        .map((m) => {
          try {
            const u = new URL(m[1], page);
            return u.hostname === page.hostname && u.protocol === "https:" ? u.toString() : null;
          } catch {
            return null;
          }
        })
        .filter((x): x is string => Boolean(x))
    ),
  ].slice(0, 40);
  const weeks = (await Promise.all(links.map((l) => readWeek(new URL(l)).catch(() => null)))).filter((w): w is ShopWeek => Boolean(w));
  weeks.sort((a, b) => a.from.localeCompare(b.from) || a.name.localeCompare(b.name, "da"));
  if (weekCache.size > 100) weekCache.clear();
  weekCache.set(key, { at: Date.now(), weeks });
  return weeks;
}
