/*
 * Which text colour can be read on a colour - so a tour can use the site's
 * own button colour as it is (a light gold button gets dark text, as on the
 * site) instead of white text nobody can read.
 */

const rgb = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lum = (c: [number, number, number]) => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast between two colours (1-21). */
export function contrast(a: string, b: string): number {
  const x = rgb(a);
  const y = rgb(b);
  if (!x || !y) return 21;
  const [l1, l2] = [lum(x), lum(y)].sort((p, q) => q - p);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** The text on a button of colour `bg`: white - unless white is hard to read and a dark colour (the tour's own, if it reads) is better. */
export function textOn(bg: string, dark = "#1d1d1f"): string {
  const white = contrast(bg, "#ffffff");
  if (white >= 3) return "#fff";
  const own = contrast(bg, dark) >= 4.5 ? dark : "#1d1d1f";
  return contrast(bg, own) > white ? own : "#fff";
}

/** A colour made darker by `by` (0-1) - the accent's hover. */
export function darker(hex: string, by = 0.18): string {
  const c = rgb(hex);
  if (!c) return hex;
  return `#${c.map((v) => Math.round(v * (1 - by)).toString(16).padStart(2, "0")).join("")}`;
}
