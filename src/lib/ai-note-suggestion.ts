/**
 * Google's Gemini API (not Anthropic's) - deliberately chosen because it has
 * a genuinely free tier (Gemini 2.5 Flash: no credit card required, several
 * hundred requests/day), which comfortably covers this feature's actual
 * usage pattern - a seller manually clicking "AI-referat" on one e-mail at a
 * time, not a high-volume automated job.
 */
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export function isAiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
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
 * Asks Gemini to turn one e-mail into a short, ready-to-edit CRM note - the
 * "+ Opgave" button's equivalent for e-mails, but here the source text isn't
 * already something a seller wrote themselves, so it needs summarising
 * first rather than just being copied over. The suggestion is only ever
 * shown for review/editing before saving - never written as a note directly.
 */
export async function suggestNoteFromEmail(email: EmailForSuggestion): Promise<SuggestionResult> {
  if (!isAiConfigured()) {
    return { ok: false, error: "AI-referater er ikke konfigureret endnu (mangler GEMINI_API_KEY)." };
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
    res = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: {
        "x-goog-api-key": process.env.GEMINI_API_KEY!,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        generationConfig: { maxOutputTokens: 300 },
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

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
  if (!text) return { ok: false, error: "AI-tjenesten returnerede intet forslag." };

  return { ok: true, suggestion: text };
}
