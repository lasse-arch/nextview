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
