import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { healthChecks, tourSpeed, tourVisits, type Status } from "@/lib/health";
import { AutoRefresh } from "./auto-refresh";
import { BackupNow } from "./backup-now";

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
  const [groups, visits, speed] = await Promise.all([healthChecks(), tourVisits(), tourSpeed().catch(() => null)]);
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
          // Folded by default - one line per tour gets long with hundreds of customers. Most visited first.
          <details className="group mt-4">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[14px] font-medium text-slate-900 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
              <span className="text-slate-400 transition-transform group-open:rotate-90">›</span>
              Hver tour for sig
              <span className="font-normal text-slate-400">
                · {visits.tours.length} tours{visits.tours.some((t) => t.now) ? ` · ${visits.tours.filter((t) => t.now).length} med besøgende lige nu` : ""}
              </span>
            </summary>
          <ul className="mt-2 space-y-2">
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
          </details>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[.08em] text-slate-400">Tourenes hastighed (7 dage)</h2>
        {speed && speed.all.length ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              {speed.all.map((a) => (
                <div key={a.device} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-xs font-medium capitalize text-slate-500">{a.device}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{a.median.toLocaleString("da-DK")} sek.</p>
                  <p className={`text-xs ${a.slow > 6 ? "text-[#c4271d]" : a.slow > 4 ? "text-[#9a5b00]" : "text-slate-400"}`}>
                    De langsomste 10 %: {a.slow.toLocaleString("da-DK")} sek. · {num(a.visits)} besøg
                  </p>
                </div>
              ))}
            </div>
            <details className="group mt-3">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[14px] font-medium text-slate-900 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                <span className="text-slate-400 transition-transform group-open:rotate-90">›</span>
                Hver tour - de langsomste først
              </summary>
              <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {speed.tours.map((t) => (
                  <li key={`${t.slug}-${t.device}`} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{t.name}</span>
                    <span className="w-16 text-xs capitalize text-slate-400">{t.device}</span>
                    <span className="w-24 text-right tabular-nums text-slate-900">{t.median.toLocaleString("da-DK")} sek.</span>
                    <span className={`w-28 text-right tabular-nums ${t.slow > 6 ? "text-[#c4271d]" : t.slow > 4 ? "text-[#9a5b00]" : "text-slate-500"}`}>10 %: {t.slow.toLocaleString("da-DK")} sek.</span>
                    <span className="w-14 text-right text-xs tabular-nums text-slate-400">{num(t.visits)}</span>
                  </li>
                ))}
              </ul>
            </details>
          </>
        ) : null}
        <p className="mt-2 text-xs text-slate-400">Tiden fra en besøgende åbner touren, til den er klar at bruge - målt hos rigtige besøgende (ikke os selv i Arpo). Typisk besøg og de 10 % langsomste.</p>
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
                {c.name === "Natlig backup" && <BackupNow />}
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
