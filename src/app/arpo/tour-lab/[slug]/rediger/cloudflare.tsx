"use client";

import { useEffect, useState, useTransition } from "react";
import { publishNow, publishState, putVersionLive, type PublishState } from "@/lib/actions/tour-publish";
import { Group, input } from "./ui";

/*
 * "Udgiv på tour.nextview360.dk": the tour as a frozen version on Cloudflare
 * - it runs even if Arpo is down, and new features only reach it when it's
 * published again. Every version is kept; any of them can be put back live.
 */

const when = (iso: string) => new Date(iso).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function CloudflarePublish({ slug }: { slug: string }) {
  const [state, setState] = useState<PublishState | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const load = () => publishState(slug).then(setState).catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (!state) return null;
  const preview = `https://${state.project}.pages.dev/${slug}`;
  const run = (fn: () => Promise<{ ok: true; value: unknown } | { ok: false; error: string }>, done: string) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: done } : { ok: false, text: r.error });
      await load();
    });

  return (
    <Group title="Udgiv på tour.nextview360.dk">
      <p className="px-1 text-[12px] leading-snug text-[#8e8e93]">
        Touren lægges ud som en fast version hos Cloudflare. Den kører, selv hvis Arpo er nede, og ændringer og nye funktioner kommer først med, når du udgiver igen. Alle versioner gemmes, så du kan gå tilbage.
      </p>
      {!state.ready ? (
        <p className="rounded-xl bg-[#fff4e5] px-3 py-2 text-[13px] text-[#8a5300]">Cloudflare er ikke sat op endnu (CLOUDFLARE_API_TOKEN og CLOUDFLARE_ACCOUNT_ID i Vercel).</p>
      ) : (
        <>
          <p className="px-1 text-[13px]">
            {state.live ? (
              <>
                <b>Version {state.live} er live.</b>{" "}
                <a href={preview} target="_blank" rel="noopener" className="text-[#0071e3]">
                  Se den ↗
                </a>
              </>
            ) : (
              <span className="text-[#6e6e73]">Ikke udgivet på Cloudflare endnu.</span>
            )}
          </p>
          <input className={`${input} bg-[#f2f2f7]`} placeholder="Hvad er ændret? (valgfrit)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
          <button
            type="button"
            disabled={pending}
            className="w-full rounded-xl bg-[#1d1d1f] py-2.5 text-[15px] font-medium text-white disabled:opacity-50"
            onClick={() =>
              run(async () => {
                const r = await publishNow(slug, note);
                if (r.ok) setNote("");
                if (r.ok && r.value.missing.length) return { ok: false as const, error: `Version ${r.value.version} er live, men ${r.value.missing.length} billeder kunne ikke hentes og vises fra Arpo: ${r.value.missing.slice(0, 3).join(", ")}` };
                return r;
              }, "Udgivet. Det tager op til et minut, før den nye version vises alle steder.")
            }
          >
            {pending ? "Arbejder… (op til et par minutter første gang)" : "Udgiv ny version"}
          </button>
          {msg && <p className={`px-1 text-[13px] ${msg.ok ? "text-[#248a3d]" : "text-[#ff3b30]"}`}>{msg.text}</p>}
          {state.versions.length > 0 && (
            <ul className="divide-y divide-black/[.06] rounded-xl bg-[#f2f2f7]">
              {state.versions.map((v) => (
                <li key={v.version} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                  <div className="min-w-0 flex-1">
                    <b>Version {v.version}</b> <span className="text-[#8e8e93]">· {when(v.at)}{v.by ? ` · ${v.by}` : ""}</span>
                    {v.note && <p className="truncate text-[12px] text-[#6e6e73]">{v.note}</p>}
                  </div>
                  {state.live === v.version ? (
                    <>
                      <span className="rounded-full bg-[#e3f5e8] px-2 py-0.5 text-[11px] font-semibold text-[#248a3d]">Live</span>
                      <button type="button" disabled={pending} className="text-[12px] font-medium text-[#ff3b30]" onClick={() => confirm("Tag touren offline på tour.nextview360.dk?") && run(() => putVersionLive(slug, null), "Touren er taget offline.")}>
                        Tag offline
                      </button>
                    </>
                  ) : (
                    <button type="button" disabled={pending} className="text-[12px] font-medium text-[#0071e3]" onClick={() => run(() => putVersionLive(slug, v.version), `Version ${v.version} er live igen.`)}>
                      Sæt live
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Group>
  );
}
