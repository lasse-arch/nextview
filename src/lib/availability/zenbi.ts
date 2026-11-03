import "server-only";
import { readLimited, safeFetch } from "@/lib/safe-fetch";

/*
 * "Næste rundvisninger" from a Zenbi sign-up form (signup.zenbi.dk/form/<id>,
 * e.g. Skyum's "Tilmelding til rundvisning"): the dates you can sign up for,
 * read from the form's own public data (the same the form shows), cached 10
 * minutes - the ones already past are left out. Only the date texts are taken
 * from it; nothing is ever sent to the form from here.
 */

export type ZenbiEvent = { title: string; date: string | null };

const cache = new Map<string, { at: number; events: ZenbiEvent[] }>();
const TEN_MINUTES = 10 * 60_000;
const MONTHS = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];

/** The form's id from its address (https://signup.zenbi.dk/form/<uuid>). */
export function zenbiFormId(raw: string): string | null {
  try {
    const u = new URL(String(raw).trim());
    if (u.protocol !== "https:" || u.hostname !== "signup.zenbi.dk") return null;
    return u.pathname.match(/^\/form\/([0-9a-f-]{36})\/?$/i)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** "Fredag d. 20. november kl. 16-18" → the day (the coming one when the year isn't written). */
export function zenbiDate(title: string, now = new Date()): string | null {
  const m = title.toLowerCase().match(/(\d{1,2})\.\s*(januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december)(?:\s+(\d{4}))?/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTHS.indexOf(m[2]);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let year = m[3] ? Number(m[3]) : now.getUTCFullYear();
  // No year: this year's, unless it's already well past - then next year's.
  if (!m[3] && Date.UTC(year, month, day) < today - 60 * 86_400_000) year++;
  const d = new Date(Date.UTC(year, month, day));
  return d.getUTCDate() === day ? d.toISOString().slice(0, 10) : null;
}

type Form = { details?: { fieldModels?: { id: string; title?: string }[]; fieldItemModels?: { fieldId: string; title?: string; orderBy?: number }[] } };

/**
 * The form's coming dates: the items of its date field (the first field whose
 * title says "dato", or the one named `field`), in the form's order, past ones
 * left out.
 */
export async function zenbiEvents(raw: string, field?: string): Promise<ZenbiEvent[]> {
  const id = zenbiFormId(raw);
  if (!id) throw new Error("Linket skal være en Zenbi-formular: https://signup.zenbi.dk/form/…");
  const key = `${id}|${field ?? ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TEN_MINUTES) return hit.events;

  const res = await safeFetch(`https://signup.zenbi.dk/api/signup/api/v1/external/signup/form?layerId=${id}`, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; Nextview360-tour)" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Zenbi svarede ${res.status}.`);
  const form = JSON.parse((await readLimited(res, 2_000_000)).toString("utf8")) as Form;
  const fields = form.details?.fieldModels ?? [];
  const wanted = field?.trim().toLowerCase();
  const dateField = fields.find((f) => (wanted ? f.title?.toLowerCase().includes(wanted) : /dato/i.test(f.title ?? "")));
  if (!dateField) throw new Error(wanted ? `Formularen har intet felt, der hedder "${field}".` : "Formularen har intet felt med datoer.");
  const today = new Date().toISOString().slice(0, 10);
  const events = (form.details?.fieldItemModels ?? [])
    .filter((i) => i.fieldId === dateField.id && i.title?.trim())
    .sort((a, b) => (a.orderBy ?? 0) - (b.orderBy ?? 0))
    .map((i) => ({ title: i.title!.trim().slice(0, 100), date: zenbiDate(i.title!) }))
    .filter((e) => !e.date || e.date >= today)
    .slice(0, 8);
  if (cache.size > 200) cache.clear();
  cache.set(key, { at: Date.now(), events });
  return events;
}
