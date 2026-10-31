"use client";

import { useEffect, useRef, useState } from "react";
import type { MpSdk, Vec3 } from "../matterport";
import { useT } from "../tours/i18n-react";
import { inFront } from "./info";

export type RouteGraph = Record<string, { n: string[]; p: [number, number, number] }>;
export type Destination = { name: string; group?: string; href: string };

/**
 * The network to find the way in: the model's own (from the server) joined
 * with the viewer's scan points - every scan point, also those hidden in the
 * tour or switched off in Matterport, so the way goes through the rooms
 * (hidden scans are opened while the route passes them) instead of a long
 * jump that can cut through a wall. In the viewer's coordinates (heights as
 * the third number), where the viewer knows the point.
 */
export function routeNetwork(server: RouteGraph | null, sweeps: Record<string, { position?: { x: number; y: number; z: number }; neighbors?: string[] }>): RouteGraph | null {
  const out: RouteGraph = {};
  for (const [id, s] of Object.entries(sweeps)) {
    if (!s.position) continue;
    out[id] = { n: [...new Set([...(s.neighbors ?? []), ...(server?.[id]?.n ?? [])])], p: [s.position.x, s.position.z, s.position.y] };
  }
  if (!Object.keys(out).length) return server;
  // Neighbours both ways, and only points we know where are.
  for (const [id, node] of Object.entries(out)) {
    node.n = node.n.filter((nb) => out[nb] && nb !== id);
    for (const nb of node.n) if (!out[nb].n.includes(id)) out[nb].n.push(id);
  }
  return out;
}

/** The walk between two scan points (Dijkstra over the model's scan-point network, in short steps). */
export function shortestPath(graph: RouteGraph, from: string, to: string): string[] | null {
  if (!graph[from] || !graph[to]) return null;
  const dist: Record<string, number> = { [from]: 0 };
  const prev: Record<string, string> = {};
  const open = new Set([from]);
  const d = (a: string, b: string) => Math.hypot(graph[a].p[0] - graph[b].p[0], graph[a].p[1] - graph[b].p[1], (graph[a].p[2] - graph[b].p[2]) * 3);
  while (open.size) {
    let cur = "";
    for (const id of open) if (!cur || dist[id] < dist[cur]) cur = id;
    open.delete(cur);
    if (cur === to) break;
    for (const nb of graph[cur].n) {
      if (!graph[nb]) continue;
      // Long jumps cost extra (distance^1.6): the route takes the short steps you'd walk, not a 25 m leap.
      const alt = dist[cur] + d(cur, nb) ** 1.6;
      if (dist[nb] == null || alt < dist[nb]) {
        dist[nb] = alt;
        prev[nb] = cur;
        open.add(nb);
      }
    }
  }
  if (dist[to] == null) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(prev[path[0]]);
  return path;
}

const flat = (graph: RouteGraph, a: string, b: string) => Math.hypot(graph[a].p[0] - graph[b].p[0], graph[a].p[1] - graph[b].p[1]);

/**
 * Fewer, longer flights: from each stop, fly straight to the furthest later
 * point on the route that can be seen from it (a neighbour in the network),
 * as long as the route in between stays close to that straight line - so it
 * glides down a corridor and only stops at the corners.
 */
export function straighten(graph: RouteGraph, path: string[], maxM = 30): string[] {
  const out = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let j = i + 1;
    for (let k = path.length - 1; k > i + 1; k--) {
      const a = graph[path[i]].p;
      const b = graph[path[k]].p;
      // One long glide instead of a hop per scan point (that stop-and-go is what makes it feel like a robot): any
      // later point on the way will do - not only one Matterport counts as a neighbour - as long as every scan point
      // between lies on the straight line (they're on the walked way, so the glide can't cut through a wall), and it's level.
      if (flat(graph, path[i], path[k]) > maxM || Math.abs(a[2] - b[2]) > 0.5) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const off = path.slice(i + 1, k).every((m) => {
        const c = graph[m].p;
        // Close to the straight line (a glide that bends around a door frame would cut through the wall).
        return Math.abs((b[0] - a[0]) * (a[1] - c[1]) - (a[0] - c[0]) * (b[1] - a[1])) / len < 0.6;
      });
      if (off) {
        j = k;
        break;
      }
    }
    out.push(path[j]);
    i = j;
  }
  return out;
}

/** How long a flight takes: a steady walking-glide pace, never a jerk or a crawl. */
export function flightMs(graph: RouteGraph, a: string, b: string) {
  // A calm walking-glide pace (about 5 m a second) - a long stretch gets the time it needs, not a rush.
  return Math.round(Math.min(4500, Math.max(800, (flat(graph, a, b) / 5) * 1000)));
}

