import type { SweepGraph } from "@/lib/matterport-graph";

/*
 * Does hiding a scan point cut the tour in two? A hidden scan can't be walked
 * through, so if it's the only way between two parts of the tour, the part
 * behind it can no longer be reached by walking. Counts the scan points that
 * are lost that way - 0 means hiding it is harmless (a dead end or a scan
 * with other ways around it).
 */

function reach(graph: SweepGraph, from: string, blocked: Set<string>): Set<string> {
  const seen = new Set<string>([from]);
  const queue = [from];
  while (queue.length) {
    for (const next of graph[queue.pop()!]?.n ?? []) {
      if (seen.has(next) || blocked.has(next) || !graph[next]) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

/** The scan points you can no longer walk to from `start` (or the largest connected part, without one) once `sweep` is hidden too. */
export function strandedBy(graph: SweepGraph, sweep: string, hidden: Set<string>, start?: string | null): string[] {
  const blocked = new Set(hidden);
  blocked.delete(sweep);
  let from = start && graph[start] && !blocked.has(start) ? start : null;
  if (!from) {
    // No start point to go by: the biggest part of the tour is "the tour".
    let best: Set<string> | null = null;
    const done = new Set<string>();
    for (const id of Object.keys(graph)) {
      if (done.has(id) || blocked.has(id)) continue;
      const part = reach(graph, id, blocked);
      part.forEach((s) => done.add(s));
      if (!best || part.size > best.size) best = part;
    }
    if (!best?.has(sweep)) return [];
    from = [...best].find((s) => s !== sweep) ?? null;
    if (!from) return [];
  }
  if (from === sweep) return [];
  const before = reach(graph, from, blocked);
  if (!before.has(sweep)) return [];
  blocked.add(sweep);
  let after = reach(graph, from, blocked);
  if (from !== start) {
    // Without a start point, the bigger side is the one that stays.
    for (const id of before) {
      if (id === sweep || after.has(id)) continue;
      const part = reach(graph, id, blocked);
      if (part.size > after.size) after = part;
    }
  }
  return [...before].filter((s) => s !== sweep && !after.has(s));
}
