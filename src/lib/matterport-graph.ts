import "server-only";

/**
 * A Matterport model's scan points as a network: which ones you can walk
 * between (`n`) and where each one is (`p`, metres). From Matterport's public
 * model data - what the viewer itself uses - so a route can be found from
 * wherever the visitor stands to any room.
 */
export type SweepGraph = Record<string, { n: string[]; p: [number, number, number] }>;

export async function fetchSweepGraph(modelId: string): Promise<SweepGraph | null> {
  try {
    const res = await fetch("https://my.matterport.com/api/mp/models/graph", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: `{ model(id: ${JSON.stringify(modelId)}) { locations { id neighbors position { x y z } } } }` }),
      signal: AbortSignal.timeout(10_000),
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: { model?: { locations?: { id: string; neighbors: string[]; position: { x: number; y: number; z: number } }[] } };
    };
    const locations = data.data?.model?.locations;
    if (!locations?.length) return null;
    return Object.fromEntries(
      locations.map((l) => [l.id, { n: l.neighbors, p: [+l.position.x.toFixed(2), +l.position.y.toFixed(2), +l.position.z.toFixed(2)] as [number, number, number] }])
    );
  } catch {
    return null;
  }
}
