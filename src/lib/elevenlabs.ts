import "server-only";

/*
 * ElevenLabs: the voice that reads a guided tour's stops aloud. Only Arpo
 * talks to ElevenLabs (the key, ELEVENLABS_API_KEY, lives in Vercel - a key
 * limited to Text to Speech and Voices: read). The visitors only ever get the
 * finished mp3 files, kept with the tour's own files.
 */

const API = "https://api.elevenlabs.io/v1";
/** Speaks Danish (and the tour's other languages) well. */
const MODEL = "eleven_multilingual_v2";
export const VOICE_ID = /^[A-Za-z0-9]{8,40}$/;
export const MAX_CHARS = 2500;

/** The key as pasted in Vercel - without the spaces, line breaks or quotes that easily come along when it's copied. */
export function elevenLabsKey(): string | null {
  const k = (process.env.ELEVENLABS_API_KEY ?? "").trim().replace(/^["']|["']$/g, "").trim();
  return k || null;
}
export const elevenLabsReady = () => Boolean(elevenLabsKey());

function key(): string {
  const k = elevenLabsKey();
  if (!k) throw new Error("ElevenLabs er ikke sat op: læg ELEVENLABS_API_KEY i Vercel (en nøgle med adgang til Text to Speech og Voices: Read).");
  return k;
}

/** ElevenLabs' own message - never the key. */
async function failure(res: Response, what: string): Promise<Error> {
  const body = (await res.json().catch(() => null)) as { detail?: { message?: string; status?: string } | string } | null;
  const msg = typeof body?.detail === "string" ? body.detail : (body?.detail?.message ?? body?.detail?.status);
  return new Error(`ElevenLabs: ${what} (${res.status})${msg ? `: ${msg}` : ""}`);
}

export type Voice = { id: string; name: string; preview: string | null; about: string };

/** The voices the account can use (its own and ElevenLabs' ready-made ones). */
export async function listVoices(): Promise<Voice[]> {
  const res = await fetch(`${API}/voices`, { headers: { "xi-api-key": key() }, signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (!res.ok) throw await failure(res, "kunne ikke hente stemmerne");
  const body = (await res.json()) as { voices?: { voice_id: string; name: string; preview_url?: string | null; labels?: Record<string, string>; category?: string }[] };
  return (body.voices ?? [])
    .filter((v) => VOICE_ID.test(v.voice_id))
    .map((v) => ({
      id: v.voice_id,
      name: v.name.slice(0, 80),
      preview: v.preview_url && /^https:\/\//.test(v.preview_url) ? v.preview_url : null,
      about: [v.labels?.gender, v.labels?.age, v.labels?.accent, v.labels?.description ?? v.labels?.use_case].filter(Boolean).join(" · ").slice(0, 120),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "da"));
}

/** The text read aloud by the voice, as an mp3. */
export async function speak(voiceId: string, text: string): Promise<Buffer> {
  if (!VOICE_ID.test(voiceId)) throw new Error("Ukendt stemme.");
  const words = text.trim();
  if (!words) throw new Error("Stoppet har ingen tekst at læse op.");
  if (words.length > MAX_CHARS) throw new Error(`Teksten er for lang til én lydfil (højst ${MAX_CHARS} tegn).`);
  const res = await fetch(`${API}/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key(), "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text: words, model_id: MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw await failure(res, "kunne ikke lave lyden");
  const audio = Buffer.from(await res.arrayBuffer());
  if (audio.length < 500) throw new Error("ElevenLabs sendte ingen lyd tilbage.");
  return audio;
}
