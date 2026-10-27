"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  connectMatterport,
  createTourFromWebsite,
  matterportConnected,
  planTourFromWebsite,
  type TourPlanResult,
  matterportModels,
  searchMatterportSpaces,
  searchTourCustomers,
  type TourCustomer,
} from "@/lib/actions/tour-ai";
import { createTour } from "@/lib/actions/tours";
import type { AccountModel } from "@/lib/matterport-graph";
import { DesignGallery } from "./[slug]/rediger/design-gallery";
import { Field, input } from "./[slug]/rediger/ui";
import { BRANCHES, DESIGN_PRESETS, FOCUS, type Branch, type DesignPreset } from "./tours/presets";

/*
 * "Ny tour", step by step: who it's for (a customer, a test, or nobody yet)
 * → the Matterport space → the branch → a design (recommended for the
 * branch) → the website and what the tour should focus on → nextviewAI tells
 * its plan (what it builds and why), the user corrects it → it builds it.
 */

type Who = { kind: "deal"; deal: TourCustomer } | { kind: "test" } | { kind: "none" };
type Space = { id: string; name: string };
const STEPS = ["Kunde", "Matterport", "Branche", "Design", "Indhold", "Plan"] as const;
const DEMO_COLORS = { main: "#1d2a30", accent: "#e0533d", accentDark: "#b8402e", soft: "#f4efe8" };
const thumb = (id: string) => `https://my.matterport.com/api/v1/player/models/${id}/thumb`;

