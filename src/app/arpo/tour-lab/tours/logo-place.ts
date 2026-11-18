import type { TourConfig } from "./types";

/*
 * Where and how big the logo sits on the welcome - the same rules for
 * nextviewAI (lib/logo-fix.ts, when it builds a tour or changes the logo)
 * and the editor ("Ret logoet", a new logo uploaded).
 */

export type LogoFix = {
  tone: "dark" | "light" | null;
  trimmed: string | null;
  /** Width / height of what is seen of the logo (after trimming) - a square badge 1, a long word mark 4. */
  aspect?: number | null;
  /** The logo carries its own solid background (a badge) - no box of ours behind it. */
  ownBg?: boolean;
};

/**
 * The logo's height on the welcome tiles for a calm, even look whatever its
 * shape: about the same visible area every time - a square badge bigger, a
 * long word mark lower (it is wide enough as it is).
 */
export const tileLogoHeight = (aspect: number) => Math.round(Math.min(72, Math.max(34, Math.sqrt(4200 / Math.max(0.5, aspect)))));

/**
 * The welcome's logo put nicely: over the heading on the left (the text is
 * left-aligned - a centred logo over it looks off), at a height that suits
 * its shape, and no box of ours around a logo that has its own background.
 */
export function placeLogo(c: TourConfig, fix: LogoFix): TourConfig {
  const next: TourConfig = { ...c, logoAlignTiles: "left" };
  if (fix.aspect) {
    const h = tileLogoHeight(fix.aspect);
    next.logoSizeTiles = h === 56 ? undefined : h;
  }
  if (fix.ownBg) next.logoBgTiles = "none";
  return next;
}
