/**
 * Mercator projection fitted to a 400x480 viewBox covering Denmark
 * (including Bornholm), matching the DENMARK_PATH in denmark-map.tsx -
 * both were generated together from the same d3-geo projection, so a
 * lat/lon projected here lines up with the coastline in that path.
 */
const SCALE = 3103.041230689392;
const TRANSLATE_X = -429.75885069266087;
const TRANSLATE_Y = 3938.081685464471;

export const MAP_WIDTH = 400;
export const MAP_HEIGHT = 480;

export function projectLatLon(lat: number, lon: number): { x: number; y: number } {
  const lambda = (lon * Math.PI) / 180;
  const phi = (lat * Math.PI) / 180;
  const rawY = Math.log(Math.tan(Math.PI / 4 + phi / 2));

  return {
    x: TRANSLATE_X + SCALE * lambda,
    y: TRANSLATE_Y - SCALE * rawY,
  };
}

/**
 * Nudges apart points whose projected positions are close enough to visibly
 * overlap (e.g. several customers geocoded to the same building or town
 * centre) - each such cluster is arranged in a small circle around its
 * shared spot instead of drawing one dot directly on top of another, which
 * hid all but the topmost from both view and hover. Points far enough apart
 * to already read as distinct dots are left untouched.
 */
export function spreadOverlappingPoints<T extends { id: string; x: number; y: number }>(
  points: T[],
  clusterRadius = 7
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  const visited = new Set<string>();

  for (const point of points) {
    if (visited.has(point.id)) continue;

    const cluster = points.filter(
      (other) => !visited.has(other.id) && Math.hypot(other.x - point.x, other.y - point.y) <= clusterRadius
    );
    cluster.forEach((p) => visited.add(p.id));

    if (cluster.length === 1) {
      result.set(point.id, { x: point.x, y: point.y });
      continue;
    }

    const centerX = cluster.reduce((sum, p) => sum + p.x, 0) / cluster.length;
    const centerY = cluster.reduce((sum, p) => sum + p.y, 0) / cluster.length;
    const spreadRadius = 5 + cluster.length;
    cluster.forEach((p, i) => {
      const angle = (2 * Math.PI * i) / cluster.length - Math.PI / 2;
      result.set(p.id, {
        x: centerX + spreadRadius * Math.cos(angle),
        y: centerY + spreadRadius * Math.sin(angle),
      });
    });
  }

  return result;
}
