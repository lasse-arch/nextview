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


/** A model's scan points by number (ss, from 1 - Matterport's own index + 1, the same numbers MPSkins and U-links use) -> sweep id. */
export async function fetchSweepIndex(modelId: string): Promise<Record<number, string>> {
  try {
    const res = await fetch("https://my.matterport.com/api/mp/models/graph", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: `{ model(id: ${JSON.stringify(modelId)}) { locations { id index } } }` }),
      signal: AbortSignal.timeout(10_000),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return {};
    const data = (await res.json()) as { data?: { model?: { locations?: { id: string; index: number }[] } } };
    return Object.fromEntries((data.data?.model?.locations ?? []).map((l) => [l.index + 1, l.id]));
  } catch {
    return {};
  }
}

export type ModelInfo = { id: string; name: string; address: string; image: string | null; photos: string[] };

/** A model's name, address and photos (the hero photo first), from Matterport's public player data. Null if it isn't public or doesn't exist. */
export async function fetchModelInfo(modelId: string): Promise<ModelInfo | null> {
  if (!/^[a-zA-Z0-9]{11}$/.test(modelId)) return null;
  try {
    const res = await fetch(`https://my.matterport.com/api/player/models/${modelId}/`, { signal: AbortSignal.timeout(10_000), next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const d = (await res.json()) as {
      name?: string;
      address?: { address_1?: string; zip?: string; city?: string } | null;
      images?: { src: string; is_hero?: boolean }[];
    };
    const images = [...(d.images ?? [])].sort((a, b) => Number(b.is_hero ?? false) - Number(a.is_hero ?? false)).map((i) => i.src);
    const a = d.address;
    return { id: modelId, name: d.name ?? modelId, address: a ? [a.address_1, [a.zip, a.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "", image: images[0] ?? null, photos: images.slice(0, 12) };
  } catch {
    return null;
  }
}

/** Matterport model ids in text: a deal's mpSkinId list, my.matterport.com links (?m=…). */
export function modelIdsIn(text: string): string[] {
  const ids = [...text.matchAll(/[?&]m=([a-zA-Z0-9]{11})\b/g)].map((m) => m[1]);
  for (const part of text.split(/[\s,;]+/)) if (/^[a-zA-Z0-9]{11}$/.test(part)) ids.push(part);
  return [...new Set(ids)];
}

export type AccountModel = { id: string; name: string; created: string | null };

/**
 * The spaces on our Matterport account (like MPSkins' "Select Matterport
 * Space"), newest first, searchable - via Matterport's Model API with an API
 * token ("id:secret", made under Settings → Developer Tools → API Token
 * Management on my.matterport.com).
 */
export async function searchAccountModels(token: string, query: string, offset?: string | null): Promise<{ ok: true; models: AccountModel[]; next: string | null; total: number } | { ok: false; error: string }> {
  try {
    const res = await fetch("https://api.matterport.com/api/models/graph", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Basic ${Buffer.from(token).toString("base64")}` },
      body: JSON.stringify({
        query: `query Spaces($q: String, $o: String) { models(query: $q, offset: $o, pageSize: 40) { totalResults nextOffset results { id name created } } }`,
        variables: { q: query.trim() || null, o: offset || null },
      }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) return { ok: false, error: "Matterport afviste nøglen - tjek token-id og secret." };
    const data = (await res.json().catch(() => null)) as {
      data?: { models?: { totalResults?: number; nextOffset?: string | null; results?: { id: string; name?: string; created?: string }[] } };
      errors?: { message: string }[];
    } | null;
    if (data?.errors?.length) return { ok: false, error: `Matterport: ${data.errors[0].message}` };
    const m = data?.data?.models;
    if (!m) return { ok: false, error: `Matterport svarede ${res.status}.` };
    return { ok: true, models: (m.results ?? []).map((r) => ({ id: r.id, name: r.name ?? r.id, created: r.created ?? null })), next: m.nextOffset ?? null, total: m.totalResults ?? 0 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
