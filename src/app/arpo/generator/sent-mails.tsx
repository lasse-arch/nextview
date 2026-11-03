import { prisma } from "@/lib/db";
import { teamCan } from "@/lib/team-roles";
import type { getCurrentUser } from "@/lib/auth";
import Link from "next/link";
import { demoVisits } from "@/lib/demo-visits";
import { DemoVisitRow } from "@/components/demo-visit";

/*
 * Generator → Mail → Sendt: the mails sent from here, newest first - whether
 * they were opened (the mail's tracking pixel: shown once the recipient's mail
 * shows pictures, so "ikke åbnet" can also mean pictures were off) and whether
 * a showcase link in them was clicked (visits on that link) - and, unfolded,
 * what they looked at on each link, with a way into the tour's own numbers.
 * A seller sees their own, an admin everyone's.
 */

const when = (d: Date) =>
  d.toLocaleString("da-DK", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Copenhagen",
  });

export async function SentMails({
  user,
}: {
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
}) {
  const mails = await prisma.salesMail.findMany({
    where: {
      finalHow: "sendt",
      ...(teamCan(user, "admin") ? {} : { userId: user.id }),
    },
    orderBy: { finalAt: "desc" },
    take: 30,
    select: {
      id: true,
      userName: true,
      finalSubject: true,
      finalAt: true,
      sentTo: true,
      sentCc: true,
      trackingId: true,
      openedAt: true,
      lastOpenedAt: true,
      openCount: true,
      demoTokens: true,
      input: true,
    },
  });
  const tokens = [...new Set(mails.flatMap((m) => m.demoTokens))];
  const links = tokens.length
    ? await prisma.tourDemoLink.findMany({
        where: { token: { in: tokens } },
        select: {
          token: true,
          tourSlug: true,
          events: {
            select: {
              session: true,
              name: true,
              label: true,
              device: true,
              city: true,
              country: true,
              referrer: true,
              createdAt: true,
            },
          },
        },
      })
    : [];
  const tourNames = new Map(
    (
      await prisma.tour.findMany({
        where: { slug: { in: [...new Set(links.map((l) => l.tourSlug))] } },
        select: { slug: true, name: true },
      })
    ).map((t) => [t.slug, t.name]),
  );
  const byToken = new Map(
    links.map((l) => [
      l.token,
      {
        slug: l.tourSlug,
        name: tourNames.get(l.tourSlug) ?? l.tourSlug,
        events: l.events,
        visits: demoVisits(l.events),
      },
    ]),
  );
  if (!mails.length) return null;
  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Sendt</h2>
      <ul className="mt-3 divide-y divide-slate-100">
        {mails.map((m) => {
          const ev = m.demoTokens.flatMap((t) => byToken.get(t)?.events ?? []);
          const sent = m.demoTokens
            .map((t) => byToken.get(t))
            .filter((l): l is NonNullable<typeof l> => Boolean(l));
          const clicks = new Set(ev.map((e) => e.session)).size;
          const lastClick = ev.reduce<Date | null>(
            (a, e) => (!a || e.createdAt > a ? e.createdAt : a),
            null,
          );
          const to =
            m.sentTo ||
            (m.input as { company?: string; name?: string } | null)?.company ||
            "";
          return (
            <li key={m.id} className="py-2.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">
                  <b className="font-medium text-slate-900">{to}</b>
                  {m.sentCc && (
                    <span className="text-slate-400"> (CC: {m.sentCc})</span>
                  )}
                  <span className="text-slate-500">
                    {" "}
                    · {m.finalSubject} · {m.finalAt ? when(m.finalAt) : ""} ·{" "}
                    {m.userName}
                  </span>
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {!m.trackingId ? (
                    <span className="text-xs text-slate-400">
                      Sendt før åbninger blev talt
                    </span>
                  ) : m.openedAt ? (
                    <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-600/15">
                      Åbnet {m.openCount} gang{m.openCount === 1 ? "" : "e"} ·
                      sidst {when(m.lastOpenedAt ?? m.openedAt)}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">
                      Ikke åbnet endnu
                    </span>
                  )}
                  {m.demoTokens.length > 0 &&
                    (clicks ? (
                      <span className="group relative">
                        <span
                          tabIndex={0}
                          className="cursor-default rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/15 outline-none"
                        >
                          Link åbnet {clicks} gang{clicks === 1 ? "" : "e"}
                          {lastClick ? ` · sidst ${when(lastClick)}` : ""}
                        </span>
                        {/* What they looked at - on hover (or focus, for keyboard and touch). The padding bridges the gap, so the mouse can move into it. */}
                        <span className="invisible absolute right-0 top-full z-30 block w-[min(26rem,85vw)] pt-1.5 opacity-0 transition-opacity duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                          <span className="block max-h-[28rem] space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl">
                            {sent.map((l) => (
                              <span key={l.slug} className="block">
                                <span className="flex flex-wrap items-center justify-between gap-2">
                                  <b className="text-[13px] font-semibold text-slate-900">
                                    {l.name}
                                  </b>
                                  <span className="flex gap-3 text-xs font-medium">
                                    <Link
                                      href={`/arpo/tour-lab/${l.slug}/rediger?fane=del`}
                                      className="text-[#0071e3] hover:underline"
                                    >
                                      Alle besøg →
                                    </Link>
                                    <Link
                                      href={`/arpo/tour-lab/${l.slug}/rediger?fane=resultater`}
                                      className="text-[#0071e3] hover:underline"
                                    >
                                      Tourens stats →
                                    </Link>
                                  </span>
                                </span>
                                {l.visits.length ? (
                                  <ul className="mt-1.5 space-y-1.5">
                                    {l.visits.slice(0, 5).map((v) => (
                                      <DemoVisitRow key={v.session} v={v} />
                                    ))}
                                  </ul>
                                ) : (
                                  <span className="mt-1 block text-xs text-slate-400">
                                    Ikke åbnet endnu.
                                  </span>
                                )}
                                {l.visits.length > 5 && (
                                  <span className="mt-1 block text-xs text-slate-400">
                                    + {l.visits.length - 5} besøg mere under
                                    Alle besøg.
                                  </span>
                                )}
                              </span>
                            ))}
                          </span>
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">
                        Link ikke åbnet
                      </span>
                    ))}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-slate-400">
        Åbnet tælles, når modtagerens mailprogram viser billeder - nogle viser
        dem aldrig, andre henter dem af sig selv. Link åbnet er
        fremvisningslinkene i mailen.
      </p>
    </section>
  );
}
