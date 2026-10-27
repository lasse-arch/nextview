import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentCustomer, getCurrentUser } from "@/lib/auth";
import { logout } from "@/lib/actions/auth";
import { prisma } from "@/lib/db";
import { dealName } from "@/lib/labels";
import { reviewUrl, tourUrl } from "@/lib/public-urls";
import { tourStats } from "@/lib/tour-stats";
import { shareOf } from "@/lib/tour-share";
import { CustomerReport } from "@/app/arpo/tour-lab/[slug]/rediger/customer-report";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";
import { startPlaces } from "@/app/arpo/tour-lab/tours/places";
import { PortalEmbeds } from "@/app/r/[token]/embeds";
import { PHONE, WELCOME_MAIL_SENDER } from "@/lib/welcome-mail";

/*
 * The customer's own page, nextview360.dk/kunde - after logging in with the
 * link from their e-mail. Only the deals the login was given access to in
 * Arpo: their tours (the numbers we share, the codes for their website,
 * the review link), the signed contract, the invoices, and how to reach us.
 * Everything is looked up from the login's own deals - never from anything
 * in the address - so one customer can never see another's.
 */

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Jeres side - Nextview360", robots: { index: false, follow: false } };

const kr = (n: number) => `${n.toLocaleString("da-DK")} kr.`;
const date = (d: Date) => d.toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });

