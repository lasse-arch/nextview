import type { TourEmbed } from "@/lib/tour-embeds";

/*
 * "Her er touren vist": each page showing the tour (its site and address),
 * when a visitor last opened it there and how many did in 90 days. The
 * addresses come from visitors' browsers - shown as text and opened as a
 * plain link only when they're web addresses.
 */

type Words = { empty: string; counts: (seen: number, used: number) => string; seen: (when: string) => string; today: string; yesterday: string; daysAgo: (n: number) => string; note: string };

export const EMBED_WORDS: Record<"da" | "en", Words> = {
  da: {
    empty: "Vi har ikke set touren vist på en anden side endnu. Når den er sat ind på jeres hjemmeside, og nogen åbner den dér, kommer siden her.",
    counts: (seen, used) => `${seen} så touren, ${used} brugte den (90 dage)`,
    note: "\"Så touren\": mindst halvdelen af touren var på skærmen i et sekund - ikke bare loadet nederst på siden. \"Brugte den\": trykkede, trak eller scrollede i touren.",
    seen: (w) => `senest ${w}`,
    today: "i dag",
    yesterday: "i går",
    daysAgo: (n) => `for ${n} dage siden`,
  },
  en: {
    empty: "We haven't seen the tour on another page yet. Once it's on your website and someone opens it there, the page shows up here.",
    counts: (seen, used) => `${seen} saw the tour, ${used} used it (90 days)`,
    note: "\"Saw the tour\": at least half of it was on the screen for a second - not just loaded further down the page. \"Used it\": tapped, dragged or scrolled in the tour.",
    seen: (w) => `last ${w}`,
    today: "today",
    yesterday: "yesterday",
    daysAgo: (n) => `${n} days ago`,
  },
};

export function TourEmbedList({ embeds, words }: { embeds: TourEmbed[]; words: Words }) {
  if (!embeds.length) return <p className="text-[13px] leading-snug text-[#8e8e93]">{words.empty}</p>;
  const when = (days: number) => (days <= 0 ? words.today : days === 1 ? words.yesterday : words.daysAgo(days));
  return (
    <>
      <ul className="divide-y divide-black/[.05]">
        {embeds.map((e) => {
          const path = e.url ? e.url.replace(/^https?:\/\/[^/]+/, "") || "/" : null;
          return (
            <li key={`${e.host}${e.url ?? ""}`} className="flex items-center gap-3 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#34c759]/12 text-[14px] text-[#1d7a35]" aria-hidden>
                ●
              </span>
              <span className="min-w-0 flex-1">
                {e.url ? (
                  <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="block truncate text-[14px] font-semibold text-[#0071e3] hover:underline">
                    {e.host}
                    {path && path !== "/" ? <span className="font-normal text-[#6e6e73]">{path}</span> : null}
                  </a>
                ) : (
                  <span className="block truncate text-[14px] font-semibold">{e.host}</span>
                )}
                <span className="block text-[12px] text-[#8e8e93]">
                  {words.seen(when(e.daysAgo))} · {words.counts(e.seen, e.used)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="pt-2 text-[12px] leading-snug text-[#8e8e93]">{words.note}</p>
    </>
  );
}
