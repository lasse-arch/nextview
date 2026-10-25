"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { resolveTourLink, saveMatterportSdkKey } from "@/lib/actions/tour-lab";
import { connectSdk, modelIdFrom, showcaseUrl, sweepIdForIndex, uLinkTarget, type MpSdk, type Rotation, type SweepInfo } from "./matterport";

// The 360° viewer (WebGL) only runs in the browser.
const Pano = dynamic(() => import("./pano").then((m) => m.Pano), { ssr: false });

type Point = {
  id: string;
  name: string;
  /** Position on the overview picture, in % of its width/height. */
  x: number;
  y: number;
  kind: "matterport" | "pano";
  /** Matterport link (tour link or "U"-link) or a 360° image URL. */
  url: string;
  /** Picked with "Brug dette sted" through the SDK - the exact spot and view direction. */
  sweepId?: string;
  rotation?: Rotation;
  /** Matterport model id - from the link itself (m=), or looked up from an MPSkins explore link. */
  modelId?: string;
};

const STORAGE_KEY = "tour-lab-v1";

/**
 * Without the SDK a point can only open the tour from a "U"-link, which
 * carries the start spot (ss) and view direction (sr) - a fresh load each time.
 */
function plainEmbedUrl(raw: string): string {
  try {
    const url = new URL(raw.trim());
    for (const [k, v] of Object.entries({ play: "1", qs: "1", brand: "0", help: "0", title: "0" })) url.searchParams.set(k, v);
    return url.toString();
  } catch {
    return raw;
  }
}

/** Wall-clock for the load/jump timings shown in the lab (only called from effects and click handlers). */
const now = () => performance.now();

/** Without the SDK: the tour itself, started at the U-link's spot (ss/sr) - an explore.nextview360.dk link carries no model id, so the lab's tour supplies it. */
function fallbackEmbedUrl(url: string, modelId: string | null): string {
  if (modelIdFrom(url) || !modelId) return plainEmbedUrl(url);
  const extra: Record<string, string> = {};
  try {
    const params = new URL(url.trim()).searchParams;
    for (const k of ["ss", "sr"]) {
      const v = params.get(k);
      if (v) extra[k] = v;
    }
  } catch {}
  return showcaseUrl(modelId, null, extra);
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
}

type Player = {
  sdk: MpSdk | null;
  ready: Promise<MpSdk>;
  readyMs: number | null;
  error: string | null;
  /** The tour's scan points, for resolving U-links (ss=…) to a sweep. */
  sweeps: Record<string, SweepInfo>;
};

/**
 * One Matterport tour, loaded in the background as soon as the overview is
 * shown (so it's ready by the time a point is clicked) and kept alive -
 * every point in the same tour is then a glide to that spot via the SDK,
 * never a new load.
 */
