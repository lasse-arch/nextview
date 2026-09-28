const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
/** A short, cheap model is plenty for summarising one e-mail into a couple of
 * Danish sentences - this isn't a task that needs the most capable model. */
const MODEL = "claude-haiku-4-5-20251001";

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SYSTEM_PROMPT = `Du hjælper en sælger i et dansk CRM-system (Nextview360, der sælger virtuelle 360-graders rundvisninger) med at omsætte en e-mail til en kort CRM-note.

Skriv noten på dansk, i samme knappe, praktiske stil som erfarne sælgere selv skriver noter i - korte sætninger, ingen overflødige høflighedsfraser, fokusér kun på det der er relevant at huske: aftaler, datoer, indvendinger, ønsker, eller næste skridt. Typisk 1-3 sætninger.

Svar KUN med selve note-teksten, ingen indledning, ingen anførselstegn, intet markdown.`;

export type EmailForSuggestion = {
  direction: "INBOUND" | "OUTBOUND";
  fromAddress: string;
  toAddresses: string;
  subject: string | null;
  bodyText: string | null;
};

export type SuggestionResult = { ok: true; suggestion: string } | { ok: false; error: string };

/**
 * Asks Claude to turn one e-mail into a short, ready-to-edit CRM note - the
 * "+ Opgave" button's equivalent for e-mails, but here the source text isn't
 * already something a seller wrote themselves, so it needs summarising
 * first rather than just being copied over. The suggestion is only ever
 * shown for review/editing before saving - never written as a note directly.
 */
export async function suggestNoteFromEmail(email: EmailForSuggestion): Promise<SuggestionResult> {
  if (!isAiConfigured()) {
    return { ok: false, error: "AI-referater er ikke konfigureret endnu (mangler ANTHROPIC_API_KEY)." };
  }
  if (!email.bodyText?.trim()) {
    return { ok: false, error: "Denne mail har ingen tekst at lave et referat ud fra." };
  }

  const userMessage = [
    `Retning: ${email.direction === "INBOUND" ? "Modtaget fra kunden" : "Sendt til kunden"}`,
    `Fra: ${email.fromAddress}`,
    `Til: ${email.toAddresses}`,
    email.subject ? `Emne: ${email.subject}` : null,
    "",
    email.bodyText,
  ]
    .filter((line) => line !== null)
    .join("\n");

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? `Kunne ikke kontakte AI-tjenesten: ${err.message}` : "Kunne ikke kontakte AI-tjenesten." };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `AI-tjenesten svarede med fejl ${res.status}: ${body.slice(0, 200)}` };
  }

  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = data.content?.find((block) => block.type === "text")?.text?.trim();
  if (!text) return { ok: false, error: "AI-tjenesten returnerede intet forslag." };

  return { ok: true, suggestion: text };
}
