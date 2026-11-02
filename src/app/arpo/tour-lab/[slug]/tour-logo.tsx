"use client";

import { useState } from "react";
import type { TourConfig } from "../tours/types";

/*
 * The tour's logo everywhere in the tour. A logo that can't be fetched (an
 * address on the customer's own site that has moved or gone) never shows as
 * a broken picture: the place's name stands there instead, in the logo's
 * spot. The editor's "Tjek touren" and "Gem alle filer hos os" are how it's
 * put right for good.
 */
export function TourLogo({ T, className, alt }: { T: Pick<TourConfig, "logo" | "brand" | "title">; className?: string; alt?: string }) {
  const [broken, setBroken] = useState(false);
  const name = T.brand || T.title;
  if (!T.logo || broken)
    return name ? (
      <span className={`hv-logo-navn ${className ?? ""}`} role="img" aria-label={name}>
        {name}
      </span>
    ) : null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={T.logo}
      alt={alt ?? name}
      className={className}
      onError={() => setBroken(true)}
      // It may have failed before the page was ready to listen (the server sent it in the page).
      ref={(img) => {
        if (img && img.complete && img.naturalWidth === 0) queueMicrotask(() => setBroken(true));
      }}
    />
  );
}

export const TOUR_LOGO_CSS = `
.hv-logo-navn{display:inline-flex;align-items:center;justify-content:center;max-width:100%;font-weight:800;font-size:17px;line-height:1.15;letter-spacing:.01em;color:inherit;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`;
