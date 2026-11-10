"use client";

import { useMemo, useState } from "react";
import { DENMARK_PATH, projectLatLon, spreadOverlappingPoints, MAP_WIDTH, MAP_HEIGHT } from "@/lib/denmark-map-projection";
import type { CustomerMapPoint } from "@/lib/customer-map-data";


export function DenmarkMap({ points }: { points: CustomerMapPoint[] }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Customers geocoded to the same (or a nearly identical) address would
  // otherwise draw as a single dot, hiding all but the topmost from view and
  // hover - spread those apart into a small circle around their shared spot.
  const positions = useMemo(() => {
    const projected = points.map((p) => ({ id: p.id, ...projectLatLon(p.lat, p.lon) }));
    return spreadOverlappingPoints(projected);
  }, [points]);

  const hovered = points.find((p) => p.id === hoveredId) ?? null;
  const hoveredPos = hoveredId ? positions.get(hoveredId) : null;

  return (
    <div className="relative mx-auto w-full max-w-xs">
      <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} className="w-full">
        <path d={DENMARK_PATH} className="fill-blue-100 stroke-blue-300" strokeWidth={1} />
        {points.map((p) => {
          const pos = positions.get(p.id);
          if (!pos) return null;
          return (
            <circle
              key={p.id}
              cx={pos.x}
              cy={pos.y}
              r={hoveredId === p.id ? 5 : 3.5}
              className="cursor-pointer fill-emerald-600 stroke-white transition-all"
              strokeWidth={1}
              onMouseEnter={() => setHoveredId(p.id)}
              onMouseLeave={() => setHoveredId((cur) => (cur === p.id ? null : cur))}
            />
          );
        })}
      </svg>
      {hovered && hoveredPos && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-lg"
          style={{
            left: `${(hoveredPos.x / MAP_WIDTH) * 100}%`,
            top: `${(hoveredPos.y / MAP_HEIGHT) * 100}%`,
            marginTop: "-6px",
          }}
        >
          {hovered.name}
        </div>
      )}
    </div>
  );
}