function ModelPlayer({
  modelId,
  sdkKey,
  visible,
  onState,
}: {
  modelId: string;
  sdkKey: string;
  visible: boolean;
  onState: (modelId: string, player: Player) => void;
}) {
  const iframe = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const el = iframe.current;
    if (!el) return;
    const started = now();
    let resolve!: (sdk: MpSdk) => void;
    let reject!: (err: unknown) => void;
    const ready = new Promise<MpSdk>((res, rej) => ((resolve = res), (reject = rej)));
    ready.catch(() => {});
    const sweeps: Record<string, SweepInfo> = {};
    onState(modelId, { sdk: null, ready, readyMs: null, error: null, sweeps });
    let cancelled = false;
    let sub: { cancel(): void } | null = null;
    connectSdk(el, sdkKey)
      .then(async (sdk) => {
        sub = sdk.Sweep.data.subscribe({ onCollectionUpdated: (c) => Object.assign(sweeps, c) });
        await sdk.App.state.waitUntil((s) => s.phase === sdk.App.Phase.PLAYING);
        if (cancelled) return;
        onState(modelId, { sdk, ready, readyMs: now() - started, error: null, sweeps });
        resolve(sdk);
      })
      .catch((err) => {
        if (cancelled) return;
        onState(modelId, { sdk: null, ready, readyMs: null, error: err instanceof Error ? err.message : String(err), sweeps });
        reject(err);
      });
    return () => {
      cancelled = true;
      sub?.cancel();
    };
  }, [modelId, sdkKey, onState]);

  return (
    <iframe
      ref={iframe}
      src={showcaseUrl(modelId, sdkKey)}
      className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-300 ${visible ? "opacity-100" : "pointer-events-none opacity-0"}`}
      allow="fullscreen; xr-spatial-tracking; autoplay"
    />
  );
}

/** Editor: walk to the spot in the tour, turn the view, and take that as the point's target. */
function PlacePicker({
  modelId,
  sdkKey,
  onPick,
}: {
  modelId: string;
  sdkKey: string;
  onPick: (sweepId: string, rotation: Rotation) => void;
}) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const pose = useRef<{ sweep: string; rotation: Rotation } | null>(null);
  const [status, setStatus] = useState("Indlæser touren…");

  useEffect(() => {
    if (!iframe.current) return;
    let sub: { cancel(): void } | null = null;
    let cancelled = false;
    connectSdk(iframe.current, sdkKey)
      .then((sdk) => {
        if (cancelled) return;
        setStatus("Gå hen til stedet og drej billedet, som det skal starte - tryk så \"Brug dette sted\".");
        sub = sdk.Camera.pose.subscribe((p) => {
          if (p.sweep) pose.current = { sweep: p.sweep, rotation: p.rotation };
        });
      })
      .catch((err) => !cancelled && setStatus(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
      sub?.cancel();
    };
  }, [modelId, sdkKey]);

  return (
    <div className="space-y-2">
      <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
        <iframe ref={iframe} src={showcaseUrl(modelId, sdkKey)} className="absolute inset-0 h-full w-full border-0" allow="fullscreen; xr-spatial-tracking" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => pose.current && onPick(pose.current.sweep, pose.current.rotation)}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Brug dette sted
        </button>
        <span className="text-xs text-slate-500">{status}</span>
      </div>
    </div>
  );
}

function SdkKeyForm({ sdkKey }: { sdkKey: string | null }) {
  const [value, setValue] = useState(sdkKey ?? "");
  const [open, setOpen] = useState(!sdkKey);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  if (!open) {
    return (
      <p className="text-xs text-emerald-700">
        ✓ Matterport SDK-nøgle sat - punkter glider direkte hen til stedet.{" "}
        <button type="button" onClick={() => setOpen(true)} className="font-medium text-indigo-600 hover:underline">
          Skift
        </button>
      </p>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          await saveMatterportSdkKey(value);
          setOpen(false);
          router.refresh();
        });
      }}
    >
      <label htmlFor="mp-sdk-key" className="font-medium text-amber-900">
        Matterport SDK-nøgle
      </label>
      <input
        id="mp-sdk-key"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Indsæt nøglen fra Developer Tools → SDK Key Management"
        className="min-w-0 flex-1 rounded-md border border-amber-300 bg-white px-3 py-1.5"
      />
      <button type="submit" disabled={pending} className="rounded-md bg-slate-900 px-3 py-1.5 text-white disabled:opacity-50">
        Gem
      </button>
    </form>
  );
}

export function TourLab({ sdkKey }: { sdkKey: string | null }) {
  const [overview, setOverview] = useState<string | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [editing, setEditing] = useState(true);
  const [draft, setDraft] = useState<Point | null>(null);
  const [open, setOpen] = useState<Point | null>(null);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [jumpMs, setJumpMs] = useState<number | null>(null);
  const [jumpError, setJumpError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [linkStatus, setLinkStatus] = useState<string | null>(null);
  const lastOpenModel = useRef<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    requestAnimationFrame(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
        if (saved) {
          setOverview(saved.overview ?? null);
          setPoints(saved.points ?? []);
        }
      } catch {}
      loaded.current = true;
    });
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ overview, points: points.filter((p) => !p.url.startsWith("blob:")) }));
    } catch {}
  }, [overview, points]);

  const onPlayerState = useCallback((modelId: string, player: Player) => {
    setPlayers((prev) => ({ ...prev, [modelId]: player }));
  }, []);

  const modelOf = (p: Point) => (p.kind === "matterport" ? p.modelId ?? modelIdFrom(p.url) : null);

  // Tours to keep loaded in the background: every tour a point leads into.
  const modelIds = sdkKey && !editing
    ? [...new Set(points.filter((p) => p.kind === "matterport" && (p.sweepId || uLinkTarget(p.url))).map(modelOf).filter((m): m is string => Boolean(m)))]
    : [];
  const openModel = open ? modelOf(open) : null;
  const canJump = (p: Point) => Boolean(p.sweepId || uLinkTarget(p.url));
  const viaSdk = Boolean(
    open && open.kind === "matterport" && canJump(open) && openModel && modelIds.includes(openModel) && !players[openModel]?.error
  );

  async function openPoint(point: Point) {
    setOpen(point);
    setJumpMs(null);
    setJumpError(null);
    const modelId = modelOf(point);
    if (!modelId || !canJump(point) || !players[modelId] || players[modelId].error) return;
    const started = now();
    try {
      const sdk = await players[modelId].ready;
      const fromLink = uLinkTarget(point.url);
      const sweepId = point.sweepId ?? (fromLink ? sweepIdForIndex(players[modelId].sweeps, fromLink.ss) : null);
      if (!sweepId) {
        setJumpError(`Fandt ikke scanpunkt nr. ${fromLink?.ss} i touren.`);
        return;
      }
      // Arriving from the overview: straight to the spot. Moving between
      // points inside the tour: a short glide, like walking there.
      const inside = lastOpenModel.current === modelId;
      await sdk.Sweep.moveTo(sweepId, {
        rotation: point.rotation ?? fromLink?.rotation,
        transition: inside ? sdk.Sweep.Transition.FLY : sdk.Sweep.Transition.INSTANT,
        transitionTime: inside ? 1200 : undefined,
      });
      lastOpenModel.current = modelId;
      setJumpMs(now() - started);
    } catch (err) {
      console.error("Matterport moveTo failed", err);
      setJumpError(err instanceof Error ? err.message : String(err));
    }
  }

  function closeViewer() {
    setOpen(null);
    lastOpenModel.current = null;
  }

  function pickOverview(file: File) {
    const reader = new FileReader();
    reader.onload = () => setOverview(String(reader.result));
    reader.readAsDataURL(file);
  }

  function clickOverview(e: React.MouseEvent<HTMLDivElement>) {
    if (!editing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setDraft({ id: crypto.randomUUID(), name: "", x, y, kind: "matterport", url: "" });
    setLinkStatus(null);
    setPicking(false);
  }

  /** An MPSkins explore link: look up the tour and exact scan point automatically. */
  async function resolveDraftLink(url: string) {
    if (!draft || !/explore\.nextview360\.dk/.test(url)) return;
    setLinkStatus("Henter touren fra MPSkins…");
    const result = await resolveTourLink(url);
    if ("error" in result) {
      setLinkStatus(result.error);
      return;
    }
    setDraft((d) => (d && d.url === url ? { ...d, modelId: result.modelId, sweepId: result.sweepId ?? undefined, rotation: undefined } : d));
    setLinkStatus(result.ss != null ? `✓ Fundet automatisk: scanpunkt nr. ${result.ss} i touren ${result.modelId}.` : `✓ Fundet automatisk: touren ${result.modelId} - vælg stedet nedenfor.`);
  }

  function saveDraft() {
    if (!draft || !draft.url.trim()) return;
    setPoints((prev) => [...prev.filter((p) => p.id !== draft.id), { ...draft, name: draft.name.trim() || "Punkt" }]);
    setDraft(null);
    setPicking(false);
  }

  const draftModel = draft ? modelOf(draft) : null;
  const openPlayer = openModel ? players[openModel] : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Tour-lab</h1>
          <p className="text-sm text-slate-500">
            Prototype: overbliksbillede med egne punkter, der hopper ind i Matterport-touren eller et 360°-dronebillede.
          </p>
          <p className="mt-1 text-sm">
            Prototype-tours:{" "}
            <Link href="/tour-lab/halvorsminde" className="font-medium text-indigo-600 hover:underline">Halvorsminde (drone først)</Link>
            {" · "}
            <Link href="/tour-lab/fitness-gronlandstorv" className="font-medium text-indigo-600 hover:underline">Fitness United Grønlands Torv (direkte i touren)</Link>
            {" · "}
            <Link href="/tour-lab/decoflame" className="font-medium text-indigo-600 hover:underline">Decoflame (dronefilm først)</Link>
            {" · "}
            <Link href="/tour-lab/jalsa" className="font-medium text-indigo-600 hover:underline">Jalsa (restaurant)</Link>
            {" · "}
            <Link href="/tour-lab/halvorsminde-kort" className="font-medium text-indigo-600 hover:underline">Halvorsminde på kort (camping-model)</Link>
            {" · "}
            <Link href="/tour-lab/boxdepot" className="font-medium text-indigo-600 hover:underline">Boxdepotet (find vej)</Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            {overview ? "Skift overbliksbillede" : "Vælg overbliksbillede"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && pickOverview(e.target.files[0])} />
          </label>
          <div className="flex rounded-lg border border-slate-300 p-0.5 text-sm">
            <button type="button" onClick={() => setEditing(true)} className={`rounded-md px-3 py-1.5 ${editing ? "bg-slate-900 text-white" : "text-slate-600"}`}>
              Rediger
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(null);
                setPicking(false);
              }}
              className={`rounded-md px-3 py-1.5 ${!editing ? "bg-slate-900 text-white" : "text-slate-600"}`}
            >
              Vis som besøgende
            </button>
          </div>
        </div>
      </div>

      <SdkKeyForm sdkKey={sdkKey} />



      {!editing && modelIds.length > 0 && (
        <p className="text-xs text-slate-500">
          {modelIds.map((m) => {
            const p = players[m];
            return (
              <span key={m} className="mr-3">
                Tour {m}:{" "}
                {p?.error ? (
                  <span className="text-red-600">{p.error}</span>
                ) : p?.readyMs != null ? (
                  <span className="text-emerald-700">klar i baggrunden på {seconds(p.readyMs)}</span>
                ) : (
                  "indlæses i baggrunden…"
                )}
              </span>
            );
          })}
        </p>
      )}

      {!overview ? (
        <div className="rounded-xl border-2 border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          Vælg et overbliksbillede (3D-tegning eller dronefoto) for at komme i gang.
        </div>
      ) : (
        <div className="relative select-none overflow-hidden rounded-xl bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={overview} alt="Overblik" className="block w-full" draggable={false} />
          <div className={`absolute inset-0 ${editing ? "cursor-crosshair" : ""}`} onClick={clickOverview}>
            {[...points.filter((p) => p.id !== draft?.id), ...(draft ? [draft] : [])].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (editing) {
                    setDraft(p);
                    setPicking(false);
                  } else openPoint(p);
                }}
                className="group absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
                title={p.name}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/85 shadow-lg ring-2 ring-white transition-transform group-hover:scale-110 sm:h-11 sm:w-11">
                  <span className="h-4 w-4 rounded-full border-[3px] border-white sm:h-5 sm:w-5" />
                </span>
                {p.name && (
                  <span className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-black/75 px-2 py-0.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                    {p.name}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {editing && overview && !draft && (
        <p className="text-sm text-slate-500">
          Klik på billedet for at sætte et punkt.{" "}
          For Matterport: indsæt et link fra den nuværende MPSkins-tour (tour, sted og synsretning findes automatisk), eller indsæt tourens link og vælg stedet direkte i touren.
        </p>
      )}

      {draft && (
        <div className="max-w-2xl space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Navn</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="fx Hallen"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                autoFocus
              />
            </label>
            <label className="text-sm">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Åbner</span>
              <select
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as Point["kind"], url: "", sweepId: undefined, rotation: undefined })}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"
              >
                <option value="matterport">Matterport-tour (sted)</option>
                <option value="pano">360°-billede (fx drone)</option>
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {draft.kind === "matterport" ? "U-link (tryk U i touren) - eller tourens link, og vælg så stedet" : "Link til 360°-billede"}
            </span>
            <input
              value={draft.url.startsWith("blob:") ? "(uploadet fil)" : draft.url}
              onChange={(e) => {
                setDraft({ ...draft, url: e.target.value, sweepId: undefined, rotation: undefined, modelId: undefined });
                setLinkStatus(null);
                resolveDraftLink(e.target.value);
              }}
              placeholder={draft.kind === "matterport" ? "https://my.matterport.com/show/?m=…" : "https://…/drone-360.jpg"}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>

          {draft.kind === "matterport" &&
            (linkStatus ? (
              <p className={`text-sm ${linkStatus.startsWith("✓") ? "text-emerald-700" : "text-slate-600"}`}>{linkStatus}</p>
            ) : (
              !draft.sweepId &&
              uLinkTarget(draft.url) && <p className="text-sm text-emerald-700">✓ U-link med scanpunkt nr. {uLinkTarget(draft.url)!.ss}.</p>
            ))}

          {draft.kind === "matterport" && sdkKey && draftModel && (
            <div className="space-y-2">
              {draft.sweepId && !picking ? (
                <p className="text-sm text-emerald-700">
                  ✓ Sted valgt.{" "}
                  <button type="button" onClick={() => setPicking(true)} className="font-medium text-indigo-600 hover:underline">
                    Vælg et andet
                  </button>
                </p>
              ) : picking ? (
                <PlacePicker
                  modelId={draftModel}
                  sdkKey={sdkKey}
                  onPick={(sweepId, rotation) => {
                    setDraft({ ...draft, sweepId, rotation });
                    setPicking(false);
                  }}
                />
              ) : (
                <button type="button" onClick={() => setPicking(true)} className="rounded-md border border-indigo-300 px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-50">
                  Vælg sted i touren
                </button>
              )}
            </div>
          )}

          {draft.kind === "pano" && (
            <label className="block text-sm text-slate-600">
              …eller upload et 360°-billede (equirectangular, 2:1):{" "}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setDraft({ ...draft, url: URL.createObjectURL(file), name: draft.name || file.name.replace(/\.[^.]+$/, "") });
                }}
              />
              <span className="block text-xs text-slate-400">Uploadede filer huskes kun, indtil siden genindlæses.</span>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={saveDraft} disabled={!draft.url.trim()} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
              Gem punkt
            </button>
            {points.some((p) => p.id === draft.id) && (
              <button
                type="button"
                onClick={() => {
                  setPoints((prev) => prev.filter((p) => p.id !== draft.id));
                  setDraft(null);
                }}
                className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-600"
              >
                Slet punkt
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setPicking(false);
              }}
              className="rounded-md px-3 py-2 text-sm text-slate-500"
            >
              Annullér
            </button>
          </div>
        </div>
      )}

      {/* The viewer. Kept mounted (just invisible) while the overview is shown,
          so the tours in it load in the background and are ready on click. */}
      <div className={`fixed inset-0 z-50 flex flex-col bg-black ${open ? "" : "pointer-events-none invisible"}`} aria-hidden={!open}>
        <div className="flex items-center gap-2 overflow-x-auto bg-black/90 px-3 py-2">
          <button type="button" onClick={closeViewer} className="shrink-0 rounded-full bg-white px-3 py-1.5 text-sm font-medium text-slate-900">
            ← Overblik
          </button>
          {points.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => openPoint(p)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${p.id === open?.id ? "bg-white/25 text-white" : "text-white/70 hover:text-white"}`}
            >
              {p.kind === "pano" ? "🚁 " : ""}
              {p.name}
            </button>
          ))}
          <span className="ml-auto shrink-0 pl-3 text-xs text-white/60">
            {open?.kind !== "matterport"
              ? ""
              : openPlayer?.error
                ? <span className="text-red-300">SDK ikke forbundet - touren indlæses forfra: {openPlayer.error}</span>
                : !sdkKey
                  ? "Uden SDK-nøgle - touren indlæses forfra"
                  : !viaSdk
                    ? "Punktet har intet sted - vælg det i touren eller brug et U-link"
                    : jumpError
                      ? <span className="text-red-300">{jumpError}</span>
                      : openPlayer?.readyMs == null
                        ? "Touren indlæses…"
                        : jumpMs != null
                          ? `Hoppet på ${seconds(jumpMs)}`
                          : ""}
          </span>
        </div>
        <div className="relative min-h-0 flex-1">
          {modelIds.map((m) => (
            <ModelPlayer key={m} modelId={m} sdkKey={sdkKey!} visible={Boolean(open && viaSdk && openModel === m)} onState={onPlayerState} />
          ))}
          {open && open.kind === "matterport" && !viaSdk && (
            <iframe key={open.id} src={fallbackEmbedUrl(open.url, openModel)} className="absolute inset-0 h-full w-full border-0" allow="xr-spatial-tracking; fullscreen" allowFullScreen />
          )}
          {open && open.kind === "pano" && (
            <div className="absolute inset-0">
              <Pano key={open.id} src={open.url} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
