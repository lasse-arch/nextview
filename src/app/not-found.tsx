import type { Metadata } from "next";

export const metadata: Metadata = { title: "Siden findes ikke - Nextview360" };

/*
 * "Ikke fundet" for every address on nextview360.dk that doesn't exist - also
 * a tour that isn't published (yet) or a link that has run out, which may be
 * shown in an iframe on a customer's site: the links open in the whole window.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-[#f5f5f7] px-4 py-10 text-[#1d1d1f]">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-black/[.06] sm:p-10">
        {/* A plain link on purpose: "/" is the website (a static page), not part of this app - and from an iframe it must open in the whole window. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" target="_top" className="inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Nextview360" className="mx-auto h-8 w-auto" />
        </a>
        <p className="mt-8 text-[13px] font-semibold uppercase tracking-[.12em] text-[#0071e3]">404</p>
        <h1 className="mt-2 text-[26px] font-bold tracking-tight">Siden findes ikke</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[#6e6e73]">
          Adressen er måske skrevet forkert, eller siden er flyttet. Leder du efter en virtuel tour, er den måske ikke lagt ud endnu.
        </p>
        <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" target="_top" className="rounded-xl bg-[#0071e3] px-5 py-2.5 text-[15px] font-semibold text-white hover:bg-[#0077ed]">
            Til forsiden
          </a>
          <a href="/login" target="_top" className="rounded-xl bg-[#f2f2f7] px-5 py-2.5 text-[15px] font-semibold text-[#1d1d1f] hover:bg-[#e9e9eb]">
            Kundelogin
          </a>
        </div>
        <p className="mt-7 text-[13px] text-[#8e8e93]">
          Brug for hjælp? Skriv til{" "}
          <a href="mailto:info@nextview360.dk" className="text-[#0071e3]">
            info@nextview360.dk
          </a>
        </p>
      </div>
    </main>
  );
}
