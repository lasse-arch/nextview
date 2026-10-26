import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { CASES, TEAM } from "./data";
import { CaseGrid } from "./cases";

/*
 * The temporary front page of nextview360.dk while the new site (with Arpo
 * and the customer area behind one login) is being built: what we're up to,
 * a selection of cases, and the three of us. On the site's own address it's
 * served as "/" (proxy.ts); unlike the rest of Arpo it may be found on Google.
 */

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "NextView360 — 360° virtuelle rundvisninger til erhverv",
  description: "Interaktive 360° rundvisninger, der får flere kunder ind på jeres hjemmeside, holder dem længere og får dem til at handle. Se et udvalg af vores cases.",
  icons: { icon: "/site/icon.png", apple: "/site/icon.png" },
  robots: { index: true, follow: true },
  verification: { google: "KJOWrXQryqkh5eLnZxJy9LQZqZdvUv94N_mThOck1Ys" },
  openGraph: {
    type: "website",
    title: "NextView360 — 360° virtuelle rundvisninger til erhverv",
    description: "Vi bygger noget spændende. Se et udvalg af vores cases.",
    images: ["/site/hero.jpg"],
  },
};

const tel = (phone: string) => `tel:${phone.replace(/\s/g, "")}`;

const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
  </svg>
);
const MailIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-10 6L2 7" />
  </svg>
);

export default function TemporaryFrontPage() {
  return (
    <div className={`${jakarta.className} min-h-screen bg-white text-[#0f1d33]`}>
      {/* Hero */}
      <header className="relative isolate overflow-hidden bg-[#0b1626] text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/site/hero.jpg" alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-40" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#0b1626]/40 via-[#0b1626]/60 to-[#0b1626]" />
        <div className="mx-auto max-w-6xl px-5 pb-24 pt-8 sm:px-8 sm:pb-32">
          <div className="flex items-center justify-between">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/site/logo-white.png" alt="NextView360" className="h-7 w-auto sm:h-8" />
            <a href="#kontakt" className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur hover:bg-white/20">
              Kontakt os
            </a>
          </div>
          <div className="mt-20 max-w-3xl sm:mt-28">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[.18em] text-white/80">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7fb3e6]" /> Ny hjemmeside på vej
            </p>
            <h1 className="mt-6 text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-7xl">Vi bygger noget spændende.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/75 sm:text-xl">
              Virtuelle 360° rundvisninger, der får flere kunder ind på jeres hjemmeside, holder dem længere og får dem til at handle. Mens vi bygger, kan I se et udvalg af vores kundecases her.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <a href="#cases" className="rounded-full bg-white px-6 py-3.5 font-bold text-[#0f1d33] shadow-xl shadow-black/20 hover:bg-[#e9f1fb]">
                Se kundecases ↓
              </a>
              <a href="#kontakt" className="rounded-full border border-white/30 px-6 py-3.5 font-bold hover:bg-white/10">
                Kontakt os
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Cases */}
      <section id="cases" className="mx-auto max-w-6xl scroll-mt-6 px-5 py-20 sm:px-8 sm:py-28">
        <div className="max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-[.18em] text-[#4a6b8a]">Udvalgte cases</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl">Gå selv rundt.</h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">Tryk på en case og oplev rundvisningen, præcis som kunderne gør det.</p>
        </div>
        <div className="mt-12">
          <CaseGrid cases={CASES} />
        </div>
      </section>

      {/* Contact */}
      <section id="kontakt" className="scroll-mt-6 bg-[#f4f7fb]">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[.18em] text-[#4a6b8a]">Kontakt os</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl">Ring eller skriv direkte.</h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-600">Vi er tre i Aalborg og følger hvert projekt personligt fra første snak til færdig rundvisning. Vi vender tilbage samme dag.</p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {TEAM.map((p) => (
              <div key={p.email} className="overflow-hidden rounded-3xl bg-white shadow-[0_10px_40px_-12px_rgba(15,29,51,.18)]">
                <div className="aspect-[4/3] overflow-hidden bg-slate-200 sm:aspect-[4/5]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.photo} alt={p.name} loading="lazy" className="h-full w-full object-cover object-[50%_30%]" />
                </div>
                <div className="p-6">
                  <p className="text-xl font-extrabold">{p.name}</p>
                  <p className="text-sm font-semibold text-[#4a6b8a]">{p.title}</p>
                  <div className="mt-5 space-y-2">
                    <a href={tel(p.phone)} className="flex items-center justify-between rounded-xl bg-[#1f3a5f] px-4 py-3 font-bold text-white hover:bg-[#16294a]">
                      <span>{p.phone}</span>
                      <PhoneIcon />
                    </a>
                    <a href={`mailto:${p.email}`} className="flex items-center justify-between rounded-xl bg-[#eef3f9] px-4 py-3 font-semibold text-[#1f3a5f] hover:bg-[#e2eaf4]">
                      <span className="truncate">{p.email}</span>
                      <MailIcon />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-[#0b1626] text-white/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/site/logo-white.png" alt="NextView360" className="h-6 w-auto self-start opacity-80" />
          <p>© {new Date().getFullYear()} NextView360 · Aalborg</p>
        </div>
      </footer>
    </div>
  );
}
