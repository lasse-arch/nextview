"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { makeStopVoice, voiceOptions } from "@/lib/actions/tour-voice";
import type { Voice } from "@/lib/elevenlabs";
import type { GuideSetup, TourConfig } from "../../tours/types";
import { Field, FilesContext, Group } from "./ui";

/*
 * "Stemme" in Vis mig rundt: the tour's own ElevenLabs voice reads each stop's
 * text aloud. Made here (one stop, or every stop missing one), kept with the
 * tour's files and played in the tour. A made voice remembers its text: change
 * the text and it shows "lav lyden igen" - and the tour won't play the old one.
 */

type Edit = (fn: (d: TourConfig) => void) => void;
type Stop = GuideSetup["stops"][number];
type TextStop = Extract<Stop, { text: string }>;

const small = "px-1 text-[12px] leading-snug text-[#8e8e93]";
const same = (a: string, b: string) => a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();
/** What a stop's voice needs: none yet, made from an older text, or fine. */
export const voiceState = (s: TextStop): "none" | "old" | "ok" => (!s.audio ? "none" : s.audioText != null && !same(s.audioText, s.text) ? "old" : "ok");

/** The voices, fetched once per editor. */
let voicesOnce: ReturnType<typeof voiceOptions> | null = null;

export function VoiceGroup({ config, edit }: { config: TourConfig; edit: Edit }) {
  const { slug } = useContext(FilesContext);
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [making, setMaking] = useState<{ done: number; of: number } | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    let off = false;
    voicesOnce ??= voiceOptions();
    voicesOnce.then(
      (r) => {
        if (off) return;
        if (r.ok) setVoices(r.voices);
        else {
          setError(r.error);
          voicesOnce = null;
        }
      },
      () => !off && setError("Kunne ikke hente stemmerne.")
    );
    return () => {
      off = true;
    };
  }, []);

  const stops = config.guide?.stops ?? [];
  const todo = stops.flatMap((s, i) => ("text" in s && s.text.trim() && voiceState(s) !== "ok" ? [i] : []));
  const voice = config.voice;
  const listen = (url: string | null) => {
    player.current?.pause();
    if (!url) return;
    player.current = new Audio(url);
    player.current.play().catch(() => {});
  };

  async function makeAll() {
    if (!voice) return;
    setError(null);
    setMaking({ done: 0, of: todo.length });
    for (const [n, i] of todo.entries()) {
      const s = stops[i] as TextStop;
      const r = await makeStopVoice(slug, voice.id, s.title, s.text);
      if (!r.ok) {
        setError(`${s.title}: ${r.error}`);
        break;
      }
      // By place in the list - and only if the stop still says what was read.
      edit((d) => {
        const x = d.guide?.stops[i];
        if (x && "text" in x && same(x.text, s.text)) d.guide!.stops[i] = { ...x, audio: r.url, audioText: s.text };
      });
      setMaking({ done: n + 1, of: todo.length });
    }
    setMaking(null);
  }

  return (
    <Group title="Stemme">
      <p className={small}>En stemme fra ElevenLabs læser teksten op ved hvert stop. Hver tour har sin egen stemme. Lyden spilles kun på dansk - i de andre sprog vises teksten som altid.</p>
      {error && <p className="px-1 text-[12px] leading-snug text-[#ff3b30]">{error}</p>}
      {voices && (
        <Field title="Tourens stemme">
          <div className="flex gap-1.5">
            <select
              className="w-full rounded-[10px] bg-[#f2f2f7] px-3 py-2 text-[15px]"
              value={voice?.id ?? ""}
              onChange={(e) => {
                const v = voices.find((x) => x.id === e.target.value);
                edit((d) => void (d.voice = v ? { id: v.id, name: v.name } : undefined));
                listen(v?.preview ?? null);
              }}
            >
              <option value="">Ingen stemme</option>
              {voice && !voices.some((v) => v.id === voice.id) && <option value={voice.id}>{voice.name}</option>}
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.about ? ` - ${v.about}` : ""}
                </option>
              ))}
            </select>
            {voice && voices.find((v) => v.id === voice.id)?.preview && (
              <button type="button" title="Hør stemmen" className="shrink-0 rounded-[10px] bg-[#f2f2f7] px-3 text-[14px]" onClick={() => listen(voices.find((v) => v.id === voice.id)!.preview)}>
                ▶
              </button>
            )}
          </div>
        </Field>
      )}
      {!voices && !error && <p className={small}>Henter stemmerne …</p>}
      {voice && stops.length > 0 && (
        <button
          type="button"
          disabled={Boolean(making) || !todo.length}
          onClick={() => void makeAll()}
          className="w-full rounded-xl bg-[#0071e3] py-2.5 text-[15px] font-medium text-white disabled:opacity-50"
        >
          {making ? `Laver lyd … ${making.done} af ${making.of}` : todo.length ? `✦ Lav lyd til ${todo.length === stops.length ? "alle stop" : `${todo.length} stop`}` : "✓ Alle stop har lyd"}
        </button>
      )}
    </Group>
  );
}

/** One stop's voice: listen, make it (again) with the tour's voice, or upload a file instead. */
export function StopVoice({ config, stop, set, upload }: { config: TourConfig; stop: TextStop; set: (s: TextStop) => void; upload: React.ReactNode }) {
  const { slug } = useContext(FilesContext);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = voiceState(stop);
  const voice = config.voice;
  async function make() {
    if (!voice) return;
    setBusy(true);
    setError(null);
    const r = await makeStopVoice(slug, voice.id, stop.title, stop.text);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    set({ ...stop, audio: r.url, audioText: stop.text });
  }
  return (
    <Field title="Stemme" hint={voice ? undefined : 'Vælg tourens stemme under "Stemme" ovenfor - eller upload en lydfil (mp3/m4a).'}>
      {stop.audio && <audio controls preload="none" src={stop.audio} className="h-9 w-full" />}
      {state === "old" && <p className="text-[12px] font-medium text-[#c26a00]">Teksten er ændret siden lyden blev lavet - lyden spilles ikke, før den er lavet igen.</p>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {voice && stop.text.trim() && (
          <button type="button" disabled={busy} onClick={() => void make()} className="text-[13px] font-medium text-[#0071e3] disabled:opacity-50">
            {busy ? `${voice.name} læser op …` : state === "none" ? `✦ Lav lyd med ${voice.name}` : "✦ Lav lyden igen"}
          </button>
        )}
        {upload}
        {stop.audio && (
          <button type="button" className="text-[13px] text-[#ff3b30] hover:underline" onClick={() => set({ ...stop, audio: undefined, audioText: undefined })}>
            Fjern
          </button>
        )}
      </div>
      {error && <p className="text-[12px] text-[#ff3b30]">{error}</p>}
    </Field>
  );
}
