"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { setSettingValue } from "@/lib/integration-settings";

/** Saves the Matterport SDK key (a public browser key, locked to our domains in Matterport). */
export async function saveMatterportSdkKey(key: string): Promise<void> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan ændre SDK-nøglen.");
  await setSettingValue("MATTERPORT_SDK_KEY", key.trim() || null);
  revalidatePath("/tour-lab");
}

export type ResolvedTourLink = { modelId: string; sweepId: string | null; ss: number | null } | { error: string };

/** Pulls the `var cfg = {...}` object MPSkins renders into every tour page. */
function extractMpskinsCfg(html: string): { mpModel?: string; sweep?: { uuid?: string }[] } | null {
  const start = html.indexOf("var cfg = ");
  if (start < 0) return null;
  const from = html.indexOf("{", start);
  let depth = 0;
  let inString = false;
  for (let i = from; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(html.slice(from, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Turns an MPSkins link (explore.nextview360.dk/…?ss=…) into what our own
 * tour needs: the Matterport model id and the exact scan point. Read from
 * the tour page's own config, where `sweep` lists the scan points in the
 * order the ss numbers count (from 1) - so no guessing and no pressing U.
 */
export async function resolveTourLink(url: string): Promise<ResolvedTourLink> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { error: "Kun admin." };
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { error: "Ugyldigt link." };
  }
  if (parsed.hostname !== "explore.nextview360.dk") return { error: "Ikke et explore.nextview360.dk-link." };
  const ssRaw = parsed.searchParams.get("ss");
  const ss = ssRaw && /^\d+$/.test(ssRaw) ? Number(ssRaw) : null;
  const page = new URL(parsed.pathname, parsed.origin);
  try {
    const res = await fetch(page, { signal: AbortSignal.timeout(10_000), next: { revalidate: 3600 } });
    if (!res.ok) return { error: `MPSkins svarede ${res.status}.` };
    const cfg = extractMpskinsCfg(await res.text());
    if (!cfg?.mpModel) return { error: "Fandt ikke touren i MPSkins-siden." };
    const sweepId = ss != null ? cfg.sweep?.[ss - 1]?.uuid ?? null : null;
    if (ss != null && !sweepId) return { error: `Fandt ikke scanpunkt nr. ${ss} i touren.` };
    return { modelId: cfg.mpModel, sweepId, ss };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunne ikke hente MPSkins-siden." };
  }
}
