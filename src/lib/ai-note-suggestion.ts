/**
 * Google's Gemini API (not Anthropic's) - deliberately chosen because it has
 * a genuinely free tier (Gemini 3.8 Flash: no credit card required, 1500
 * requests/day), which comfortably covers this feature's actual usage
 * pattern - a seller manually clicking "AI-referat" on one e-mail at a time,
 * not a high-volume automated job.
 *
 * Was gemini-2.5-flash originally - Google retired that model for new API
 * keys shortly after this was built ("no longer available to new users"),
 * so if this starts 404ing again on its own model name, that's almost
 * certainly what happened again - check ai.google.dev/gemini-api/docs for
 * whatever the current flash model is called.
 */
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent";

export function isAiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

const SYSTEM_PROMPT = `Du hjælper en sælger i et dansk CRM-system (Nextview360, der sælger virtuelle 360-graders rundvisninger) med at omsætte en e-mail til en CRM-note.

Vigtigst af alt: notens indhold skal være 100% baseret på det, der faktisk står i e-mailen. Opfind eller antag ALDRIG et svar, en beslutning, en indvending eller et udfald, som ikke direkte fremgår af teksten - heller ikke selvom det ville være et "typisk" forløb. Hvis "Retning" er "Sendt til kunden", beskriver noten hvad SÆLGEREN skrev/tilbød/spurgte om - ikke en formodet reaktion fra kunden, som ikke er nævnt. Hvis mailen ikke indeholder noget særligt nyt (fx bare et standard-tilbud), er en kort, neutral gengivelse af hvad der blev sendt bedre end at digte noget dramatisk.

Skriv noten på dansk, i samme knappe, praktiske stil som erfarne sælgere selv skriver noter i - ingen overflødige høflighedsfraser. Gengiv IKKE bare et enkelt overordnet faktum - tag alt med der er relevant at kunne slå op senere: hvis kunden afviser, siger nej, eller udskyder, skal den KONKRETE begrundelse de giver med (fx "bruger allerede [konkurrent/egen løsning]", "ingen tid/budget lige nu", "skal spørge chefen" osv.) - "afviser" alene uden grund er ikke nok. Nævn også datoer, beløb, hvem der skal gøre hvad næste gang, og eventuelle andre konkrete detaljer (produkter nævnt, kontaktpersoner, alternativer kunden foreslår). En note på 1 sætning er fint når mailen reelt kun indeholder én ting; er der flere selvstændige punkter i mailen, brug flere sætninger eller linjer, én pr. punkt, fremfor at klemme det hele sammen eller udelade noget.

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
        // Gemini 3.8 Flash spends part of maxOutputTokens on hidden "thinking"
        // before writing the visible answer - with thinkingLevel left at its
        // default, that ate almost the whole 300-token budget and cut the
        // actual note off mid-sentence. This task needs no real reasoning
        // (it's a short rewrite, not a puzzle), so thinking is set to "low"
        // and the budget raised generously as a margin either way.
        generationConfig: { maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: "low" } },
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
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  };
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("").trim();
  if (!text) return { ok: false, error: "AI-tjenesten returnerede intet forslag." };
  // A cut-off note that reads as a finished sentence is worse than an error -
  // surface it explicitly rather than letting a broken suggestion through.
  if (candidate?.finishReason === "MAX_TOKENS") {
    return { ok: false, error: "AI-svaret blev afbrudt undervejs. Prøv igen." };
  }

  return { ok: true, suggestion: text };
}
