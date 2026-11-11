import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { getSettingValue } from "@/lib/integration-settings";
import { claudeCostUsd } from "@/lib/claude-cost";

/*
 * A brief written by nextviewAI with the web at hand (web search and fetch):
 * the call behind "Gør mig klar til møde" and "Første opkald" (Generator).
 * The answer is the "## " sections after the last search; the pages it read
 * come along as the sources. What it reads on the web is data, never
 * instructions - the callers' rules say so.
 */

export type BriefSource = { url: string; title: string };
export type BriefResult = { ok: true; body: string; sources: BriefSource[] } | { ok: false; error: string };

export const apiKey = async () => process.env.ANTHROPIC_API_KEY || (await getSettingValue("ANTHROPIC_API_KEY"));

/** The pages it read on the web: the ones it cited first, then what it fetched. */
function sourcesOf(blocks: Anthropic.ContentBlock[], max: number): BriefSource[] {
  const cited = new Map<string, string>();
  const read = new Map<string, string>();
  for (const b of blocks) {
    if (b.type === "text") for (const c of b.citations ?? []) if ("url" in c && c.url) cited.set(c.url, ("title" in c && c.title) || c.url);
    if (b.type === "web_fetch_tool_result" && "url" in b.content && typeof b.content.url === "string") read.set(b.content.url, b.content.url);
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content) if (r.type === "web_search_result" && !read.has(r.url)) read.set(r.url, r.title || r.url);
  }
  const all = [...cited, ...[...read].filter(([u]) => !cited.has(u))].filter(([u]) => /^https?:\/\//i.test(u));
  return all.slice(0, max).map(([url, title]) => ({ url, title: title.slice(0, 160) }));
}

export async function writeWebBrief(opts: {
  who: { name: string };
  /** Logged as (TourAiUsage.kind) - also what the rate limits count. */
  kind: string;
  /** The rules - the big, rarely changing part, cached. */
  system: string;
  /** After it, not cached (e.g. the team's own answers). */
  systemTail?: string;
  text: string;
  searches: number;
  fetches: number;
  effort: "low" | "medium" | "high";
  maxTokens: number;
  timeoutMs: number;
  maxSources?: number;
}): Promise<BriefResult> {
  const key = await apiKey();
  if (!key) return { ok: false, error: "nextviewAI er ikke sat op endnu - en admin indsætter nøglen i tour-editoren under fanen nextviewAI." };
  const client = new Anthropic({ apiKey: key });
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.text }];
  const content: Anthropic.ContentBlock[] = [];
  let usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  let searches = 0;
  let stop: Anthropic.StopReason | null = null;
  try {
    // A long search turn can pause; it is sent back so the server goes on (a few times at most).
    for (let round = 0; round < 4; round++) {
      const r = await client.messages
        .stream(
          {
            model: "claude-opus-5-5",
            max_tokens: opts.maxTokens,
            thinking: { type: "adaptive" },
            output_config: { effort: opts.effort },
            system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }, ...(opts.systemTail ? [{ type: "text" as const, text: opts.systemTail }] : [])],
            tools: [
              { type: "web_search_20260209", name: "web_search", max_uses: opts.searches, user_location: { type: "approximate", country: "DK", timezone: "Europe/Copenhagen" } },
              ...(opts.fetches ? [{ type: "web_fetch_20260209" as const, name: "web_fetch" as const, max_uses: opts.fetches, max_content_tokens: 12000 }] : []),
            ],
            messages,
          },
          { signal: AbortSignal.timeout(opts.timeoutMs) },
        )
        .finalMessage();
      const u = r.usage;
      usage = {
        input_tokens: usage.input_tokens + u.input_tokens,
        output_tokens: usage.output_tokens + u.output_tokens,
        cache_read_input_tokens: usage.cache_read_input_tokens + (u.cache_read_input_tokens ?? 0),
        cache_creation_input_tokens: usage.cache_creation_input_tokens + (u.cache_creation_input_tokens ?? 0),
      };
      searches += u.server_tool_use?.web_search_requests ?? 0;
      content.push(...r.content);
      stop = r.stop_reason;
      if (stop !== "pause_turn") break;
      messages.push({ role: "assistant", content: r.content });
    }
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, error: "nextviewAI-nøglen virker ikke længere." };
    return { ok: false, error: `Kunne ikke få fat i nextviewAI (${err instanceof Error ? err.message : err}).` };
  } finally {
    // Web searches cost $10 per 1,000 on top of the tokens.
    await prisma.tourAiUsage
      .create({ data: { tourSlug: `_${opts.kind}`, userName: opts.who.name, kind: opts.kind, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, cacheReadTokens: usage.cache_read_input_tokens, cacheWriteTokens: usage.cache_creation_input_tokens, costUsd: claudeCostUsd(usage) + searches * 0.01 } })
      .catch(() => {});
  }
  if (stop === "refusal") return { ok: false, error: "nextviewAI ville ikke lave den." };
  // The brief is the text after the last search - what came before is "now I'll look at …".
  const lastTool = content.findLastIndex((b) => b.type !== "text" && b.type !== "thinking" && b.type !== "redacted_thinking");
  const textOf = (blocks: Anthropic.ContentBlock[]) =>
    blocks
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  const after = textOf(content.slice(lastTool + 1));
  const body = after.includes("## ") ? after : textOf(content);
  const start = body.indexOf("## ");
  const brief = (start > 0 ? body.slice(start) : body).trim();
  if (!brief) return { ok: false, error: stop === "max_tokens" ? "Den blev for lang - prøv igen." : "nextviewAI svarede ikke - prøv igen." };
  return { ok: true, body: brief, sources: sourcesOf(content, opts.maxSources ?? 14) };
}
