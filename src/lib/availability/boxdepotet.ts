import "server-only";

/** A storage room that can be booked right now or soon. */
export type AvailableUnit = {
  no: string;
  m3: number;
  m2: number;
  /** Kroner per month. */
  price: number;
  /** null = available now, otherwise the date it frees up (dd-mm-yyyy). */
  from: string | null;
  bookUrl: string;
};

const text = (html: string) =>
  html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");

/**
 * The rooms on one of Boxdepotet's price/booking pages (e.g.
 * boxdepotet.dk/priser-booking/horsens-odder/) - read off the page the way a
 * visitor sees them, every 10 minutes. Each room's "Book rum" goes straight
 * to that room in their booking flow.
 */
export async function fetchBoxdepotetUnits(pageUrl: string): Promise<AvailableUnit[]> {
  try {
    const res = await fetch(pageUrl, { next: { revalidate: 600 }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [];
    const html = await res.text();
    const origin = new URL(pageUrl).origin;
    const units: AvailableUnit[] = [];
    let prev = 0;
    for (const m of html.matchAll(/<form method="GET" action="\/bookingflow\/">([\s\S]*?)<\/form>/g)) {
      const before = text(html.slice(prev, m.index)).slice(-400);
      prev = m.index + m[0].length;
      const card = /Størrelse ([\d.]+) m 3 ([\d.]+) m 2 Pris\/md\. (\d+) kr\. Ledig fra: (\S+) Depotrum #(\w+)\s*$/.exec(before);
      const params = new URLSearchParams([...m[1].matchAll(/name="(\w+)" value="([^"]*)"/g)].map((p) => [p[1], p[2]]));
      if (!card || !params.get("room_id")) continue;
      units.push({
        no: card[5],
        m3: Number(card[1]),
        m2: Number(card[2]),
        price: Number(card[3]),
        from: /^\d{2}-\d{2}-\d{4}$/.test(card[4]) ? card[4] : null,
        bookUrl: `${origin}/bookingflow/?${params}`,
      });
    }
    return units;
  } catch {
    return [];
  }
}
