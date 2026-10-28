import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentCustomer, getCurrentUser } from "@/lib/auth";
import { logout } from "@/lib/actions/auth";
import { prisma } from "@/lib/db";
import { dealName, needsDeliveryLink } from "@/lib/labels";
import { tourUrl } from "@/lib/public-urls";
import { tourStats, type TourStats } from "@/lib/tour-stats";
import { shareOf, shown } from "@/lib/tour-share";
import { mergeShare, mergeStats } from "@/lib/merge-stats";
import { parseContractProducts } from "@/lib/contract-template-data";
import { CustomerReport } from "@/app/arpo/tour-lab/[slug]/rediger/customer-report";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";
import { startPlaces } from "@/app/arpo/tour-lab/tours/places";
import { PortalEmbeds } from "@/app/r/[token]/embeds";
import { PHONE, WELCOME_MAIL_SENDER } from "@/lib/welcome-mail";
import { LangToggle, LocationSwitcher, ReviewLauncher, TourThumb, ApproveTour, ReportMailChoice } from "./portal-ui";
import { TourShare } from "./tour-share";
import { TEXT, type Lang } from "./text";

/*
 * The customer's own page, nextview360.dk/kunde - after logging in with the
 * link from their e-mail. Built like a merchant portal: a location picker at
 * the top (all locations together first, then each one), a menu (home,
 * statistics, the codes for their website, the contract, help), in Danish or
 * English. Only the deals the login was given access to in Arpo; invoices are
 * not here on purpose - they're e-mailed to the customer.
 * Everything is looked up from the login's own deals - the location in the
 * address is only ever picked from among those - so one customer can never
 * see another's.
 */

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Jeres side - Nextview360", robots: { index: false, follow: false } };

const PAGES = ["hjem", "tal", "hjemmeside", "tips", "rettelser", "kontrakt", "hjaelp"] as const;
type Page = (typeof PAGES)[number];

/**
 * Who the page is for: the logged-in customer - or, for an admin, "Se som
 * kunde" from a deal in Arpo (?som=<dealId>): exactly what that customer
 * sees (the deal and its locations, as access is given), with a bar saying so.
 */
