"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * The 1 mio. party (see src/lib/milestones.ts): a banner on every page for
 * the week, and fireworks + confetti over the whole screen - by itself the
 * first time each person opens Arpo that day, and again from the banner's
 * button. "?fejr=1" on any page shows it outside the week too (a preview).
 */
export function Celebration({ active, amountLabel }: { active: boolean; amountLabel: string }) {
  const preview = useSearchParams().get("fejr") === "1";
  const [running, setRunning] = useState(false);

  // The day's first visit sets them off by itself - once the page has painted.
  useEffect(() => {
    if (!active && !preview) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const today = new Date().toDateString();
    let seen: string | null = null;
    try {
      seen = localStorage.getItem("arpo-fest-seen");
    } catch {}
    if (seen === today && !preview) return;
    try {
      localStorage.setItem("arpo-fest-seen", today);
    } catch {}
    const frame = requestAnimationFrame(() => setRunning(true));
    return () => cancelAnimationFrame(frame);
  }, [active, preview]);

  if (!active && !preview) return null;

  return (
    <>
      <div className="mx-4 mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-xl bg-gradient-to-r from-amber-400 via-pink-500 to-violet-600 px-4 py-3 text-center text-white shadow-md sm:mx-6 md:mx-10">
        <span className="text-lg font-bold sm:text-xl">🎉 {amountLabel} solgt! 🎉</span>
        <span className="text-sm text-white/90">Kæmpe tillykke til hele holdet - det her er jeres fortjeneste. 🥂</span>
        <button
          type="button"
          onClick={() => setRunning(true)}
          className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold ring-1 ring-white/50 hover:bg-white/30"
        >
          🎆 Mere fyrværkeri
        </button>
      </div>
      {running && <Fireworks onDone={() => setRunning(false)} />}
    </>
  );
}

type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number; spark: boolean };
type Rocket = { x: number; y: number; vx: number; vy: number; targetY: number; color: string };

const COLORS = ["#f59e0b", "#ec4899", "#8b5cf6", "#10b981", "#3b82f6", "#ef4444", "#facc15", "#ffffff"];
const DURATION_MS = 7000;

/** Full-screen canvas: rockets that burst into sparks, and falling confetti. Clicks pass through. */
function Fireworks({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // A ref, so a re-render (e.g. navigating) doesn't restart the show.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const w = () => window.innerWidth;
    const h = () => window.innerHeight;
    const pick = () => COLORS[Math.floor(Math.random() * COLORS.length)];
    const rockets: Rocket[] = [];
    const particles: Particle[] = [];
    const start = performance.now();
    let lastLaunch = 0;
    let frame = 0;

    // Confetti from the top, all at once.
    for (let i = 0; i < 160; i++) {
      particles.push({
        x: Math.random() * w(),
        y: -Math.random() * h() * 0.6,
        vx: (Math.random() - 0.5) * 1.5,
        vy: 1.5 + Math.random() * 2.5,
        life: 1,
        color: pick(),
        size: 4 + Math.random() * 5,
        spark: false,
      });
    }

    const launch = () => {
      rockets.push({
        x: w() * (0.15 + Math.random() * 0.7),
        y: h(),
        vx: (Math.random() - 0.5) * 2,
        vy: -(9 + Math.random() * 4),
        targetY: h() * (0.15 + Math.random() * 0.35),
        color: pick(),
      });
    };

    const burst = (x: number, y: number, color: string) => {
      const count = 70 + Math.floor(Math.random() * 40);
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count;
        const speed = 2 + Math.random() * 4.5;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          color: Math.random() < 0.2 ? "#ffffff" : color,
          size: 2 + Math.random() * 1.5,
          spark: true,
        });
      }
    };

    const tick = (t: number) => {
      const elapsed = t - start;
      ctx.clearRect(0, 0, w(), h());
      if (elapsed < DURATION_MS - 1500 && t - lastLaunch > 380) {
        launch();
        if (Math.random() < 0.4) launch();
        lastLaunch = t;
      }

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.x += r.vx;
        r.y += r.vy;
        r.vy += 0.12;
        ctx.fillStyle = r.color;
        ctx.beginPath();
        ctx.arc(r.x, r.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        if (r.y <= r.targetY || r.vy >= 0) {
          burst(r.x, r.y, r.color);
          rockets.splice(i, 1);
        }
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.spark) {
          p.vx *= 0.98;
          p.vy = p.vy * 0.98 + 0.06;
          p.life -= 0.012;
        } else {
          p.vx += (Math.random() - 0.5) * 0.1;
          if (p.y > h() + 20) p.life = 0;
        }
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        if (p.spark) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.y + p.x) / 40);
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }

      if (elapsed < DURATION_MS || rockets.length || particles.some((p) => p.spark)) {
        frame = requestAnimationFrame(tick);
      } else {
        onDoneRef.current();
      }
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60] h-full w-full" />;
}