/**
 * The route drawn on the floor over the tour: a glowing line from where the
 * visitor stands to where they're going, following the camera as it moves.
 */
export function RouteLine({ sdk, points, frame }: { sdk: MpSdk | null; points: Vec3[]; frame: React.RefObject<HTMLIFrameElement | null> }) {
  const path = useRef<SVGPathElement>(null);
  const glow = useRef<SVGPathElement>(null);
  useEffect(() => {
    if (!sdk?.Conversion || points.length < 2) return;
    const conv = sdk.Conversion;
    // Every leg cut into short pieces, so the parts behind the camera can be left out.
    const dense: Vec3[] = [];
    points.forEach((p, i) => {
      if (i === 0) return dense.push(p);
      const a = points[i - 1];
      for (let t = 1; t <= 12; t++) dense.push({ x: a.x + ((p.x - a.x) * t) / 12, y: a.y + ((p.y - a.y) * t) / 12, z: a.z + ((p.z - a.z) * t) / 12 });
    });
    const sub = sdk.Camera.pose.subscribe((pose) => {
      const el = frame.current;
      if (!el) return;
      const size = { w: el.clientWidth, h: el.clientHeight };
      let d = "";
      let pen = false;
      for (const p of dense) {
        if (!inFront(pose, p)) {
          pen = false;
          continue;
        }
        const s = conv.worldToScreen(p, pose, size);
        d += `${pen ? "L" : "M"}${s.x.toFixed(1)},${s.y.toFixed(1)}`;
        pen = true;
      }
      path.current?.setAttribute("d", d);
      glow.current?.setAttribute("d", d);
    });
    return () => sub.cancel();
  }, [sdk, points, frame]);
  return (
    <svg className="rt-line" aria-hidden>
      <path ref={glow} className="rt-line-glow" />
      <path ref={path} className="rt-line-dash" />
    </svg>
  );
}

/** "Find vej": pick where to go - a room from the menu, or a box number - and the tour walks you there. */
export function RouteSheet({
  destinations,
  boxes,
  onGo,
  onClose,
}: {
  destinations: Destination[];
  boxes?: Record<string, string>;
  onGo: (d: Destination) => void;
  onClose: () => void;
}) {
  const tr = useT();
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const box = query.replace(/^(box|boks|rum|nr\.?)\s*/, "");
  const boxHit = boxes && box && boxes[box] ? [{ name: `Box ${box}`, group: "Boks", href: boxes[box] }] : [];
  const list = [...boxHit, ...destinations.filter((d) => !query || `${d.group ?? ""} ${d.name}`.toLowerCase().includes(query))];
  const groups = [...new Set(list.map((d) => d.group ?? ""))];
  return (
    <div className="rt-sheet">
      <div className="rt-head">
        <b>{tr("Find vej")}</b>
        <button type="button" aria-label={tr("Luk")} onClick={onClose}>
          ×
        </button>
      </div>
      <p className="rt-lead">{tr("Vælg hvor du skal hen - så går touren vejen derhen fra der, hvor du står.")}</p>
      {/* Focused at once only with a mouse: on a phone the keyboard would cover the list - it comes when they tap the field. */}
      <input ref={(el) => void (el && matchMedia("(pointer: fine)").matches && !el.dataset.focused && ((el.dataset.focused = "1"), el.focus()))} value={q} onChange={(e) => setQ(e.target.value)} placeholder={boxes ? tr("Søg rum eller boksnummer…") : tr("Søg…")} />
      <div className="rt-list">
        {groups.map((g) => (
          <div key={g}>
            {g && <h4>{g}</h4>}
            {list
              .filter((d) => (d.group ?? "") === g)
              .map((d) => (
                <button key={d.group + d.name + d.href} type="button" onClick={() => onGo(d)}>
                  {d.name} <span>→</span>
                </button>
              ))}
          </div>
        ))}
        {!list.length && <p className="rt-none">{boxes ? tr("Ingen fundet - prøv et boksnummer, fx 160.") : tr("Ingen fundet.")}</p>}
      </div>
    </div>
  );
}

