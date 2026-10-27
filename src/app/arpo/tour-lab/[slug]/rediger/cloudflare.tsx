"use client";

import { useEffect, useState, useTransition } from "react";
import { goLive, publishNow, publishState, putVersionLive, type GoLiveState, type PublishState } from "@/lib/actions/tour-publish";
import { Group, input } from "./ui";
import { CLOUDFLARE_TOUR_ORIGIN } from "@/lib/public-urls";

/*
 * "Udgiv på tour.nextview360.dk": the tour as a frozen version on Cloudflare
 * - it runs even if Arpo is down, and new features only reach it when it's
 * published again. Every version is kept; any of them can be put back live.
 */

const day = (iso: string) => new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });
const when = (iso: string) => new Date(iso).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function CloudflarePublish({ slug }: { slug: string }) {
  const [state, setState] = useState<PublishState | null>(null);
  const [note, setNote] = useState("");
  const [anyway, setAnyway] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const load = () => publishState(slug).then(setState).catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (!state) return null;
  const preview = `${CLOUDFLARE_TOUR_ORIGIN}/${slug}`;
  const run = (fn: () => Promise<{ ok: true; value: unknown } | { ok: false; error: string }>, done: string) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: done } : { ok: false, text: r.error });
      await load();
    });

  return (
    <Group title="Udgiv på tour.nextview360.dk">
      {state.deal && <GoLive slug={slug} deal={state.deal} onDone={load} />}
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
          {state.upToDate && !anyway ? (
            // Nothing changed since the live version - a new one would be the same.
            <div className="rounded-xl bg-[#f2f2f7] px-3 py-2.5 text-center text-[14px] text-[#6e6e73]">
              ✓ Allerede udgivet - ingen ændringer siden version {state.live}
              <button type="button" onClick={() => setAnyway(true)} className="mt-1 block w-full text-[12px] text-[#8e8e93] underline-offset-2 hover:underline">
                Udgiv alligevel
              </button>
            </div>
          ) : (
          <>
          <input className={`${input} bg-[#f2f2f7]`} placeholder="Hvad er ændret? (valgfrit)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
          <button
            type="button"
            disabled={pending}
            className="w-full rounded-xl bg-[#1d1d1f] py-2.5 text-[15px] font-medium text-white disabled:opacity-50"
            onClick={() =>
              run(async () => {
                const r = await publishNow(slug, note, anyway);
                if (r.ok) {
                  setNote("");
                  setAnyway(false);
                }
                if (r.ok && r.value.missing.length) return { ok: false as const, error: `Version ${r.value.version} er live, men ${r.value.missing.length} billeder kunne ikke hentes og vises fra Arpo: ${r.value.missing.slice(0, 3).join(", ")}` };
                return r;
              }, "Udgivet. Det tager op til et minut, før den nye version vises alle steder.")
            }
          >
            {pending ? "Arbejder… (op til et par minutter første gang)" : "Udgiv ny version"}
          </button>
          </>
          )}
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

/**
 * "Udgiv touren endelig og gør kunden live": the last step, in one press -
 * the tour out, the customer Live in Arpo with access to their customer page,
 * and the welcome mail. Asks for the filming time first if it's missing.
 */
function GoLive({ slug, deal, onDone }: { slug: string; deal: GoLiveState; onDone: () => void }) {
  const [hours, setHours] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  // Already live (also customers moved over from MPSkins): nothing to do here - publishing a new version below sends no mail and changes no billing.
  if (deal.liveAt)
    return (
      <p className="rounded-xl bg-[#34c759]/12 px-3 py-2 text-[13px] text-[#1d7a33]">
        ✓ {deal.name} er live siden {day(deal.liveAt)}
        {deal.welcomeMailSentAt ? `, velkomstmail sendt ${day(deal.welcomeMailSentAt)}` : ""}. &quot;Udgiv ny version&quot; sender ingen mail til kunden.
      </p>
    );

  const go = () => {
    const h = deal.filmingMissing ? Number(hours.replace(",", ".")) : null;
    if (deal.filmingMissing && (!hours.trim() || !Number.isFinite(h) || h! <= 0)) return setMsg({ ok: false, text: "Skriv filmtiden i timer, fx 2,5." });
    if (!confirm(`Udgiv touren og sæt ${deal.name} live?\n\nVelkomstmailen med login til kundesiden sendes til ${deal.contactEmail}.`)) return;
    start(async () => {
      setMsg(null);
      const r = await goLive(slug, h);
      setMsg(r.ok ? { ok: !!r.value.mail, text: r.value.mail ? `Udgivet, og ${deal.name} er live. Velkomstmailen er sendt til ${r.value.mail}.` : `Udgivet, og ${deal.name} er live - men velkomstmailen blev ikke sendt. Se noten på dealen.` } : { ok: false, text: r.error });
      onDone();
    });
  };

  return (
    <div className="space-y-2 rounded-xl bg-[#0071e3]/[.06] p-3">
      <p className="text-[13px] leading-snug text-[#1d1d1f]">
        <b>Klar til kunden?</b> Touren lægges ud, {deal.name} sættes Live i Arpo, og kunden får velkomstmailen med en kort introduktion til kundesiden og et login{deal.contactEmail ? ` (til ${deal.contactEmail})` : ""}.
      </p>
      {!deal.contactEmail && <p className="text-[13px] text-[#c4271d]">Dealen mangler en kontakt-e-mail - tilføj den på dealen først.</p>}
      {deal.filmingMissing && (
        <label className="block text-[13px]">
          <span className="text-[#6e6e73]">Filmtid i timer (med opsætning og transport)</span>
          <input className={`${input} mt-1 bg-white`} inputMode="decimal" placeholder="Fx 2,5" value={hours} onChange={(e) => setHours(e.target.value)} />
        </label>
      )}
      <button type="button" disabled={pending || !deal.contactEmail} onClick={go} className="w-full rounded-xl bg-[#0071e3] py-2.5 text-[15px] font-semibold text-white disabled:opacity-50">
        {pending ? "Udgiver og sætter live…" : "Udgiv touren endelig og gør kunden live"}
      </button>
      {msg && <p className={`px-1 text-[13px] ${msg.ok ? "text-[#248a3d]" : "text-[#ff3b30]"}`}>{msg.text}</p>}
    </div>
  );
}
