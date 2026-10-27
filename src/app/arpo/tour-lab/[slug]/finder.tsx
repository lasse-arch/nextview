"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "../tours/i18n-react";
import type { TourConfig, TourPoint } from "../tours/types";

/*
 * "Find din plads" and the walking times on the drone scene / map.
 *
 * The finder asks its questions one at a time; every answer points at the
 * places that fit it, and the place most answers point at wins (ties: the one
 * the first answers liked). The tour then flies there and opens its card.
 *
 * The walk lines join the open point to the places it lists walking times
 * to - drawn over the picture each frame from where the points stand on screen.
 */

type Finder = NonNullable<TourConfig["finder"]>;

/** The places in the order the answers fit them (best first) - only places some answer points at. */
export function rankPlaces(finder: Finder, answers: number[], points: TourPoint[]): TourPoint[] {
  const score = new Map<string, number>();
  answers.forEach((a, qi) => {
    const option = finder.questions[qi]?.options[a];
    // Earlier questions weigh a little more, so a tie goes to what matters first.
    option?.points.forEach((id) => score.set(id, (score.get(id) ?? 0) + 1 + (finder.questions.length - qi) * 0.01));
  });
  return points.filter((p) => score.has(p.id)).sort((a, b) => score.get(b.id)! - score.get(a.id)!);
}