/** While walking, and on arrival. */
export function RouteStatus({
  dest,
  step,
  steps,
  arrived,
  paused = false,
  cta,
  onStop,
  onResume,
  onClose,
  onCta,
}: {
  dest: Destination;
  step: number;
  steps: number;
  arrived: boolean;
  /** Stopped on the way: "Fortsæt" walks on from where they stand. */
  paused?: boolean;
  cta?: { label: string; href: string };
  onStop: () => void;
  onResume: () => void;
  onClose: () => void;
  onCta: () => void;
}) {
  const tr = useT();
  return (
    <div className={`rt-status ${arrived ? "fremme" : ""}`}>
      <button type="button" className="rt-x" aria-label={tr("Luk")} onClick={onClose}>
        ×
      </button>
      <div className="rt-kick">{arrived ? tr("Du er fremme") : paused ? tr("Stoppet") : tr("På vej: {n} af {m}", { n: Math.min(step, steps), m: steps })}</div>
      <b>{dest.group ? `${dest.group}: ${dest.name}` : dest.name}</b>
      {!arrived && (
        <div className="rt-bar">
          <i style={{ width: `${(Math.min(step, steps) / Math.max(steps, 1)) * 100}%` }} />
        </div>
      )}
      <div className="rt-btns">
        {arrived && cta && (
          <a className="rt-cta" href={cta.href} target="_blank" rel="noopener" onClick={onCta}>
            {cta.label}
          </a>
        )}
        {arrived ? (
          <button type="button" onClick={onClose}>
            {tr("Luk")}
          </button>
        ) : paused ? (
          <button type="button" className="rt-fortsaet" onClick={onResume}>
            ▶ {tr("Fortsæt")}
          </button>
        ) : (
          <button type="button" onClick={onStop}>
            {tr("Stop")}
          </button>
        )}
      </div>
    </div>
  );
}

