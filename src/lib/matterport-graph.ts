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

/** A measurement saved on the model in Matterport: its label and points (metres, the model's own frame). */
export type SavedMeasurement = { label: string; points: [number, number, number][] };

/** The model's saved measurements - public only when the model shows saved measurements ("Measure and view"). */
export async function fetchMeasurements(modelId: string): Promise<SavedMeasurement[]> {
  try {
    const res = await fetch("https://my.matterport.com/api/mp/models/graph", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `{ model(id: ${JSON.stringify(modelId)}) { measurementPaths(includeDisabled: false) { label enabled points { position { x y z } } } } }`,
      }),
      signal: AbortSignal.timeout(10_000),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data?: { model?: { measurementPaths?: { label: string | null; enabled: boolean; points: { position: { x: number; y: number; z: number } }[] }[] } };
    };
    return (data.data?.model?.measurementPaths ?? [])
      .filter((m) => m.enabled !== false && m.points.length >= 2)
      .map((m) => ({ label: m.label ?? "", points: m.points.map((p) => [p.position.x, p.position.y, p.position.z] as [number, number, number]) }));
  } catch {
    return [];
  }
}
