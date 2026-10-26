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

export type ScanPoint = { ss: number; sid: string; x: number; y: number; floor: number; /** Place on the floor's plan image, in % (when it has one). */ px?: number; py?: number };
export type ScanFloor = { name: string; /** Matterport's photographic top-down plan of the floor (a signed link - fetched fresh, never stored). */ image: string | null; aspect: number | null };
export type ScanMap = { floors: ScanFloor[]; points: ScanPoint[] };

type GraphFloorplan = { url: string; resolution: number | null; origin: { x: number; y: number } | null; width: number | null; height: number | null; floor: { id: string } | null };

/**
 * Every scan point seen from above, by floor, on Matterport's own
 * photographic floor plan (the "colorplan" - the picture MPSkins shows),
 * placed by the plan's scale and origin in the model's coordinates (z-up).
 */
export async function fetchScanMap(modelId: string): Promise<ScanMap | null> {
  try {
    const res = await fetch("https://my.matterport.com/api/mp/models/graph", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `{ model(id: ${JSON.stringify(modelId)}) { floors { id label sequence } locations { id index position { x y z } floor { id } } assets { floorplans { url resolution origin { x y } width height floor { id } } } } }`,
      }),
      signal: AbortSignal.timeout(10_000),
      next: { revalidate: 1800 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: {
        model?: {
          floors?: { id: string; label: string | null; sequence: number }[];
          locations?: { id: string; index: number; position: { x: number; y: number }; floor: { id: string } | null }[];
          assets?: { floorplans?: GraphFloorplan[] } | null;
        };
      };
    };
    const m = data.data?.model;
    if (!m?.locations?.length) return null;
    const floors = [...(m.floors ?? [])].sort((a, b) => a.sequence - b.sequence);
    // Per floor the best plan: the photographic one with a transparent background, else the plain photographic one.
    const plans = floors.map((f) => {
      const mine = (m.assets?.floorplans ?? []).filter((p) => p.floor?.id === f.id && p.origin && p.resolution && p.width && p.height);
      const name = (p: GraphFloorplan) => p.url.split("?")[0].split("/").pop() ?? "";
      return mine.find((p) => name(p).startsWith("colorplan_alpha")) ?? mine.find((p) => name(p).startsWith("colorplan_0")) ?? null;
    });
    return {
      floors: floors.map((f, i) => ({ name: f.label || `Etage ${i + 1}`, image: plans[i]?.url ?? null, aspect: plans[i] ? plans[i]!.width! / plans[i]!.height! : null })),
      points: m.locations.map((l) => {
        const floor = Math.max(0, floors.findIndex((f) => f.id === l.floor?.id));
        const plan = plans[floor];
        const at = plan
          ? { px: +((((l.position.x - plan.origin!.x) * plan.resolution!) / plan.width!) * 100).toFixed(2), py: +(((plan.height! - (l.position.y - plan.origin!.y) * plan.resolution!) / plan.height!) * 100).toFixed(2) }
          : {};
        return { ss: l.index + 1, sid: l.id, x: +l.position.x.toFixed(2), y: +l.position.y.toFixed(2), floor, ...at };
      }),
    };
  } catch {
    return null;
  }
}

export type ScanImages = { sweepId: string; ss: number; low: string | null; high: string | null };

/**
 * Every scan point's pictures (the cube's faces, from Matterport's public
 * model graph): `<face>` in the templates is 0 (ceiling), 1-4 (the walls
 * around) or 5 (floor). The addresses are signed and expire after a while -
 * fetch them fresh when they're to be shown.
 */
export async function fetchScanImages(modelId: string): Promise<ScanImages[]> {
  const res = await fetch("https://my.matterport.com/api/mp/models/graph", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: `{ model(id: ${JSON.stringify(modelId)}) { locations { id index pano { skyboxes { resolution status urlTemplate } } } } }` }),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Matterport svarede ${res.status}.`);
  const json = (await res.json()) as { data?: { model?: { locations: { id: string; index: number; pano?: { skyboxes: { resolution: string; status: string; urlTemplate: string | null }[] } }[] } } };
  const locations = json.data?.model?.locations;
  if (!locations) throw new Error("Matterport-modellen findes ikke eller er ikke offentlig.");
  const url = (l: (typeof locations)[number], r: string) => l.pano?.skyboxes.find((s) => s.resolution === r && s.urlTemplate)?.urlTemplate ?? null;
  return locations
    .map((l) => ({ sweepId: l.id, ss: l.index + 1, low: url(l, "low"), high: url(l, "high") ?? url(l, "2k") }))
    .filter((l) => l.low || l.high)
    .sort((a, b) => a.ss - b.ss);
}