export const ROUTE_CSS = `
.rt-knap{position:absolute;top:calc(14px + env(safe-area-inset-top,0px));left:50%;translate:-50% 0;z-index:7;display:flex;align-items:center;gap:8px;border:0;border-radius:999px;padding:10px 18px;background:var(--c-accent);color:#fff;font:inherit;font-weight:800;font-size:14px;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.25)}
.rt-knap svg{width:18px;height:18px}
.rt-sheet{position:absolute;top:calc(66px + env(safe-area-inset-top,0px));left:50%;translate:-50% 0;z-index:12;width:min(420px,calc(100% - 24px));max-height:calc(100% - 90px);display:flex;flex-direction:column;background:#fff;color:#1d2a30;border-radius:18px;box-shadow:0 16px 44px rgba(0,0,0,.35);padding:16px 16px 10px;animation:hvUp .3s cubic-bezier(.2,.7,.2,1) both}
.rt-head{display:flex;justify-content:space-between;align-items:center}
.rt-head b{font-size:20px;font-weight:900;color:var(--c-main)}
.rt-head button{width:34px;height:34px;border:0;border-radius:50%;background:#f1f2f3;font-size:20px;cursor:pointer}
.rt-lead{margin:4px 0 10px;font-size:13.5px;color:#56636a}
.rt-sheet input{border:1.5px solid #dfe3e5;border-radius:12px;padding:10px 14px;font:inherit;font-size:15px;outline:none}
.rt-sheet input:focus{border-color:var(--c-accent)}
.rt-list{overflow-y:auto;margin-top:8px}
.rt-list h4{margin:12px 4px 4px;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--c-accent)}
.rt-list button{display:flex;justify-content:space-between;width:100%;border:0;background:none;padding:10px 6px;border-radius:10px;font:inherit;font-size:15px;font-weight:700;color:#1d2a30;cursor:pointer;text-align:left}
.rt-list button:hover{background:#f4f6f7}
.rt-list button span{color:var(--c-accent)}
.rt-none{font-size:14px;color:#56636a;padding:6px}
.rt-status{position:absolute;left:50%;bottom:calc(22px + env(safe-area-inset-bottom,0px));translate:-50% 0;z-index:11;width:min(420px,calc(100% - 24px));background:#fff;color:#1d2a30;border-radius:18px;box-shadow:0 16px 44px rgba(0,0,0,.35);padding:14px 16px;animation:hvUp .3s ease both}
.rt-kick{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--c-accent)}
.rt-status b{display:block;margin:3px 0 8px;font-size:17px;color:var(--c-main)}
.rt-bar{height:5px;border-radius:3px;background:#eef1f2;overflow:hidden;margin-bottom:10px}
.rt-bar i{display:block;height:100%;background:var(--c-accent);transition:width .5s ease}
.rt-btns{display:flex;gap:8px;justify-content:flex-end}
.rt-btns button,.rt-cta{border:0;border-radius:999px;padding:9px 16px;font:inherit;font-weight:800;font-size:14px;cursor:pointer;background:#eef1f2;color:#1d2a30;text-decoration:none}
.rt-cta{background:var(--c-accent);color:#fff;margin-right:auto}
.rt-status.fremme{border:2px solid var(--c-accent)}

.rt-x{position:absolute;top:8px;right:8px;width:28px;height:28px;border:0;border-radius:50%;background:#eef1f2;color:#1d2a30;font-size:17px;line-height:28px;cursor:pointer}
.rt-kick{padding-right:30px}
.rt-btns .rt-fortsaet{background:var(--c-accent);color:#fff}
.hv-routing .hv-room,.hv-routing .hv-stories{display:none}
.hv-guiding .rt-knap{display:none}
/* While the stories play, their bar has the top and the bottom: Find vej waits (never two things on top of each other). */
.hv:has(.hv-story-play) .rt-knap{display:none}
/* Where the button stands - chosen per device in the editor. "Kun i menuen": the menu's Find vej button shows on that device only. */
.hv-find-knap{display:none!important}
@media (min-width:761px){.rt-d-menu .hv-find-knap{display:flex!important}}
@media (max-width:760px){.rt-m-menu .hv-find-knap{display:flex!important}}
@media (min-width:761px){
  .rt-d-menu .rt-knap{display:none}
  .rt-d-bottom-left .rt-knap,.rt-d-bottom-right .rt-knap{top:auto;bottom:calc(18px + env(safe-area-inset-bottom,0px));translate:none}
  .rt-d-bottom-left .rt-knap{left:18px;right:auto}
  .rt-d-bottom-right .rt-knap{left:auto;right:18px}
  .hv-st-on-d.rt-d-bottom-left .rt-knap,.hv-st-on-d.rt-d-bottom-right .rt-knap{bottom:calc(var(--st-h,148px) + 10px)}
  /* Under the menu button (live data, if any, steps down below it) - or under live data (under the menu button when there is none). */
  .rt-d-under-menu .rt-knap,.rt-d-under-live .rt-knap{top:calc(68px + env(safe-area-inset-top,0px));left:auto;right:16px;translate:none;padding:8px 15px;font-size:13.5px}
  .rt-d-under-menu .hv-live-chip{top:calc(118px + env(safe-area-inset-top,0px))}
  .hv:has(.hv-live-chip).rt-d-under-live .rt-knap{top:calc(124px + env(safe-area-inset-top,0px))}
}
@media (max-width:760px){
  .rt-m-menu .rt-knap{display:none}
  .hv.rt-m-top .rt-knap{top:calc(64px + env(safe-area-inset-top,0px));bottom:auto;left:50%;right:auto;translate:-50% 0}
  .hv.rt-m-bottom-left.hv-i-tour .rt-knap{left:12px;right:auto}
  .hv.rt-m-bottom-right.hv-i-tour .rt-knap{left:auto;right:12px}
  .hv.rt-m-under-menu .rt-knap,.hv.rt-m-under-live .rt-knap{top:calc(60px + env(safe-area-inset-top,0px));bottom:auto;left:auto;right:10px;translate:none;height:38px;padding:0 13px;font-size:13px}
  .hv.rt-m-under-menu .hv-live-chip{top:calc(106px + env(safe-area-inset-top,0px))}
  .hv.rt-m-under-live:has(.hv-live-chip) .rt-knap{top:calc(108px + env(safe-area-inset-top,0px))}
}
.rt-line{position:absolute;inset:0;width:100%;height:100%;z-index:4;pointer-events:none;overflow:visible}
.rt-line path{fill:none;stroke-linecap:round;stroke-linejoin:round}
.rt-line-glow{stroke:var(--c-accent);stroke-width:16;opacity:.28;filter:blur(3px)}
.rt-line-dash{stroke:#fff;stroke-width:5;stroke-dasharray:2 16;animation:rtFlow .9s linear infinite}
@keyframes rtFlow{to{stroke-dashoffset:-18}}
@media (max-width:760px){
  .rt-knap{top:auto;bottom:calc(14px + env(safe-area-inset-bottom,0px));left:12px;translate:none;padding:11px 16px}
  /* Inside the tour "Tilbage til luften" has the bottom left: Find vej goes to the bottom right. */
  .hv-i-tour .rt-knap{left:auto;right:12px}
  /* Side by side with "Tilbage til luften": the same height and line. */
  .hv-i-tour .rt-knap,.hv-i-tour .hv-luften{bottom:calc(16px + env(safe-area-inset-bottom,0px));height:44px;padding:0 16px;font-size:14px;box-sizing:border-box}
  .rt-sheet{top:auto;bottom:0;left:0;right:0;width:auto;translate:none;max-height:80%;border-radius:18px 18px 0 0;padding-bottom:calc(10px + env(safe-area-inset-bottom,0px))}
  .rt-status{bottom:calc(10px + env(safe-area-inset-bottom,0px))}
}
`;
