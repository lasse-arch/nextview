import type { TourStats } from "@/lib/tour-stats";
import { shown, type ReportShare } from "@/lib/tour-share";

/*
 * The customer's report: exactly the numbers chosen to be shared - the same
 * component in the editor's preview and on the customer's link, so what we
 * see is what they get.
 */

const pct = (n: number) => `${Math.round(n * 100)} %`;
const duration = (s: number) => (s < 60 ? `${s} sek` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} sek` : ""}`);
const label = (l: string) => (l === "phone" ? "Ringede" : l === "email" ? "Skrev en mail" : l === "direkte" ? "Direkte (link/QR)" : l);

function Ranked({ rows }: { rows: { label: string; count: number }[] }) {
  const max = rows[0]?.count ?? 1;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex justify-between gap-3 text-[13px]">
            <span className="truncate">{label(r.label)}</span>
            <span className="tabular-nums text-[#6e6e73]">{r.count}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-[#f2f2f7]">
            <div className="h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: "var(--report-accent, #0071e3)" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CustomerReport({ stats, share, brand }: { stats: TourStats; share: ReportShare; brand: string }) {
  const leads = shown(share.leads, stats.leads);
  const actions = shown(share.actions, stats.leads) && stats.actions.length > 0;
  const max = Math.max(1, ...stats.perDay.map((d) => d.visits));
  const tiles = [
    share.visits && [String(stats.visits), "besøg"],
    share.engaged && [pct(stats.visits ? stats.engaged / stats.visits : 0), "gik på opdagelse i touren"],
    share.duration && stats.medianSeconds >= 5 && [duration(stats.medianSeconds), "typisk besøg"],
  ].filter(Boolean) as [string, string][];
  const card = "rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,.04)] ring-1 ring-black/[.05]";
  return (
    <div className="space-y-3">
      <div className="px-1">
        <div className="text-[13px] text-[#6e6e73]">Jeres virtuelle tour · seneste {stats.days} dage</div>
        <div className="text-[20px] font-semibold tracking-tight">{brand}</div>
      </div>
      {leads && (
        <div className={card}>
          <div className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">{stats.leads}</div>
          <p className="mt-1 text-[14px] leading-snug">
            besøgende gik videre til booking eller kontakt fra touren{stats.visits ? <span className="text-[#6e6e73]"> - {pct(stats.leads / stats.visits)} af besøgene</span> : null}.
          </p>
        </div>
      )}
      {tiles.length > 0 && (
        <div className={`grid gap-2 ${tiles.length === 3 ? "grid-cols-3" : tiles.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
          {tiles.map(([v, t]) => (
            <div key={t} className="rounded-xl bg-white px-3 py-2.5 ring-1 ring-black/[.05]">
              <div className="text-[19px] font-semibold tabular-nums tracking-tight">{v}</div>
              <div className="text-[12px] leading-snug text-[#6e6e73]">{t}</div>
            </div>
          ))}
        </div>
      )}
      {share.perDay && (
        <div className={card}>
          <div className="mb-2 text-[13px] font-medium text-[#6e6e73]">Besøg pr. dag</div>
          <div className="flex h-20 items-end gap-[2px]">
            {stats.perDay.map((d) => (
              <div key={d.day} title={`${d.day}: ${d.visits} besøg`} className="flex h-full flex-1 items-end">
                <div className="w-full rounded-t-[3px]" style={{ height: d.visits ? `${Math.max(4, (d.visits / max) * 100)}%` : 0, background: "var(--report-accent, #0071e3)" }} />
              </div>
            ))}
          </div>
        </div>
      )}
      {actions && (
        <div className={card}>
          <div className="mb-2 text-[13px] font-medium text-[#6e6e73]">Det, besøgende gik videre til</div>
          <Ranked rows={stats.actions} />
        </div>
      )}
      {share.places && stats.places.length > 0 && (
        <div className={card}>
          <div className="mb-2 text-[13px] font-medium text-[#6e6e73]">Mest sete steder</div>
          <Ranked rows={stats.places} />
        </div>
      )}
      {share.sources && stats.sources.length > 0 && (
        <div className={card}>
          <div className="mb-2 text-[13px] font-medium text-[#6e6e73]">Hvor besøgene kom fra</div>
          <Ranked rows={stats.sources} />
        </div>
      )}
    </div>
  );
}