async function viewer(som: string | undefined): Promise<{ dealIds: string[]; name: string | null; preview: { dealId: string } | null } | null> {
  const account = await getCurrentCustomer();
  if (account) {
    // "Sidst set" in Arpo's customer overview - at most one write every 10 minutes.
    if (!account.lastSeenAt || Date.now() - account.lastSeenAt.getTime() > 10 * 60_000) await prisma.customerAccount.update({ where: { id: account.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
    return { dealIds: account.deals.map((d) => d.dealId), name: account.name, preview: null };
  }
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/session-ended");
  if (user.role !== "ADMIN" || !som) redirect("/arpo");
  const deal = await prisma.deal.findUnique({ where: { id: som }, select: { id: true, contactName: true, branches: { select: { id: true } }, customerAccounts: { take: 1, orderBy: { createdAt: "asc" }, select: { account: { select: { name: true } } } } } });
  if (!deal) redirect("/arpo");
  return { dealIds: [deal.id, ...deal.branches.map((b) => b.id)], name: deal.customerAccounts[0]?.account.name ?? deal.contactName, preview: { dealId: deal.id } };
}

const fmtDate = (d: Date, lang: Lang) => d.toLocaleDateString(lang === "en" ? "en-GB" : "da-DK", { day: "numeric", month: "short", year: "numeric" });

export default async function CustomerPage({ searchParams }: { searchParams: Promise<{ som?: string; sted?: string; side?: string }> }) {
  const sp = await searchParams;
  const who = await viewer(sp.som);
  if (!who) redirect("/arpo");

  const deals = await prisma.deal.findMany({
    where: { id: { in: who.dealIds } },
    orderBy: { companyName: "asc" },
    select: {
      id: true,
      companyName: true,
      displayName: true,
      address: true,
      parentDealId: true,
      contractSignedAt: true,
      docusealSubmissionId: true,
      contractProducts: true,
      reportInterval: true,
      nextReportDueAt: true,
      invoiceEmail: true,
      contactEmail: true,
      items: { where: { url: { not: null } }, orderBy: { createdAt: "asc" }, select: { id: true, productType: true, location: true, url: true } },
      // Published tours - and one sent to them for review before it's published (only on Rettelser).
      tours: {
        where: { OR: [{ published: true }, { reviewSentAt: { not: null } }] },
        orderBy: { createdAt: "asc" },
        select: { slug: true, name: true, config: true, share: true, reviewToken: true, liveVersion: true, published: true, reviewSentAt: true, reviewApprovedAt: true },
      },
    },
  });

  // Language: what they picked (a cookie), else the language of their contract.
  const picked = (await cookies()).get("nv360_lang")?.value;
  const lang: Lang = picked === "en" || picked === "da" ? picked : deals.some((d) => parseContractProducts(d.contractProducts)?.language === "en") ? "en" : "da";
  const t = TEXT[lang];

  // The locations, and which one is chosen (only ever one of their own).
  const many = deals.length > 1;
  const sted = many && deals.some((d) => d.id === sp.sted) ? sp.sted! : null;
  const page: Page = (PAGES as readonly string[]).includes(sp.side ?? "") ? (sp.side as Page) : "hjem";
  const scope = sted ? deals.filter((d) => d.id === sted) : deals;
  const root = deals.find((d) => !d.parentDealId || !deals.some((x) => x.id === d.parentDealId)) ?? deals[0];
  const company = root ? dealName(root) : (who.name ?? "Nextview360");
  const href = (o: { side?: Page; sted?: string | null }) => {
    const q = new URLSearchParams();
    if (who.preview) q.set("som", who.preview.dealId);
    const s = o.sted === undefined ? sted : o.sted;
    if (s) q.set("sted", s);
    const p = o.side ?? page;
    if (p !== "hjem") q.set("side", p);
    const str = q.toString();
    return `/kunde${str ? `?${str}` : ""}`;
  };

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  // Their tours: ours (with numbers), and older ones still on explore (a link only).
  const reviewTours = scope.flatMap((d) =>
    d.tours.map((x) => ({ ...x, dealId: d.id, location: many ? dealName(d) : null, config: x.config as unknown as TourConfig, share: shareOf(x.share), url: tourUrl(x.slug, origin, x.liveVersion != null) }))
  );
  const tours = reviewTours.filter((x) => x.published);
  const older = scope.flatMap((d) =>
    d.tours.length
      ? []
      : d.items
          .filter((i) => needsDeliveryLink(i.productType) && !/hjemmeside/i.test(i.productType))
          .map((i) => ({ id: i.id, name: i.location ? `${dealName(d)} - ${i.location}` : dealName(d), url: /^https?:\/\//i.test(i.url!) ? i.url! : `https://${i.url}` }))
  );
  const needStats = page === "hjem" || page === "tal";
  const feedback =
    page === "rettelser" && reviewTours.length
      ? await prisma.tourFeedback.findMany({ where: { tourSlug: { in: reviewTours.map((x) => x.slug) } }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, tourSlug: true, kind: true, text: true, room: true, author: true, status: true, createdAt: true } })
      : [];
  const stats: TourStats[] = needStats ? await Promise.all(tours.map((x) => tourStats(x.slug, x.share.days))) : [];
  const together = needStats ? mergeStats(stats) : null;
  const togetherShare = mergeShare(tours.map((x) => x.share));
  const first = who.name?.split(" ")[0];

  const nav: [Page, string, React.ReactNode][] = [
    ["hjem", t.nav.hjem, <path key="i" d="M3 10.5 10 4l7 6.5V17a1 1 0 0 1-1 1h-3.5v-4.5h-5V18H4a1 1 0 0 1-1-1v-6.5Z" />],
    ["tal", t.nav.tal, <path key="i" d="M4 17V9m6 8V4m6 13v-6" strokeLinecap="round" />],
    ["hjemmeside", t.nav.hjemmeside, <path key="i" d="M3 5.5A1.5 1.5 0 0 1 4.5 4h11A1.5 1.5 0 0 1 17 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5v-9ZM3 8h14M8 11l-2 1.5L8 14m4-3 2 1.5-2 1.5" strokeLinejoin="round" />],
    ["tips", t.nav.tips, <path key="i" d="M10 2.5v2M4.7 4.7l1.4 1.4M2.5 10h2m11 0h2m-3.2-5.3-1.4 1.4M7.5 14.5h5M8 17.5h4M10 6.5a3.5 3.5 0 0 0-2 6.4v1.6h4v-1.6a3.5 3.5 0 0 0-2-6.4Z" strokeLinecap="round" strokeLinejoin="round" />],
    ["rettelser", t.nav.rettelser, <path key="i" d="M4 14.5V16h1.5l8.6-8.6-1.5-1.5L4 14.5Zm10.2-10.2 1.5 1.5M4 3.5h6m-6 3h3" strokeLinecap="round" strokeLinejoin="round" />],
    ["kontrakt", t.nav.kontrakt, <path key="i" d="M6 3h6l4 4v10H6V3Zm6 0v4h4M8.5 11h5m-5 3h5" strokeLinejoin="round" />],
    ["hjaelp", t.nav.hjaelp, <path key="i" d="M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Zm-2.2-9.6a2.3 2.3 0 0 1 4.4 1c0 1.5-2.2 1.9-2.2 3.3m0 2.3h.01" strokeLinecap="round" />],
  ];
  const card = "rounded-3xl bg-white p-5 sm:p-6";

  return (
    <div lang={lang} className="min-h-screen bg-[#f3f3f5] text-[#1d1d1f]" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif' }}>
      {who.preview && (
        <div className="sticky top-0 z-30 flex items-center justify-center gap-3 bg-[#1d1d1f] px-4 py-2.5 text-[13px] text-white">
          <span>{t.preview}</span>
          <a href={`/arpo/kunder/${who.preview.dealId}`} className="rounded-full bg-white/15 px-3 py-1 font-semibold hover:bg-white/25">
            {t.backToArpo}
          </a>
        </div>
      )}

      <header className="flex items-center gap-2 px-4 py-3 sm:gap-4 sm:px-6">
        <a href={href({ side: "hjem" })} className="shrink-0 sm:w-[196px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Nextview360" className="h-6 w-auto sm:h-7" />
        </a>
        <div className="min-w-0 flex-1">
          {many ? (
            <LocationSwitcher
              company={company}
              locations={deals.map((d) => ({ id: d.id, name: dealName(d), address: d.address }))}
              current={sted}
              hrefFor={Object.fromEntries([["all", href({ sted: null })], ...deals.map((d) => [d.id, href({ sted: d.id })])])}
              words={{ all: t.allLocations, search: t.searchLocations, none: t.noLocations }}
            />
          ) : (
            <p className="truncate px-2.5 text-[15px] font-semibold">{company}</p>
          )}
        </div>
        <LangToggle lang={lang} />
        <form action={logout} className={who.preview ? "hidden" : ""}>
          <button type="submit" className="rounded-full px-3 py-1.5 text-[13px] font-medium text-[#6e6e73] hover:bg-black/5 hover:text-[#1d1d1f]">
            {t.logout}
          </button>
        </form>
      </header>

      <div className="mx-auto flex max-w-[1240px] gap-6 px-4 pb-14 sm:px-6">
        {/* The menu: down the side on a computer, a row of tabs on a phone. */}
        <nav className="sticky top-4 hidden h-fit w-[196px] shrink-0 space-y-1 pt-2 md:block">
          {nav.map(([p, label, icon]) => (
            <a key={p} href={href({ side: p })} className={`flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[15px] font-semibold ${page === p ? "bg-white shadow-sm" : "text-[#3a3a3c] hover:bg-white/60"}`}>
              <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                {icon}
              </svg>
              {label}
            </a>
          ))}
        </nav>

        <main className="min-w-0 flex-1 space-y-5">
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:hidden">
            {nav.map(([p, label]) => (
              <a key={p} href={href({ side: p })} className={`shrink-0 rounded-full px-3.5 py-1.5 text-[14px] font-semibold ${page === p ? "bg-[#1d1d1f] text-white" : "bg-white text-[#3a3a3c]"}`}>
                {label}
              </a>
            ))}
          </div>

          {page === "hjem" && (
            <>
              <h1 className="pt-1 text-[30px] font-bold tracking-tight">{first ? t.hello(first) : t.welcome}</h1>
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                <div className="min-w-0 space-y-5">
                  <section className={card}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-[18px] font-bold tracking-tight">{t.overview}</h2>
                        <p className="text-[13px] text-[#6e6e73]">
                          {sted ? dealName(scope[0]) : many ? t.allTogether(deals.length) : company}
                          {together ? ` · ${t.lastDays(together.days)}` : ""}
                        </p>
                      </div>
                      {together && (
                        <a href={href({ side: "tal" })} aria-label={t.seeAll} className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f3f3f5] text-[#1d1d1f] hover:bg-[#e8e8ed]">
                          ↗
                        </a>
                      )}
                    </div>
                    {!together ? (
                      <p className="mt-4 rounded-2xl bg-[#f7f7f9] p-4 text-[15px] text-[#3a3a3c]">{tours.length || older.length ? t.noStatsYet : t.notLive}</p>
                    ) : together.visits === 0 ? (
                      <p className="mt-4 rounded-2xl bg-[#f7f7f9] p-4 text-[15px] text-[#3a3a3c]">{t.noVisits}</p>
                    ) : (
                      <>
                        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                          {(
                            [
                              [String(together.visits), t.visits, true],
                              [`${Math.round((together.engaged / together.visits) * 100)} %`, t.explored, togetherShare?.engaged],
                              [together.medianSeconds >= 60 ? `${Math.round(together.medianSeconds / 60)} min` : `${together.medianSeconds} s`, t.typical, togetherShare?.duration && together.medianSeconds >= 5],
                              [String(together.leads), t.leads, togetherShare && shown(togetherShare.leads, together.leads)],
                            ] as [string, string, boolean | undefined][]
                          )
                            .filter(([, , ok]) => ok)
                            .map(([v, l]) => (
                              <div key={l} className="rounded-2xl bg-[#f7f7f9] px-3.5 py-3">
                                <p className="text-[24px] font-bold tabular-nums tracking-tight">{v}</p>
                                <p className="text-[12px] leading-snug text-[#6e6e73]">{l}</p>
                              </div>
                            ))}
                        </div>
                        {togetherShare?.perDay && <Bars days={together.perDay} label={t.visits} />}
                      </>
                    )}
                  </section>

                  <section className={card}>
                    <div className="flex items-baseline justify-between">
                      <h2 className="text-[18px] font-bold tracking-tight">{t.yourTours}</h2>
                      <span className="text-[13px] text-[#6e6e73]">{t.tourCount(tours.length + older.length)}</span>
                    </div>
                    {tours.length + older.length === 0 ? (
                      <p className="mt-3 text-[15px] text-[#3a3a3c]">{t.notLive}</p>
                    ) : (
                      <ul className="mt-3 divide-y divide-black/[.06]">
                        {tours.map((x) => (
                          <li key={x.slug} className="flex items-center gap-3 py-3">
                            <TourThumb src={`/api/tour-thumb?tour=${encodeURIComponent(x.slug)}`} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[15px] font-semibold">{x.config.title || x.name}</p>
                              {x.location && <p className="truncate text-[13px] text-[#6e6e73]">{x.location}</p>}
                            </div>
                            <a href={x.url} target="_blank" rel="noopener" className="rounded-full bg-[#1d1d1f] px-3.5 py-1.5 text-[13px] font-semibold text-white">
                              {t.open} ↗
                            </a>
                          </li>
                        ))}
                        {older.map((x) => (
                          <li key={x.id} className="flex items-center gap-3 py-3">
                            <TourThumb src={`/api/tour-thumb?item=${x.id}`} />
                            <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">{x.name}</p>
                            <a href={x.url} target="_blank" rel="noopener" className="rounded-full bg-[#1d1d1f] px-3.5 py-1.5 text-[13px] font-semibold text-white">
                              {t.open} ↗
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>

                <div className="min-w-0 space-y-5">
                  <section className={card}>
                    <h2 className="text-[18px] font-bold tracking-tight">{t.getStarted}</h2>
                    <ul className="mt-3 space-y-2.5">
                      {t.tips.map(([title, text, to], i) => {
                        const body = (
                          <>
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eef3ff] text-[14px] font-bold text-[#0071e3]">{i + 1}</span>
                            <span className="min-w-0">
                              <span className="block text-[15px] font-semibold">{title}</span>
                              <span className="block text-[13px] leading-snug text-[#6e6e73]">{text}</span>
                            </span>
                          </>
                        );
                        return (
                          <li key={title}>
                            {to ? (
                              <a href={href({ side: to as Page })} className="flex gap-3 rounded-2xl bg-[#f7f7f9] p-3.5 hover:bg-[#efeff3]">
                                {body}
                              </a>
                            ) : (
                              <div className="flex gap-3 rounded-2xl bg-[#f7f7f9] p-3.5">{body}</div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                  <Contact t={t} card={card} />
                </div>
              </div>
            </>
          )}

          {page === "tal" && (
            <>
              <div className="pt-1">
                <h1 className="text-[30px] font-bold tracking-tight">{t.statsTitle}</h1>
                <p className="mt-1 text-[15px] text-[#6e6e73]">{t.statsLead}</p>
              </div>
              {root && (tours.length > 0 || older.length > 0) && (
                <section className={card}>
                  <h2 className="text-[18px] font-bold tracking-tight">{t.reportMail.title}</h2>
                  <p className="mb-3 mt-0.5 text-[14px] text-[#6e6e73]">{who.preview ? t.reportMail.preview : t.reportMail.lead}</p>
                  <ReportMailChoice current={root.reportInterval ?? "OFF"} disabled={Boolean(who.preview)} words={{ options: t.reportMail.options, saved: t.reportMail.saved }} />
                  <p className="text-[13px] text-[#6e6e73]">
                    {[
                      root.reportInterval && (root.invoiceEmail || root.contactEmail) && t.reportMail.to(root.invoiceEmail || root.contactEmail!),
                      root.reportInterval && root.nextReportDueAt && t.reportMail.next(fmtDate(root.nextReportDueAt, lang)),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </section>
              )}
              {!together || !togetherShare ? (
                <section className={card}>
                  <p className="text-[15px] text-[#3a3a3c]">{tours.length || older.length ? t.noStatsYet : t.notLive}</p>
                </section>
              ) : (
                <>
                  <section className={card}>
                    <CustomerReport stats={together} share={togetherShare} brand={sted ? dealName(scope[0]) : company} lang={lang} title={`${tours.length > 1 ? t.allTogether(tours.length).replace(/afdelinger|locations/, lang === "en" ? "tours" : "tours") : t.overview} · ${t.lastDays(together.days)}`} />
                  </section>
                  {tours.length > 1 && (
                    <>
                      <h2 className="px-1 pt-2 text-[18px] font-bold tracking-tight">{t.perTour}</h2>
                      {tours.map((x, i) => (
                        <details key={x.slug} className={`${card} group`}>
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                            <span className="min-w-0">
                              <span className="block truncate text-[16px] font-semibold">{x.config.title || x.name}</span>
                              {x.location && <span className="block truncate text-[13px] text-[#6e6e73]">{x.location}</span>}
                            </span>
                            <span className="text-[13px] tabular-nums text-[#6e6e73]">
                              {stats[i].visits} {t.visits.toLowerCase()} <span className="inline-block transition group-open:rotate-90">›</span>
                            </span>
                          </summary>
                          <div className="mt-4" style={{ ["--report-accent" as string]: x.config.colors.accent }}>
                            <CustomerReport stats={stats[i]} share={x.share} brand={x.config.title} lang={lang} />
                          </div>
                        </details>
                      ))}
                    </>
                  )}
                </>
              )}
            </>
          )}

          {page === "hjemmeside" && (
            <>
              <div className="pt-1">
                <h1 className="text-[30px] font-bold tracking-tight">{t.websiteTitle}</h1>
                <p className="mt-1 max-w-2xl text-[15px] text-[#6e6e73]">{t.websiteLead}</p>
              </div>
              {tours.length + older.length === 0 && (
                <section className={card}>
                  <p className="text-[15px]">{t.notLive}</p>
                </section>
              )}
              {tours.map((x) => (
                <section key={x.slug} className="space-y-3">
                  {tours.length + older.length > 1 && <h2 className="px-1 text-[18px] font-bold tracking-tight">{x.config.title || x.name}</h2>}
                  <PortalEmbeds
                    url={x.url}
                    title={x.config.title}
                    size={x.config.embeds?.size}
                    whole={x.config.embeds?.pages?._hele ?? null}
                    places={startPlaces(x.config).map((p) => ({ key: p.key, name: p.name, group: p.group, page: x.config.embeds?.pages?.[p.key] ?? null }))}
                    lang={lang}
                    heading={false}
                  />
                </section>
              ))}
              {older.map((x) => (
                <section key={x.id} className="space-y-3">
                  {tours.length + older.length > 1 && <h2 className="px-1 text-[18px] font-bold tracking-tight">{x.name}</h2>}
                  <PortalEmbeds url={x.url} title={x.name} places={[]} whole={null} lang={lang} heading={false} />
                </section>
              ))}
            </>
          )}

          {page === "rettelser" && (
            <>
              <div className="pt-1">
                <h1 className="text-[30px] font-bold tracking-tight">{t.fix.title}</h1>
                <p className="mt-1 max-w-2xl text-[15px] text-[#6e6e73]">{t.fix.lead}</p>
              </div>
              <section className={card}>
                {reviewTours.length + older.length === 0 ? (
                  <p className="text-[15px]">{t.notLive}</p>
                ) : (
                  <ul className="divide-y divide-black/[.06]">
                    {reviewTours.map((x) => (
                      <li key={x.slug} className="flex flex-wrap items-center gap-3 py-3">
                        <TourThumb src={`/api/tour-thumb?tour=${encodeURIComponent(x.slug)}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-semibold">{x.config.title || x.name}</p>
                          {x.location && <p className="truncate text-[13px] text-[#6e6e73]">{x.location}</p>}
                          {x.reviewSentAt && !x.reviewApprovedAt && <p className="text-[13px] font-medium text-[#a05a00]">{t.fix.waiting}</p>}
                        </div>
                        <ReviewLauncher slug={x.slug} title={x.config.title || x.name} words={{ open: t.fix.open, opening: t.fix.opening, hint: t.fix.windowHint, close: t.fix.close }} />
                        {(x.reviewSentAt || x.reviewApprovedAt) && (
                          <ApproveTour
                            slug={x.slug}
                            approved={x.reviewApprovedAt ? fmtDate(x.reviewApprovedAt, lang) : null}
                            preview={Boolean(who.preview)}
                            words={{ approve: t.fix.approve, confirm: t.fix.approveConfirm, approved: t.fix.approved, previewOnly: t.fix.previewOnly }}
                          />
                        )}
                      </li>
                    ))}
                    {older.map((x) => (
                      <li key={x.id} className="flex flex-wrap items-center gap-3 py-3">
                        <TourThumb src={`/api/tour-thumb?item=${x.id}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-semibold">{x.name}</p>
                          <p className="text-[13px] text-[#6e6e73]">{t.fix.older}</p>
                        </div>
                        <a href={`mailto:${WELCOME_MAIL_SENDER}?subject=${encodeURIComponent(x.name)}`} className="rounded-full bg-[#f3f3f5] px-4 py-2 text-[14px] font-semibold">
                          {WELCOME_MAIL_SENDER}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              {reviewTours.length > 0 && (
                <section className={card}>
                  <h2 className="text-[18px] font-bold tracking-tight">{t.fix.sent}</h2>
                  {feedback.length === 0 ? (
                    <p className="mt-2 text-[15px] text-[#6e6e73]">{t.fix.none}</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-black/[.06]">
                      {feedback.map((f) => (
                        <li key={f.id} className="flex gap-3 py-3">
                          <span className={`mt-0.5 h-fit shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${f.status === "done" ? "bg-[#34c759]/15 text-[#1d7a33]" : "bg-[#f3f3f5] text-[#6e6e73]"}`}>{t.fix.status[f.status] ?? f.status}</span>
                          <div className="min-w-0 flex-1">
                            <p className="whitespace-pre-line text-[15px] leading-snug">{f.text}</p>
                            <p className="mt-0.5 text-[12px] text-[#8e8e93]">
                              {[t.fix.kinds[f.kind] ?? f.kind, f.room, reviewTours.length > 1 ? (reviewTours.find((x) => x.slug === f.tourSlug)?.config.title ?? null) : null, f.author, fmtDate(f.createdAt, lang)].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </>
          )}

          {page === "tips" && (
            <>
              <div className="pt-1">
                <h1 className="text-[30px] font-bold tracking-tight">{t.use.title}</h1>
                <p className="mt-1 max-w-2xl text-[15px] text-[#6e6e73]">{t.use.lead}</p>
              </div>
              {tours.length + older.length === 0 ? (
                <section className={card}>
                  <p className="text-[15px]">{t.notLive}</p>
                </section>
              ) : (
                <section className={card}>
                  <h2 className="text-[18px] font-bold tracking-tight">{t.use.links}</h2>
                  <p className="mb-4 mt-1 text-[14px] leading-snug text-[#6e6e73]">{t.use.linksLead}</p>
                  <TourShare
                    tours={[
                      ...tours.map((x) => ({ key: x.slug, title: x.config.title || x.name, url: x.url, size: x.config.embeds?.size, places: startPlaces(x.config).map((p) => ({ key: p.key, name: p.name, group: p.group })) })),
                      ...older.map((x) => ({ key: x.id, title: x.name, url: x.url, places: [] })),
                    ]}
                    words={t.use.builder}
                  />
                </section>
              )}
              <section className={card}>
                <h2 className="text-[18px] font-bold tracking-tight">{t.use.ideasTitle}</h2>
                <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                  {t.use.ideas.map(([title, text]) => (
                    <div key={title} className="rounded-2xl bg-[#f7f7f9] p-4">
                      <p className="text-[15px] font-semibold">{title}</p>
                      <p className="mt-0.5 text-[13px] leading-snug text-[#6e6e73]">{text}</p>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {page === "kontrakt" && (
            <>
              <h1 className="pt-1 text-[30px] font-bold tracking-tight">{t.contractTitle}</h1>
              <section className={card}>
                {scope.filter((d) => d.contractSignedAt).length === 0 ? (
                  <p className="text-[15px] text-[#3a3a3c]">{t.noContract}</p>
                ) : (
                  <ul className="divide-y divide-black/[.06]">
                    {scope
                      .filter((d) => d.contractSignedAt)
                      .map((d) => (
                        <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                          <span className="min-w-0">
                            <span className="block text-[15px] font-semibold">{dealName(d)}</span>
                            <span className="block text-[13px] text-[#6e6e73]">{t.signed(fmtDate(d.contractSignedAt!, lang))}</span>
                          </span>
                          {d.docusealSubmissionId ? (
                            <a href={`/kunde/kontrakt/${d.id}`} className="rounded-full bg-[#1d1d1f] px-4 py-2 text-[14px] font-semibold text-white">
                              {t.download}
                            </a>
                          ) : (
                            <span className="max-w-sm text-[13px] text-[#6e6e73]">{t.oldContract}</span>
                          )}
                        </li>
                      ))}
                  </ul>
                )}
                <p className="mt-3 text-[13px] text-[#8e8e93]">{t.invoicesNote}</p>
              </section>
            </>
          )}

          {page === "hjaelp" && (
            <>
              <h1 className="pt-1 text-[30px] font-bold tracking-tight">{t.nav.hjaelp}</h1>
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                <section className={card}>
                  <h2 className="text-[18px] font-bold tracking-tight">{t.faqTitle}</h2>
                  <ul className="mt-2 divide-y divide-black/[.06]">
                    {t.faq.map(([q, a]) => (
                      <li key={q} className="py-3">
                        <p className="text-[15px] font-semibold">{q}</p>
                        <p className="mt-0.5 text-[14px] leading-snug text-[#6e6e73]">{a}</p>
                      </li>
                    ))}
                  </ul>
                </section>
                <Contact t={t} card={card} />
              </div>
            </>
          )}

          <p className="pt-2 text-center text-[12px] text-[#8e8e93]">{t.footer}</p>
        </main>
      </div>
    </div>
  );
}

function Contact({ t, card }: { t: (typeof TEXT)[Lang]; card: string }) {
  return (
    <section className={card}>
      <h2 className="text-[18px] font-bold tracking-tight">{t.help}</h2>
      <p className="mt-1 text-[14px] leading-snug text-[#6e6e73]">{t.helpText}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={`mailto:${WELCOME_MAIL_SENDER}`} className="rounded-full bg-[#0071e3] px-4 py-2 text-[14px] font-semibold text-white">
          {WELCOME_MAIL_SENDER}
        </a>
        <a href={`tel:+45${PHONE.replace(/\s/g, "")}`} className="rounded-full bg-[#f3f3f5] px-4 py-2 text-[14px] font-semibold text-[#1d1d1f]">
          {PHONE}
        </a>
      </div>
    </section>
  );
}

function Bars({ days, label }: { days: { day: string; visits: number }[]; label: string }) {
  const max = Math.max(1, ...days.map((d) => d.visits));
  return (
    <div className="mt-5 flex h-24 items-end gap-[3px]">
      {days.map((d) => (
        <div key={d.day} title={`${d.day}: ${d.visits} ${label.toLowerCase()}`} className="flex h-full flex-1 items-end">
          <div className="w-full rounded-t-[4px] bg-[#0071e3]" style={{ height: d.visits ? `${Math.max(4, (d.visits / max) * 100)}%` : 0, opacity: d.visits ? 1 : 0 }} />
        </div>
      ))}
    </div>
  );
}
