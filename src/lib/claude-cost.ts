import "server-only";

/** Claude Opus 5.5's price per million tokens: input $4, output $20, cache reads $0.20, cache writes (5 min) $5. */
export function claudeCostUsd(u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }) {
  return (u.input_tokens * 4 + u.output_tokens * 20 + (u.cache_read_input_tokens ?? 0) * 0.2 + (u.cache_creation_input_tokens ?? 0) * 5) / 1_000_000;
}
