import type { DemoVisit } from "@/lib/demo-visits";

/** One visit on a showcase link - what they saw and did. Plain (no hooks), so it works on server and client pages alike. */

const when = (iso: string) =>
  new Date(iso).toLocaleString("da-DK", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Copenhagen",
  });
const duration = (s: number): string =>
  s < 60 ? `${Math.max(1, s)} sek.` : `${Math.round(s / 60)} min.`;

export function DemoVisitRow({ v }: { v: DemoVisit }) {
  return (
    <li className="rounded-lg bg-[#f5f5f7] px-2.5 py-2 text-[12.5px] leading-snug text-[#1d1d1f]">
      <span className="block font-medium">
        {when(v.start)} · {duration(v.seconds)} ·{" "}
        {v.device === "mobil" ? "mobil" : "computer"}
        {v.where ? ` · ${v.where}` : ""}
      </span>
      {v.from && <span className="block text-[#6e6e73]">Kom fra {v.from}</span>}
      {(v.features || v.tried.length > 0) && (
        <span className="block text-[#6e6e73]">
          Gennemgangen
          {v.features ? `: ${v.features.seen} af ${v.features.of}` : ""}
          {v.tried.length
            ? `${v.features ? " · " : ": "}så ${v.tried.join(", ")}`
            : ""}
        </span>
      )}
      {v.did.length > 0 && (
        <span className="block text-[#6e6e73]">Brugte {v.did.join(", ")}</span>
      )}
      {v.seen.length > 0 && (
        <span className="block text-[#6e6e73]">
          Så: {v.seen.slice(0, 12).join(" · ")}
          {v.seen.length > 12 ? ` + ${v.seen.length - 12} mere` : ""}
        </span>
      )}
      {!v.seen.length && !v.features && !v.tried.length && !v.did.length && (
        <span className="block text-[#6e6e73]">
          Åbnede linket, men gik ikke rundt endnu
        </span>
      )}
      {v.contact && (
        <span className="mt-0.5 block font-medium text-[#1f7a35]">
          ✓ Trykkede for at kontakte jer
        </span>
      )}
    </li>
  );
}

/** Seconds in all, as a seller reads it: "40 sek." / "3 min." */
export const visitTime = (s: number) =>
  s < 60 ? `${Math.max(1, s)} sek.` : `${Math.round(s / 60)} min.`;

/**
 * A chip that shows, on hover (or focus - keyboard and touch), what was seen
 * on one or more showcase links: the latest visits and a way into the tour's
 * own numbers. The padding bridges the gap, so the mouse can move into it.
 */
export function DemoVisitsHover({
  chip,
  links,
}: {
  chip: React.ReactNode;
  links: { slug: string; name: string; visits: DemoVisit[] }[];
}) {
  return (
    <span className="group relative">
      <span
        tabIndex={0}
        className="cursor-default rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 outline-none ring-1 ring-inset ring-emerald-600/15"
      >
        {chip}
      </span>
      <span className="invisible absolute right-0 top-full z-30 block w-[min(26rem,85vw)] pt-1.5 opacity-0 transition-opacity duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
        <span className="block max-h-[28rem] space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl">
          {links.map((l) => (
            <span key={l.slug} className="block">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <b className="text-[13px] font-semibold text-slate-900">
                  {l.name}
                </b>
                <span className="flex gap-3 text-xs font-medium">
                  <a
                    href={`/arpo/tour-lab/${l.slug}/rediger?fane=del`}
                    className="text-[#0071e3] hover:underline"
                  >
                    Alle besøg →
                  </a>
                  <a
                    href={`/arpo/tour-lab/${l.slug}/rediger?fane=resultater`}
                    className="text-[#0071e3] hover:underline"
                  >
                    Tourens stats →
                  </a>
                </span>
              </span>
              {l.visits.length > 0 && (
                <span className="mt-0.5 block text-xs text-slate-500">
                  {l.visits.length} besøg ·{" "}
                  {visitTime(l.visits.reduce((a, v) => a + v.seconds, 0))} i alt
                </span>
              )}
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
                  + {l.visits.length - 5} besøg mere under Alle besøg.
                </span>
              )}
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}
