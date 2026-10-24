"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

// The 360° viewer (WebGL) only runs in the browser.
const Pano = dynamic(() => import("./pano").then((m) => m.Pano), { ssr: false });

type Point = {
  id: string;
  name: string;
  /** Position on the overview picture, in % of its width/height. */
  x: number;
  y: number;
  kind: "matterport" | "pano";
  /** Matterport link (ideally a "U"-link to the exact spot) or a 360° image URL. */
  url: string;
};

const STORAGE_KEY = "tour-lab-v1";

/**
 * A Matterport "U"-link (my.matterport.com/show/?m=…&ss=…&sr=…) already
 * carries the start spot (ss) and view direction (sr); play=1 + qs=1 make
 * the embed start straight away at that spot without the intro fly-in.
 */
export function matterportEmbedUrl(raw: string): string {
  try {
    const url = new URL(raw.trim());
    url.searchParams.set("play", "1");
    url.searchParams.set("qs", "1");
    url.searchParams.set("brand", "0");
    url.searchParams.set("help", "0");
    return url.toString();
  } catch {
    return raw;
  }
}

export function TourLab() {
  const [overview, setOverview] = useState<string | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [editing, setEditing] = useState(true);
  const [draft, setDraft] = useState<Point | null>(null);
  const [open, setOpen] = useState<Point | null>(null);
  const panoFiles = useRef(new Map<string, string>());
  const loaded = useRef(false);

  useEffect(() => {
    requestAnimationFrame(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
        if (saved) {
          setOverview(saved.overview ?? null);
          setPoints(saved.points ?? []);
        }
      } catch {}
      loaded.current = true;
    });
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ overview, points: points.filter((p) => !p.url.startsWith("blob:")) }));
    } catch {}
  }, [overview, points]);

  function pickOverview(file: File) {
    const reader = new FileReader();
    reader.onload = () => setOverview(String(reader.result));
    reader.readAsDataURL(file);
  }

  function clickOverview(e: React.MouseEvent<HTMLDivElement>) {
    if (!editing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setDraft({ id: crypto.randomUUID(), name: "", x, y, kind: "matterport", url: "" });
  }

  function saveDraft() {
    if (!draft || !draft.url.trim()) return;
    setPoints((prev) => [...prev.filter((p) => p.id !== draft.id), { ...draft, name: draft.name.trim() || "Punkt" }]);
    setDraft(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Tour-lab</h1>
          <p className="text-sm text-slate-500">
            Prototype: overbliksbillede med egne punkter, der hopper ind i Matterport-touren eller et 360°-dronebillede.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            {overview ? "Skift overbliksbillede" : "Vælg overbliksbillede"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && pickOverview(e.target.files[0])}
            />
          </label>
          <div className="flex rounded-lg border border-slate-300 p-0.5 text-sm">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={`rounded-md px-3 py-1.5 ${editing ? "bg-slate-900 text-white" : "text-slate-600"}`}
            >
              Rediger
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(null);
              }}
              className={`rounded-md px-3 py-1.5 ${!editing ? "bg-slate-900 text-white" : "text-slate-600"}`}
            >
              Vis som besøgende
            </button>
          </div>
        </div>
      </div>

      {!overview ? (
        <div className="rounded-xl border-2 border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          Vælg et overbliksbillede (3D-tegning eller dronefoto) for at komme i gang.
        </div>
      ) : (
        <div className="relative select-none overflow-hidden rounded-xl bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={overview} alt="Overblik" className="block w-full" draggable={false} />
          <div className={`absolute inset-0 ${editing ? "cursor-crosshair" : ""}`} onClick={clickOverview}>
            {[...points, ...(draft ? [draft] : [])].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (editing) setDraft(p);
                  else setOpen(p);
                }}
                className="group absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
                title={p.name}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/85 shadow-lg ring-2 ring-white transition-transform group-hover:scale-110 sm:h-11 sm:w-11">
                  <span className="h-4 w-4 rounded-full border-[3px] border-white sm:h-5 sm:w-5" />
                </span>
                {p.name && (
                  <span className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-black/75 px-2 py-0.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                    {p.name}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {editing && overview && !draft && (
        <p className="text-sm text-slate-500">
          Klik på billedet for at sætte et punkt. Tryk <b>U</b> inde i Matterport-touren på det sted, punktet skal hoppe hen til -
          så kopieres et link til netop det sted og den synsretning.
        </p>
      )}

      {draft && (
        <div className="max-w-xl space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Navn</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="fx Hallen"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                autoFocus
              />
            </label>
            <label className="text-sm">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Åbner</span>
              <select
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as Point["kind"], url: "" })}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"
              >
                <option value="matterport">Matterport-tour (sted)</option>
                <option value="pano">360°-billede (fx drone)</option>
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {draft.kind === "matterport" ? "Matterport-link (tryk U i touren)" : "Link til 360°-billede"}
            </span>
            <input
              value={draft.url.startsWith("blob:") ? "(uploadet fil)" : draft.url}
              onChange={(e) => setDraft({ ...draft, url: e.target.value })}
              placeholder={
                draft.kind === "matterport" ? "https://my.matterport.com/show/?m=…&ss=…&sr=…" : "https://…/drone-360.jpg"
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          {draft.kind === "pano" && (
            <label className="block text-sm text-slate-600">
              …eller upload et 360°-billede (equirectangular, 2:1):{" "}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const url = URL.createObjectURL(file);
                  panoFiles.current.set(draft.id, url);
                  setDraft({ ...draft, url, name: draft.name || file.name.replace(/\.[^.]+$/, "") });
                }}
              />
              <span className="block text-xs text-slate-400">Uploadede filer huskes kun, indtil siden genindlæses.</span>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveDraft}
              disabled={!draft.url.trim()}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Gem punkt
            </button>
            <button type="button" onClick={() => setOpen(draft)} disabled={!draft.url.trim()} className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-40">
              Prøv
            </button>
            {points.some((p) => p.id === draft.id) && (
              <button
                type="button"
                onClick={() => {
                  setPoints((prev) => prev.filter((p) => p.id !== draft.id));
                  setDraft(null);
                }}
                className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-600"
              >
                Slet punkt
              </button>
            )}
            <button type="button" onClick={() => setDraft(null)} className="rounded-md px-3 py-2 text-sm text-slate-500">
              Annullér
            </button>
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <div className="flex items-center gap-2 overflow-x-auto bg-black/90 px-3 py-2">
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="shrink-0 rounded-full bg-white px-3 py-1.5 text-sm font-medium text-slate-900"
            >
              ← Overblik
            </button>
            {points.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setOpen(p)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${p.id === open.id ? "bg-white/25 text-white" : "text-white/70 hover:text-white"}`}
              >
                {p.kind === "pano" ? "🚁 " : ""}
                {p.name}
              </button>
            ))}
          </div>
          <div className="relative min-h-0 flex-1">
            {open.kind === "matterport" ? (
              <iframe
                key={open.id}
                src={matterportEmbedUrl(open.url)}
                className="h-full w-full border-0"
                allow="xr-spatial-tracking; fullscreen"
                allowFullScreen
              />
            ) : (
              <Pano key={open.id} src={open.url} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
