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
const duration = (s: number) =>
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
