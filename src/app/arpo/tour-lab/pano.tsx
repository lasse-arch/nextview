"use client";

import { useEffect, useRef } from "react";
import { Viewer } from "@photo-sphere-viewer/core";
import "@photo-sphere-viewer/core/index.css";

/** A 360° (equirectangular) photo, e.g. from the drone, that you can drag around in. */
export function Pano({ src }: { src: string }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Created a tick later: a mount that's immediately undone (React's dev
    // double-mount) would otherwise abort the image download, and the
    // viewer's file cache then hands the next viewer that aborted load.
    let viewer: Viewer | null = null;
    const timer = setTimeout(() => {
      if (!container.current) return;
      viewer = new Viewer({
        container: container.current,
        panorama: src,
        navbar: ["zoom", "move", "fullscreen"],
        defaultZoomLvl: 30,
        touchmoveTwoFingers: false,
        loadingTxt: "Indlæser…",
        lang: { loadError: "Kunne ikke indlæse 360°-billedet." },
      });
    });
    return () => {
      clearTimeout(timer);
      viewer?.destroy();
    };
  }, [src]);
  return <div ref={container} className="h-full w-full" />;
}