export function NewTour({ tours }: { tours: { slug: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [who, setWho] = useState<Who | null>(null);
  const [space, setSpace] = useState<Space | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [preset, setPreset] = useState<DesignPreset["id"] | null>(null);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [focus, setFocus] = useState("");
  /** The branch and audience in the user's own words - told to nextviewAI as it is. */
  const [about, setAbout] = useState("");
  const [notes, setNotes] = useState("");
  /** A drone photo the tour starts on - nextviewAI places the points on it. Made smaller in the browser first. */
  const [drone, setDrone] = useState<string | null>(null);
  const [copyOf, setCopyOf] = useState<string | null>(null);
  /** nextviewAI's plan, before it builds - and the user's corrections to it. */
  const [plan, setPlan] = useState<TourPlanResult | null>(null);
  const [corrections, setCorrections] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reset() {
    setStep(0);
    setWho(null);
    setSpace(null);
    setBranch(null);
    setPreset(null);
    setName("");
    setWebsite("");
    setFocus("");
    setNotes("");
    setDrone(null);
    setCopyOf(null);
    setPlan(null);
    setCorrections("");
    setError(null);
  }

  const aiInput = () => ({
    name: who?.kind === "test" ? `Test – ${name}` : name,
    website,
    modelId: space?.id,
    dealId: who?.kind === "deal" ? who.deal.id : undefined,
    preset: preset ?? undefined,
    branch: branch ?? undefined,
    about,
    focus,
    notes,
    droneImage: drone ?? undefined,
  });

  /** Asks for the plan (again, with the corrections, when there is one). */
  function makePlan() {
    setError(null);
    start(async () => {
      const r = await planTourFromWebsite(aiInput(), plan ?? undefined, plan ? corrections : undefined).catch((err: unknown) => ({
        ok: false as const,
        error: `Noget gik galt (${err instanceof Error ? err.message : err}) - prøv igen.`,
      }));
      if (!r.ok) return setError(r.error);
      setPlan(r.plan);
      setCorrections("");
      setStep(5);
    });
  }

  function build() {
    setError(null);
    start(async () => {
      const r = copyOf
        ? await createTour(name, copyOf)
        : await createTourFromWebsite({ ...aiInput(), plan: plan ?? undefined }).catch((err: unknown) => ({ ok: false as const, error: `Noget gik galt (${err instanceof Error ? err.message : err}) - prøv igen.` }));
      if (!r.ok) return setError(r.error);
      if ("reply" in r)
        try {
          sessionStorage.setItem(`tour-claude:${r.slug}`, String(r.reply));
        } catch {}
      router.push(`/arpo/tour-lab/${r.slug}/rediger`);
    });
  }

  const canNext = [Boolean(who), Boolean(space), Boolean(branch) || Boolean(about.trim()), Boolean(preset), Boolean(name.trim()), Boolean(plan)][step];

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="rounded-full bg-[#0071e3] px-4 py-2 text-[14px] font-medium text-white hover:bg-[#0077ed]"
      >
        + Ny tour
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm" onClick={() => !pending && setOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[92vh] w-full max-w-[640px] flex-col rounded-[22px] bg-[#f5f5f7] shadow-[0_30px_80px_rgba(0,0,0,.3)]"
            style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif' }}
          >
            {/* Steps */}
            {copyOf == null && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 border-b border-black/[.06] px-5 pb-3 pt-4">
                {STEPS.map((s, i) => (
                  <button
                    key={s}
                    type="button"
                    disabled={i > step}
                    onClick={() => setStep(i)}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ${i === step ? "bg-white text-[#1d1d1f] shadow-sm" : i < step ? "text-[#0071e3]" : "text-[#8e8e93]"}`}
                  >
                    <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${i < step ? "bg-[#0071e3] text-white" : "bg-black/10"}`}>{i < step ? "✓" : i + 1}</span>
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {copyOf != null ? (
                <CopyStep tours={tours} copyOf={copyOf} setCopyOf={setCopyOf} name={name} setName={setName} />
              ) : step === 0 ? (
                <CustomerStep
                  who={who}
                  onPick={(w) => {
                    setWho(w);
                    if (w.kind === "deal") {
                      setName(w.deal.name);
                      setWebsite(w.deal.website ?? "");
                    }
                    setStep(1);
                  }}
                  onCopy={() => setCopyOf(tours[0]?.slug ?? "")}
                />
              ) : step === 1 ? (
                <SpaceStep
                  dealId={who?.kind === "deal" ? who.deal.id : null}
                  space={space}
                  onPick={(s) => {
                    setSpace(s);
                    if (who?.kind !== "deal") setName(s.name);
                  }}
                />
              ) : step === 2 ? (
                <div className="space-y-3">
                  <h2 className="text-[19px] font-semibold tracking-tight">Hvilken branche?</h2>
                  <p className="text-[13px] text-[#6e6e73]">Så anbefaler vi det design og fokus, der plejer at virke.</p>
                  <div className="grid grid-cols-3 gap-2">
                    {BRANCHES.map(([b, text]) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => {
                          setBranch(b);
                          setPreset(DESIGN_PRESETS.find((p) => p.recommendedFor.includes(b))?.id ?? "klassisk");
                        }}
                        className={`rounded-xl bg-white px-3 py-3 text-left text-[14px] font-medium ring-1 transition hover:shadow-md ${branch === b ? "ring-2 ring-[#0071e3]" : "ring-black/[.06]"}`}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                  <Field title="Med dine egne ord (valgfrit)" hint="Hvem er kunden, og hvem skal se touren? nextviewAI får det at vide, som du skriver det.">
                    <textarea
                      className={`${input} min-h-[70px] resize-y`}
                      value={about}
                      onChange={(e) => {
                        setAbout(e.target.value);
                        if (!branch && e.target.value.trim()) setPreset((p) => p ?? "klassisk");
                      }}
                      placeholder="Fx Specialefterskole for unge med autisme - forældre og kommuner vælger skolen"
                    />
                  </Field>
                  <Field title="Fokus (valgfrit)" hint="Det, touren især skal få folk til.">
                    <div className="space-y-1.5">
                      {branch && (
                        <div className="flex flex-wrap gap-1.5">
                          {FOCUS[branch].map((f) => (
                            <button key={f} type="button" onClick={() => setFocus(f)} className={`rounded-full px-3 py-1 text-[12px] ring-1 ${focus === f ? "bg-[#0071e3] text-white ring-[#0071e3]" : "bg-white ring-black/[.08] hover:ring-black/20"}`}>
                              {f}
                            </button>
                          ))}
                        </div>
                      )}
                      <input className={input} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Fx Book en rundvisning" />
                    </div>
                  </Field>
                </div>
              ) : step === 3 ? (
                <div className="space-y-3">
                  <h2 className="text-[19px] font-semibold tracking-tight">Vælg design</h2>
                  <p className="text-[13px] text-[#6e6e73]">De anbefalede passer til branchen. Alt kan ændres bagefter i editoren - også et helt eget design via nextviewAI.</p>
                  <DesignGallery colors={DEMO_COLORS} selected={preset} branch={branch} onPick={(p) => setPreset(p.id)} />
                </div>
              ) : step === 4 ? (
                <div className="space-y-3">
                  <h2 className="text-[19px] font-semibold tracking-tight">Hvad skal nextviewAI bygge?</h2>
                  <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-black/[.04]">
                    <Field title="Navn på touren">
                      <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
                    </Field>
                    <Field title="Kundens hjemmeside" hint="Farver, logo, favicon, skrift, tekster og booking-links hentes herfra - så touren hænger sammen med siden.">
                      <input className={input} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="fx jalsa.dk" />
                    </Field>
                    <Field title="Hvad skal touren få folk til?">
                      <div className="mb-1.5 flex flex-wrap gap-1.5">
                        {FOCUS[branch ?? "andet"].map((f) => (
                          <button key={f} type="button" onClick={() => setFocus(f)} className={`rounded-full px-3 py-1 text-[12px] ring-1 ${focus === f ? "bg-[#0071e3] text-white ring-[#0071e3]" : "bg-white ring-black/[.08] hover:ring-black/20"}`}>
                            {f}
                          </button>
                        ))}
                      </div>
                      <input className={input} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Fx Book bord" />
                    </Field>
                    <Field title="Dronebillede til start (valgfrit)" hint="Touren starter på billedet, og nextviewAI sætter punkterne på stederne, den kan se - du kan flytte dem bagefter under Interaktivt kort.">
                      {drone ? (
                        <div className="flex items-center gap-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={drone} alt="" className="h-16 w-28 rounded-lg object-cover ring-1 ring-black/[.06]" />
                          <button type="button" onClick={() => setDrone(null)} className="text-[13px] text-[#ff3b30] hover:underline">
                            Fjern
                          </button>
                        </div>
                      ) : (
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (f) setDrone(await shrinkImage(f, 2400).catch(() => null));
                          }}
                          className="block w-full text-[13px] file:mr-3 file:rounded-full file:border-0 file:bg-[#0071e3]/10 file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-[#0071e3]"
                        />
                      )}
                    </Field>
                    <Field title="Ønsker til nextviewAI (valgfrit)" hint="Alt det særlige: målgruppe, tone, et helt eget design, særlige funktioner …">
                      <textarea className={`${input} min-h-[70px] resize-y`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Fx målgruppen er forældre; brug skolens grønne farve og runde former." />
                    </Field>
                  </div>
                  {pending && <p className="px-1 text-center text-[13px] text-[#6e6e73]">nextviewAI læser hjemmesiden og lægger en plan - det tager typisk et halvt minut…</p>}
                </div>
              ) : (
                <PlanStep plan={plan} corrections={corrections} setCorrections={setCorrections} pending={pending} onReplan={makePlan} />
              )}
              {error && <p className="mt-3 px-1 text-[13px] text-[#ff3b30]">{error}</p>}
            </div>

            <div className="flex gap-2 border-t border-black/[.06] p-4">
              <button
                type="button"
                disabled={pending}
                onClick={() => (copyOf != null ? setCopyOf(null) : step === 0 ? setOpen(false) : setStep(step - 1))}
                className="rounded-xl bg-white px-4 py-2.5 text-[15px] font-medium ring-1 ring-black/[.06] disabled:opacity-50"
              >
                {step === 0 && copyOf == null ? "Annullér" : "Tilbage"}
              </button>
              <div className="flex-1" />
              {copyOf != null ? (
                <button type="button" disabled={pending || !name.trim()} onClick={build} className="rounded-xl bg-[#0071e3] px-5 py-2.5 text-[15px] font-medium text-white disabled:opacity-40">
                  {pending ? "Opretter…" : "Opret kopi"}
                </button>
              ) : step < 4 ? (
                <button type="button" disabled={!canNext} onClick={() => setStep(step + 1)} className="rounded-xl bg-[#0071e3] px-5 py-2.5 text-[15px] font-medium text-white disabled:opacity-40">
                  Næste
                </button>
              ) : step === 4 ? (
                <button type="button" disabled={pending || !name.trim()} onClick={plan ? () => setStep(5) : makePlan} className="rounded-xl bg-[#0071e3] px-5 py-2.5 text-[15px] font-medium text-white disabled:opacity-40">
                  {pending ? "Lægger en plan…" : plan ? "Til planen" : "Se nextviewAIs plan"}
                </button>
              ) : (
                <button type="button" disabled={pending || !name.trim()} onClick={build} className="rounded-xl bg-[#0071e3] px-5 py-2.5 text-[15px] font-medium text-white disabled:opacity-40">
                  {pending ? "Bygger…" : "Byg touren efter planen"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** nextviewAI's plan in its own words - read it, write what should be different, and get a new one (or build). */
function PlanStep({
  plan,
  corrections,
  setCorrections,
  pending,
  onReplan,
}: {
  plan: TourPlanResult | null;
  corrections: string;
  setCorrections: (s: string) => void;
  pending: boolean;
  onReplan: () => void;
}) {
  if (!plan) return null;
  return (
    <div className="space-y-3">
      <h2 className="text-[19px] font-semibold tracking-tight">Sådan vil nextviewAI bygge touren</h2>
      <p className="rounded-2xl bg-white p-4 text-[15px] leading-relaxed ring-1 ring-black/[.04]">{plan.intro}</p>
      {plan.sections.map((s) => (
        <section key={s.title} className="rounded-2xl bg-white p-4 ring-1 ring-black/[.04]">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[#6e6e73]">{s.title}</h3>
          <p className="mt-1 text-[14px] leading-relaxed">{s.text}</p>
          {s.items.length > 0 && (
            <ul className="mt-2 space-y-1">
              {s.items.map((i) => (
                <li key={i} className="flex gap-2 text-[14px]">
                  <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-[#0071e3]" />
                  {i}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      {plan.questions.length > 0 && (
        <section className="rounded-2xl bg-[#fff8e6] p-4 ring-1 ring-[#f5d27a]/60">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[#8a6100]">nextviewAI spørger</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-[14px]">
            {plan.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </section>
      )}
      <div className="space-y-2 rounded-2xl bg-white p-4 ring-1 ring-black/[.04]">
        <Field title="Rettelser til planen" hint="Skriv det, der skal være anderledes - eller svar på spørgsmålene. Så laver nextviewAI planen om. Er den god, så tryk Byg touren efter planen.">
          <textarea
            className={`${input} min-h-[80px] resize-y`}
            value={corrections}
            onChange={(e) => setCorrections(e.target.value)}
            placeholder="Fx Drop historierne, og læg Priser som eget menupunkt øverst."
          />
        </Field>
        <button type="button" disabled={pending || !corrections.trim()} onClick={onReplan} className="w-full rounded-xl bg-[#f2f2f7] py-2.5 text-[14px] font-medium text-[#0071e3] disabled:opacity-40">
          {pending ? "nextviewAI retter planen…" : "Lav planen om"}
        </button>
      </div>
    </div>
  );
}

function CustomerStep({ who, onPick, onCopy }: { who: Who | null; onPick: (w: Who) => void; onCopy: () => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<TourCustomer[] | null>(null);
  useEffect(() => {
    const t = setTimeout(() => searchTourCustomers(q).then(setRows).catch(() => setRows([])), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q]);
  const stage: Record<string, string> = { CONTRACT_SIGNED: "Kontrakt underskrevet", FILMED: "Filmet", LIVE: "Live" };
  return (
    <div className="space-y-3">
      <h2 className="text-[19px] font-semibold tracking-tight">Hvem er touren til?</h2>
      <input autoFocus className={`${input} bg-white ring-1 ring-black/[.06]`} placeholder="Søg kunde" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/[.04]">
        {rows == null && <p className="px-4 py-4 text-[13px] text-[#8e8e93]">Henter…</p>}
        {rows?.length === 0 && <p className="px-4 py-4 text-[13px] text-[#8e8e93]">Ingen kunder matcher.</p>}
        <ul className="divide-y divide-black/[.05]">
          {rows?.map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => onPick({ kind: "deal", deal: d })} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[#f9f9fb] ${who?.kind === "deal" && who.deal.id === d.id ? "bg-[#0071e3]/5" : ""}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{d.name}</span>
                  <span className="block truncate text-[12px] text-[#8e8e93]">
                    {[stage[d.stage] ?? null, d.address, d.tours ? `${d.tours} tour${d.tours > 1 ? "s" : ""} allerede` : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {d.hasModel && <span className="rounded-full bg-[#34c759]/15 px-2 py-0.5 text-[11px] font-medium text-[#248a3d]">Matterport</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onPick({ kind: "test" })} className="rounded-xl bg-white px-3 py-2.5 text-left ring-1 ring-black/[.06] hover:shadow-md">
          <span className="block text-[14px] font-medium">Test-tour</span>
          <span className="block text-[12px] text-[#8e8e93]">Til at prøve noget af</span>
        </button>
        <button type="button" onClick={() => onPick({ kind: "none" })} className="rounded-xl bg-white px-3 py-2.5 text-left ring-1 ring-black/[.06] hover:shadow-md">
          <span className="block text-[14px] font-medium">Ingen kunde endnu</span>
          <span className="block text-[12px] text-[#8e8e93]">Kan knyttes til en kunde senere</span>
        </button>
      </div>
      <button type="button" onClick={onCopy} className="px-1 text-[13px] text-[#0071e3] hover:underline">
        Eller kopiér en eksisterende tour i stedet
      </button>
    </div>
  );
}

function SpaceStep({ dealId, space, onPick }: { dealId: string | null; space: Space | null; onPick: (s: Space) => void }) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [customerSpaces, setCustomerSpaces] = useState<Space[]>([]);
  const [q, setQ] = useState("");
  const [spaces, setSpaces] = useState<AccountModel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokenId, setTokenId] = useState("");
  const [secret, setSecret] = useState("");
  const [pasted, setPasted] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    matterportConnected().then(setConnected).catch(() => setConnected(false));
    if (dealId) matterportModels(dealId).then((m) => setCustomerSpaces(m.map((x) => ({ id: x.id, name: x.name })))).catch(() => {});
  }, [dealId]);
  useEffect(() => {
    if (!connected) return;
    const t = setTimeout(
      () =>
        searchMatterportSpaces(q).then((r) => {
          if (r.ok) {
            setSpaces(r.models);
            setError(null);
          } else setError(r.error);
        }),
      q ? 300 : 0
    );
    return () => clearTimeout(t);
  }, [q, connected]);

  const card = (s: Space) => (
    <button key={s.id} type="button" onClick={() => onPick(s)} className={`overflow-hidden rounded-xl bg-white text-left ring-1 transition hover:shadow-md ${space?.id === s.id ? "ring-2 ring-[#0071e3]" : "ring-black/[.06]"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={thumb(s.id)} alt="" loading="lazy" className="aspect-[16/10] w-full bg-[#e9e9eb] object-cover" />
      <span className="block truncate px-2.5 py-1.5 text-[13px] font-medium">{s.name}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <h2 className="text-[19px] font-semibold tracking-tight">Vælg Matterport-touren</h2>
      {customerSpaces.length > 0 && (
        <div className="space-y-2">
          <div className="px-1 text-[12px] font-semibold uppercase tracking-wide text-[#6e6e73]">Kundens tours</div>
          <div className="grid grid-cols-3 gap-2">{customerSpaces.map(card)}</div>
        </div>
      )}
      {connected ? (
        <div className="space-y-2">
          <div className="px-1 text-[12px] font-semibold uppercase tracking-wide text-[#6e6e73]">Alle tours på Matterport</div>
          <input className={`${input} bg-white ring-1 ring-black/[.06]`} placeholder="Søg i Matterport" value={q} onChange={(e) => setQ(e.target.value)} />
          {error && <p className="px-1 text-[12px] text-[#ff3b30]">{error}</p>}
          <div className="grid max-h-[340px] grid-cols-3 gap-2 overflow-y-auto">{spaces?.map((s) => card(s))}</div>
        </div>
      ) : connected === false ? (
        <div className="space-y-2 rounded-2xl bg-white p-4 ring-1 ring-black/[.04]">
          <div className="text-[15px] font-semibold">Forbind Matterport</div>
          <p className="text-[12px] leading-snug text-[#6e6e73]">
            Én gang: på my.matterport.com → Settings → Developer Tools → API Token Management, lav en nøgle og indsæt den her. Så kan alle jeres Matterport-tours vælges her.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <input className={input} placeholder="Token-id" value={tokenId} onChange={(e) => setTokenId(e.target.value)} />
            <input className={input} type="password" placeholder="Secret" value={secret} onChange={(e) => setSecret(e.target.value)} />
          </div>
          {error && <p className="text-[12px] text-[#ff3b30]">{error}</p>}
          <button
            type="button"
            disabled={pending || !tokenId || !secret}
            className="w-full rounded-xl bg-[#1d1d1f] py-2 text-[14px] font-medium text-white disabled:opacity-40"
            onClick={() =>
              start(async () => {
                const r = await connectMatterport(tokenId, secret);
                if (!r.ok) return setError(r.error);
                setError(null);
                setConnected(true);
              })
            }
          >
            {pending ? "Forbinder…" : "Forbind Matterport"}
          </button>
        </div>
      ) : null}
      <details className="text-[13px]">
        <summary className="cursor-pointer select-none px-1 text-[#0071e3]">Indsæt et link i stedet</summary>
        <div className="mt-2 space-y-2 rounded-2xl bg-white p-4 ring-1 ring-black/[.04]">
          <Field title="Matterport-link eller ID" hint="Fx my.matterport.com/show/?m=rxaXbNZcETf">
            <div className="flex gap-2">
              <input className={input} value={pasted} onChange={(e) => setPasted(e.target.value)} />
              <button
                type="button"
                className="flex-none rounded-xl bg-[#0071e3] px-3 text-[14px] font-medium text-white"
                onClick={() =>
                  start(async () => {
                    const [m] = await matterportModels(null, pasted);
                    if (!m) return setError("Kunne ikke finde den tour - er den offentlig?");
                    setError(null);
                    onPick({ id: m.id, name: m.name });
                  })
                }
              >
                Hent
              </button>
            </div>
          </Field>
        </div>
      </details>
      {space && <p className="px-1 text-[13px] text-[#248a3d]">✓ Valgt: {space.name}</p>}
    </div>
  );
}

function CopyStep({ tours, copyOf, setCopyOf, name, setName }: { tours: { slug: string; name: string }[]; copyOf: string; setCopyOf: (s: string) => void; name: string; setName: (s: string) => void }) {
  return (
    <div className="space-y-3">
      <h2 className="text-[19px] font-semibold tracking-tight">Kopiér en tour</h2>
      <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-black/[.04]">
        <Field title="Navn">
          <input autoFocus className={input} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field title="Kopi af">
          <select className={input} value={copyOf} onChange={(e) => setCopyOf(e.target.value)}>
            {tours.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  );
}

/** A picture made at most `max` px wide/high, as a JPEG data URL - small enough to send, sharp enough for the tour. */
function shrinkImage(file: File, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.86));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Billedet kunne ikke læses."));
    };
    img.src = url;
  });
}
