import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { healthChecks, tourVisits, type Status } from "@/lib/health";
import { AutoRefresh } from "./auto-refresh";

/*
 * Health: is everything working, and how many are looking at the tours -
 * right now, the last day, 7 and 30 days, across every tour that's out
 * there. Admins only; refreshes itself every 30 seconds.
 */

export const dynamic = "force-dynamic";

const DOT: Record<Status, string> = { ok: "bg-[#34c759]", warn: "bg-[#ff9f0a]", down: "bg-[#ff3b30]", off: "bg-slate-300" };
const WORD: Record<Status, string> = { ok: "Kører", warn: "Advarsel", down: "Nede", off: "Slået fra" };
const num = (n: number) => n.toLocaleString("da-DK");

export default async function HealthPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/session-ended?next=/arpo");
  if (user.role !== "ADMIN") redirect("/arpo");
  const [groups, visits] = await Promise.all([healthChecks(), tourVisits()]);
  const checks = groups.flatMap((g) => g.checks);
  const down = checks.filter((c) => c.status === "down");
  const warn = checks.filter((c) => c.status === "warn");
  const at = new Date().toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Copenhagen" });

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <AutoRefresh seconds={30} />
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Health</h1>
          <p className="mt-1 text-sm text-slate-500">Status på systemer, integrationer og tours. Opdateres hvert 30. sekund.</p>
        </div>
        <p className="text-xs text-slate-400">Tjekket {at}</p>
      </div>

      <div className={`flex items-center gap-3 rounded-2xl px-5 py-4 ${down.length ? "bg-[#fff1f0] text-[#c4271d]" : warn.length ? "bg-[#fff6e5] text-[#9a5b00]" : "bg-[#eaf8ee] text-[#1f7a3a]"}`}>
        <span className={`h-3 w-3 shrink-0 rounded-full ${down.length ? DOT.down : warn.length ? DOT.warn : DOT.ok}`} />
        <p className="text-[15px] font-semibold">
          {down.length ? `${down.map((c) => c.name).join(", ")} virker ikke lige nu` : warn.length ? `Alt kører, men tjek ${warn.map((c) => c.name).join(", ")}` : "Alle systemer kører"}
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[.08em] text-slate-400">Tours</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["Lige nu", visits.total.now, true],
              ["Sidste døgn", visits.total.day, false],
              ["7 dage", visits.total.week, false],
              ["30 dage", visits.total.month, false],
            ] as const
          ).map(([label, value, live]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                {live && <span className={`h-2 w-2 rounded-full ${value ? "animate-pulse bg-[#34c759]" : "bg-slate-300"}`} />}
                {label}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{num(value)}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400">Besøg på alle udgivne tours. Et besøg er én fane i en browser; &quot;lige nu&quot; er de sidste 5 minutter.</p>

        {visits.tours.length > 0 && (
          <ul className="mt-4 space-y-2">
            {visits.tours.map((t) => (
              <li key={t.slug} className="flex items-center gap-4 overflow-hidden rounded-xl border border-slate-200 bg-white pr-4">
                <span className={`w-1.5 self-stretch ${t.now ? "bg-[#34c759]" : t.day ? "bg-[#0071e3]" : "bg-slate-200"}`} />
                <div className="min-w-0 flex-1 py-3">
                  <p className="truncate text-[15px] font-medium text-slate-900">{t.name}</p>
                  <p className="text-xs text-slate-400">/{t.slug}</p>
                </div>
                <div className="grid grid-cols-4 gap-4 text-right tabular-nums">
                  {[
                    [t.now, "nu"],
                    [t.day, "døgn"],
                    [t.week, "7 d."],
                    [t.month, "30 d."],
                  ].map(([v, l]) => (
                    <div key={l as string} className="w-11">
                      <p className={`text-[17px] font-semibold ${l === "nu" && v ? "text-[#1f7a3a]" : "text-slate-900"}`}>{num(v as number)}</p>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">{l}</p>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {groups.map((g) => (
        <section key={g.title}>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[.08em] text-slate-400">{g.title}</h2>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {g.checks.map((c) => (
              <li key={c.name} className="flex items-center gap-3 px-4 py-3">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[c.status]}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-slate-900">{c.name}</p>
                  <p className="truncate text-xs text-slate-500">{c.detail}</p>
                </div>
                <span className="shrink-0 text-xs text-slate-400">
                  {WORD[c.status]}
                  {c.ms != null && c.status !== "off" ? ` · ${c.ms} ms` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
