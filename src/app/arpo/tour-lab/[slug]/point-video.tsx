"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../tours/i18n-react";

/**
 * A point's video at the top of its card: plays at once without sound, in a
 * loop (like a photo that moves) - a tap turns the sound on and starts it
 * over, another tap pauses. No browser controls: they cover the picture.
 */
export function PointVideo({ video, name }: { video: { src: string; poster?: string }; name: string }) {
  const tr = useT();
  const ref = useRef<HTMLVideoElement>(null);
  const [sound, setSound] = useState(false);
  const [paused, setPaused] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  /** Full screen: the same film, big, with sound and the player's own controls - from where it had got to. */
  const [full, setFull] = useState<number | null>(null);
  /** Sound switched off again (after "Tryk for lyd") - the film plays on, silently. */
  const [muted, setMuted] = useState(false);
  return (
    <>
      <div
        className="hv-pvideo"
        role="button"
        aria-label={sound ? tr("Pause") : tr("Tryk for lyd")}
        onClick={() => {
          const v = ref.current;
          if (!v) return;
          if (!sound) {
            v.muted = false;
            v.currentTime = 0;
            v.play().catch(() => {});
            setSound(true);
            setPaused(false);
          } else if (v.paused) {
            v.play().catch(() => {});
            setPaused(false);
          } else {
            v.pause();
            setPaused(true);
          }
        }}
      >
        <video
          ref={ref}
          src={video.src}
          poster={video.poster}
          autoPlay
          muted
          loop={!sound}
          playsInline
          preload="metadata"
          aria-label={name}
          onTimeUpdate={(e) => setLeft(Math.max(0, Math.round(e.currentTarget.duration - e.currentTarget.currentTime)) || null)}
          onEnded={() => setPaused(true)}
        />
        <button
          type="button"
          className="hv-pvideo-fuld"
          aria-label={tr("Fuld skærm")}
          onClick={(e) => {
            e.stopPropagation();
            const v = ref.current;
            // From the start when it was only playing silently in a loop, else from where they are.
            setFull(v && sound ? v.currentTime : 0);
            v?.pause();
            setPaused(true);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
          </svg>
        </button>
        {sound && (
          <button
            type="button"
            className="hv-pvideo-fuld hv-pvideo-lyd"
            aria-label={muted ? tr("Tænd for lyden") : tr("Sluk for lyden")}
            onClick={(e) => {
              e.stopPropagation();
              const v = ref.current;
              if (!v) return;
              v.muted = !muted;
              setMuted(!muted);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M4 9v6h4l5 4V5L8 9z" />
              {muted ? <path d="M16 9l5 6M21 9l-5 6" /> : <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />}
            </svg>
          </button>
        )}
        <span className="hv-pvideo-knap">
          {!sound ? `🔇 ${tr("Tryk for lyd")}` : paused ? `▶ ${tr("Afspil")}` : `❚❚${left != null ? ` ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : ""}`}
        </span>
      </div>
      {full != null &&
        createPortal(
          <div className="hv-videofuld" role="dialog" aria-label={name} onClick={() => setFull(null)}>
            <video
              src={video.src}
              poster={video.poster}
              autoPlay
              controls
              playsInline
              onClick={(e) => e.stopPropagation()}
              onLoadedMetadata={(e) => {
                if (full > 0) e.currentTarget.currentTime = full;
              }}
            />
            <button type="button" className="hv-videofuld-luk" aria-label={tr("Luk")} onClick={() => setFull(null)}>
              ×
            </button>
          </div>,
          document.body
        )}
    </>
  );
}

