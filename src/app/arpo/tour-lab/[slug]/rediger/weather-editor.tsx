"use client";

import { useState } from "react";
import { checkWeather, findWeatherPlace } from "@/lib/actions/tour-weather";
import type { TourConfig } from "../../tours/types";
import { Group, Toggle, input } from "./ui";

/** "Vejret" on the drone scene: switched on with a place (a town is enough), checked right here. */
export function WeatherEditor({ config, edit }: { config: TourConfig; edit: (fn: (d: TourConfig) => void) => void }) {
  const w = config.weather;
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);

  async function find(q: string) {
    setBusy(true);
    setNote(null);
    const hit = await findWeatherPlace(q);
    if ("error" in hit) {
      setNote({ text: hit.error, error: true });
    } else {
      edit((d) => void (d.weather = { lat: Math.round(hit.lat * 1000) / 1000, lon: Math.round(hit.lon * 1000) / 1000, place: hit.name }));
      const got = await checkWeather(hit.lat, hit.lon);
      const july = got.months?.[6];
      setNote(
        got.now || july
          ? { text: [got.now && `Lige nu ${got.now.temp}°, vind ${got.now.wind} m/s.`, july && `Typisk i juli ${Math.round(july.temp)}° og ${july.sun} soltimer.`].filter(Boolean).join(" ") }
          : { text: "DMI svarede ikke lige nu - touren prøver selv igen.", error: true }
      );
      setQuery("");
    }
    setBusy(false);
  }

  return (
    <Group title="Vejret">
      <Toggle
        on={Boolean(w)}
        title="Vis vejret på luftfotoet"
        hint="Vejret lige nu og et kig på hver måned (temperatur, sol, regn) fra DMI - så gæster kan se, hvornår de skal komme."
        onChange={(on) => {
          if (!on) return edit((d) => void (d.weather = undefined));
          void find(config.brand || config.title);
        }}
      />
      {w && (
        <>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim()) void find(query);
            }}
          >
            <input className={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Sted: ${w.place} - skriv et andet`} />
            <button type="submit" disabled={busy || !query.trim()} className="rounded-xl bg-[#0071e3] px-3 text-[14px] font-medium text-white disabled:opacity-40">
              {busy ? "…" : "Find"}
            </button>
          </form>
          <label className="block space-y-1">
            <span className="text-[13px] font-medium text-[#6e6e73]">Navn i touren</span>
            <input className={input} value={w.place} onChange={(e) => edit((d) => void (d.weather = { ...w, place: e.target.value.slice(0, 40) }))} />
          </label>
        </>
      )}
      {note && <p className={`px-1 text-[12px] ${note.error ? "text-[#ff3b30]" : "text-[#34c759]"}`}>{note.text}</p>}
    </Group>
  );
}