export default async function CustomerPage() {
  const account = await getCurrentCustomer();
  if (!account) redirect((await getCurrentUser()) ? "/arpo" : "/api/auth/session-ended");

  const deals = await prisma.deal.findMany({
    where: { id: { in: account.deals.map((d) => d.dealId) } },
    orderBy: { companyName: "asc" },
    select: {
      id: true,
      companyName: true,
      displayName: true,
      contractSignedAt: true,
      docusealSubmissionId: true,
      tours: { where: { published: true }, orderBy: { createdAt: "asc" }, select: { slug: true, name: true, config: true, share: true, reviewToken: true } },
      invoices: {
        where: { sentAt: { not: null } },
        orderBy: { sentAt: "desc" },
        select: { id: true, amount: true, sentAt: true, dueDate: true, paidAt: true, dineroInvoiceNumber: true, dineroInvoiceGuid: true },
      },
    },
  });
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const tours = await Promise.all(
    deals.flatMap((d) =>
      d.tours.map(async (t) => {
        const share = shareOf(t.share);
        return { ...t, dealId: d.id, config: t.config as unknown as TourConfig, share, stats: await tourStats(t.slug, share.days) };
      })
    )
  );
  const papers = deals.filter((d) => (d.contractSignedAt && d.docusealSubmissionId) || d.invoices.length);
  const first = account.name?.split(" ")[0];

  return (
    <main className="min-h-screen bg-[#f5f5f7] px-4 pb-12 text-[#1d1d1f]" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif' }}>
      <header className="mx-auto flex max-w-[720px] items-center justify-between py-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Nextview360" className="h-7 w-auto" />
        <form action={logout}>
          <button type="submit" className="rounded-full px-3 py-1.5 text-[13px] font-medium text-[#6e6e73] hover:bg-black/5 hover:text-[#1d1d1f]">
            Log ud
          </button>
        </form>
      </header>

      <div className="mx-auto max-w-[720px] space-y-6">
        <section>
          <h1 className="text-[28px] font-bold tracking-tight">{first ? `Hej ${first}` : "Velkommen"}</h1>
          <p className="mt-1 text-[15px] text-[#6e6e73]">{deals.map((d) => dealName(d)).join(", ") || "Her finder I jeres tours, tal og papirer."}</p>
        </section>

        {tours.length === 0 && (
          <section className="rounded-2xl bg-white p-5 ring-1 ring-black/[.06]">
            <p className="text-[15px]">Jeres tour er ikke lagt ud endnu. Når den er klar, kan I se den og dens tal her.</p>
          </section>
        )}

        {tours.map((t) => (
          <section key={t.slug} className="space-y-4" style={{ ["--report-accent" as string]: t.config.colors.accent }}>
            <div className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-black/[.06]">
              <div className="flex h-12 w-20 flex-none items-center justify-center rounded-xl" style={{ background: t.config.logoOnLight ? "#f5f5f7" : t.config.colors.main }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.config.logo} alt="" className="max-h-8 max-w-[64px] object-contain" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[17px] font-semibold">{t.config.title || t.name}</h2>
                <a href={tourUrl(t.slug, origin)} target="_blank" rel="noopener" className="text-[13px] text-[#0071e3]">
                  Åbn touren ↗
                </a>
              </div>
              {t.reviewToken && (
                <a href={reviewUrl(t.reviewToken, origin)} target="_blank" rel="noopener" className="flex-none rounded-full bg-[#ffcc00] px-3.5 py-2 text-[13px] font-semibold text-[#1d1d1f]">
                  Giv feedback
                </a>
              )}
            </div>
            <CustomerReport stats={t.stats} share={t.share} brand={t.config.title} />
            <PortalEmbeds
              url={tourUrl(t.slug, origin)}
              title={t.config.title}
              size={t.config.embeds?.size}
              whole={t.config.embeds?.pages?._hele ?? null}
              places={startPlaces(t.config).map((p) => ({ key: p.key, name: p.name, group: p.group, page: t.config.embeds?.pages?.[p.key] ?? null }))}
            />
          </section>
        ))}

        {papers.length > 0 && (
          <section className="rounded-2xl bg-white ring-1 ring-black/[.06]">
            <h2 className="px-5 pt-5 text-[17px] font-semibold">Kontrakt og fakturaer</h2>
            {papers.map((d) => (
              <div key={d.id} className="px-5 pb-4 pt-3">
                {papers.length > 1 && <p className="mb-1 text-[13px] font-semibold text-[#6e6e73]">{dealName(d)}</p>}
                <ul className="divide-y divide-black/[.06]">
                  {d.contractSignedAt && d.docusealSubmissionId && (
                    <li className="flex items-center justify-between gap-3 py-2.5">
                      <span className="text-[15px]">
                        Kontrakt <span className="text-[13px] text-[#6e6e73]">underskrevet {date(d.contractSignedAt)}</span>
                      </span>
                      <a href={`/kunde/kontrakt/${d.id}`} className="text-[14px] font-medium text-[#0071e3]">
                        Hent PDF
                      </a>
                    </li>
                  )}
                  {d.invoices.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0 text-[15px]">
                        Faktura {i.dineroInvoiceNumber ?? ""} <span className="text-[13px] text-[#6e6e73]">{date(i.sentAt!)} · {kr(i.amount)}</span>{" "}
                        {i.paidAt ? (
                          <span className="ml-1 rounded-full bg-[#e3f5e8] px-2 py-0.5 text-[11px] font-semibold text-[#248a3d]">Betalt</span>
                        ) : i.dueDate ? (
                          <span className="ml-1 text-[12px] text-[#6e6e73]">forfalder {date(i.dueDate)}</span>
                        ) : null}
                      </span>
                      {i.dineroInvoiceGuid && (
                        <a href={`/kunde/faktura/${i.id}`} className="flex-none text-[14px] font-medium text-[#0071e3]">
                          Hent PDF
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}

        <section className="rounded-2xl bg-white p-5 ring-1 ring-black/[.06]">
          <h2 className="text-[17px] font-semibold">Brug for hjælp?</h2>
          <p className="mt-1 text-[15px] text-[#6e6e73]">Skriv eller ring, så hjælper vi - også med at sætte touren ind på jeres hjemmeside.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={`mailto:${WELCOME_MAIL_SENDER}`} className="rounded-full bg-[#0071e3] px-4 py-2 text-[14px] font-semibold text-white">
              {WELCOME_MAIL_SENDER}
            </a>
            <a href={`tel:+45${PHONE.replace(/\s/g, "")}`} className="rounded-full bg-[#f2f2f7] px-4 py-2 text-[14px] font-semibold text-[#1d1d1f]">
              {PHONE}
            </a>
          </div>
        </section>
        <p className="text-center text-[12px] text-[#8e8e93]">Nextview360 · tallene opdateres løbende</p>
      </div>
    </main>
  );
}