export function FinderSheet({ finder, points, onDone, onClose }: { finder: Finder; points: TourPoint[]; onDone: (best: TourPoint, others: TourPoint[]) => void; onClose: () => void }) {
  const tr = useT();
  const [answers, setAnswers] = useState<number[]>([]);
  const at = answers.length;
  const q = finder.questions[at];

  function answer(i: number) {
    const next = [...answers, i];
    if (next.length < finder.questions.length) return setAnswers(next);
    const ranked = rankPlaces(finder, next, points);
    if (ranked.length) onDone(ranked[0], ranked.slice(1, 3));
    else setAnswers(next);
  }

  return (
    <div className="fd" role="dialog" aria-label={tr(finder.title)}>
      <div className="fd-kort">
        <button type="button" className="fd-luk" aria-label={tr("Luk")} onClick={onClose}>
          ×
        </button>
        <div className="fd-trin" aria-hidden>
          {finder.questions.map((_, i) => (
            <i key={i} className={i < at ? "fd-gjort" : i === at ? "fd-nu" : ""} />
          ))}
        </div>
        {at === 0 && <h3>{tr(finder.title)}</h3>}
        {at === 0 && finder.lead && <p className="fd-lead">{tr(finder.lead)}</p>}
        {q ? (
          <>
            <div className="fd-q">{tr(q.q)}</div>
            <div className="fd-svar">
              {q.options.map((o, i) => (
                <button key={o.label} type="button" onClick={() => answer(i)}>
                  {tr(o.label)}
                </button>
              ))}
            </div>
            {at > 0 && (
              <button type="button" className="fd-tilbage" onClick={() => setAnswers(answers.slice(0, -1))}>
                ← {tr("Tilbage")}
              </button>
            )}
          </>
        ) : (
          <>
            <p className="fd-lead">{tr("Vi fandt ikke et sted, der passer til jeres svar.")}</p>
            <button type="button" className="fd-tilbage" onClick={() => setAnswers([])}>
              {tr("Prøv igen")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** The centre of a point's icon on screen, relative to `box` - null when it isn't shown (behind, hidden by a filter). */
function pointCentre(id: string, box: DOMRect): { x: number; y: number } | null {
  const el = document.querySelector<HTMLElement>(`[data-punkt="${CSS.escape(id)}"]`);
  if (!el || el.classList.contains("hv-skjult") || el.style.visibility === "hidden" || el.style.display === "none") return null;
  const r = (el.querySelector(".hv-ikon") ?? el).getBoundingClientRect();
  if (!r.width) return null;
  return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top };
}

/** Dashed lines from the open point to the places it has walking times to, each with its minutes. */
export function WalkLines({ from, walks, names }: { from: string; walks: { to: string; minutes: number }[]; names: Record<string, string> }) {
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const el = svg.current;
      if (el) {
        const box = el.getBoundingClientRect();
        const a = pointCentre(from, box);
        el.querySelectorAll<SVGGElement>("g[data-til]").forEach((g) => {
          const b = pointCentre(g.dataset.til!, box);
          const line = g.querySelector("line")!;
          const label = g.querySelector<SVGGElement>("g")!;
          if (!a || !b) return void (g.style.display = "none");
          g.style.display = "";
          line.setAttribute("x1", String(a.x));
          line.setAttribute("y1", String(a.y));
          line.setAttribute("x2", String(b.x));
          line.setAttribute("y2", String(b.y));
          label.setAttribute("transform", `translate(${(a.x + b.x) / 2} ${(a.y + b.y) / 2})`);
        });
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [from]);
  return (
    <svg ref={svg} className="gl" aria-hidden>
      {walks
        .filter((w) => names[w.to])
        .map((w) => (
          <g key={w.to} data-til={w.to} style={{ display: "none" }}>
            <line />
            <g>
              <rect x={-30} y={-12} width={60} height={24} rx={12} />
              <text textAnchor="middle" dy="4.5">
                {w.minutes} min
              </text>
            </g>
          </g>
        ))}
    </svg>
  );
}

export const FINDER_CSS = `
.fd{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;background:rgba(8,14,16,.35);animation:hvFade .2s ease}
.fd-kort{position:relative;width:min(420px,calc(100% - 32px));background:#fff;color:#1d2a30;border-radius:20px;padding:22px 20px 18px;box-shadow:0 20px 50px rgba(0,0,0,.35)}
.fd-luk{position:absolute;top:10px;right:12px;width:32px;height:32px;border:0;border-radius:50%;background:#f1f3f4;color:#5c6b72;font-size:20px;line-height:1;cursor:pointer}
.fd-trin{display:flex;gap:5px;margin-bottom:14px}
.fd-trin i{height:4px;flex:1;max-width:44px;border-radius:2px;background:#e3e8ea}
.fd-trin .fd-gjort,.fd-trin .fd-nu{background:var(--c-main)}
.fd-trin .fd-nu{opacity:.45}
.fd h3{margin:0 40px 4px 0;font-family:var(--font-heading);font-size:22px;color:var(--c-main)}
.fd-lead{margin:0 0 12px;font-size:14px;color:#5c6b72;line-height:1.45}
.fd-q{font-size:17px;font-weight:800;margin:6px 0 12px}
.fd-svar{display:grid;gap:8px}
.fd-svar button{padding:13px 16px;border:1.5px solid #e3e8ea;border-radius:14px;background:#fff;color:#1d2a30;font:inherit;font-size:15px;font-weight:700;text-align:left;cursor:pointer;transition:border-color .15s,background .15s}
.fd-svar button:hover{border-color:var(--c-main);background:#f6f8f9}
.fd-tilbage{margin-top:12px;border:0;background:none;color:#5c6b72;font:inherit;font-size:13px;font-weight:600;cursor:pointer;padding:4px 0}
@media (max-width:760px){.fd{align-items:flex-end}.fd-kort{width:100%;border-radius:20px 20px 0 0;padding-bottom:calc(18px + env(safe-area-inset-bottom,0px))}}
.gl{position:absolute;inset:0;width:100%;height:100%;z-index:4;pointer-events:none;overflow:visible}
.gl line{stroke:#fff;stroke-width:3;stroke-dasharray:2 7;stroke-linecap:round;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))}
.gl rect{fill:#fff;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35))}
.gl text{font-size:12px;font-weight:800;fill:#1d2a30}
.hv-gaa{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 12px}
.hv-gaa button{display:flex;align-items:center;gap:5px;padding:5px 10px;border:0;border-radius:999px;background:#eef2f3;color:#1d2a30;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}
.hv-gaa button:hover{background:#e1e8ea}
.hv-gaa svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.hv-bedst{display:inline-flex;align-items:center;gap:6px;margin-bottom:6px;padding:4px 10px;border-radius:999px;background:var(--c-accent);color:#fff;font-size:12px;font-weight:800}
.hv-andre{margin:-2px 0 12px;font-size:13px;color:#5c6b72}
.hv-andre button{border:0;background:none;padding:0;color:var(--c-main);font:inherit;font-weight:700;text-decoration:underline;cursor:pointer}
.hv-intro .hv-find{margin-top:8px;width:100%}
.hv-find-m{display:none}
@media (max-width:760px){
  .hv-intro .hv-find{display:none}
  .hv-find-m{position:absolute;left:10px;bottom:calc(64px + env(safe-area-inset-bottom,0px));z-index:6;display:flex;align-items:center;gap:7px;height:36px;padding:0 14px 0 11px;border:0;border-radius:999px;background:var(--c-accent);color:#fff;font:inherit;font-size:13.5px;font-weight:800;box-shadow:0 6px 20px rgba(0,0,0,.25);cursor:pointer}
  .hv-find-m svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round}
  .hv-filter-ud-m .hv-find-m{bottom:calc(10px + env(safe-area-inset-bottom,0px))}
}
.hv-punkt .hv-find-m,.hv-welcome .hv-find-m,.hv-menu-aaben .hv-find-m{opacity:0;pointer-events:none}
`;
