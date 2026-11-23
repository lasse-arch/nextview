import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { myDay, type MyDayItem } from "@/lib/my-day";

/*
 * Salg → Min dag: one seller's day on one page - today's targets (worked back
 * from their goal or the year's plan), meetings and filming, tasks, contracts
 * waiting and deals without a next step. Only their own (lib/my-day.ts).
 */
export default async function MinDagPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/session-ended?next=/arpo/min-dag");
  const d = await myDay(user);
  const hour = Number(new Intl.DateTimeFormat("da-DK", { hour: "numeric", hour12: false, timeZone: "Europe/Copenhagen" }).format(new Date()));
  const hello = hour < 10 ? "God morgen" : hour < 18 ? "Hej" : "God aften";
  const perDay = Math.max(1, Math.round(d.target.perDay));
  const perWeek = Math.max(1, Math.round(d.target.perWeek));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          {hello}, {user.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {d.weekday.charAt(0).toUpperCase() + d.weekday.slice(1)}. Her er din dag.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Goal label="Møder booket i dag" value={d.bookedToday} of={perDay} />
        <Goal label="Møder booket i denne uge" value={d.bookedWeek} of={perWeek} />
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Solgt i denne uge</div>
          <div className="mt-1 text-3xl font-semibold text-slate-900">{d.soldWeek}</div>
          <div className="mt-1 text-xs text-slate-500">{d.soldWeek === 1 ? "kunde" : "kunder"}</div>
        </div>
      </div>
      <p className="-mt-3 text-xs text-slate-500">Målene er regnet ud fra {d.target.source.charAt(0).toLowerCase() + d.target.source.slice(1)}.</p>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <div className="space-y-6">
          <Box title="I dag" empty="Ingen møder eller filmninger i dag. God tid til at ringe.">
            {[...d.meetings.map((m) => ({ ...m, tag: "Møde" })), ...d.filmings.map((f) => ({ ...f, tag: "Filmning" }))]
              .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""))
              .map((m) => (
                <Row key={`${m.tag}${m.id}`} item={m} left={<span className="w-12 shrink-0 text-sm font-semibold text-slate-900">{m.time}</span>} right={<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{m.tag}</span>} />
              ))}
          </Box>
          <Box title="Opgaver" empty="Ingen opgaver til i dag." href="/arpo/opgaver">
            {d.tasks.map((t) => (
              <Row key={t.id} item={t} right={t.late ? <span className="text-xs font-medium text-rose-700">{t.days === 1 ? "I går" : `${t.days} dage over`}</span> : <span className="text-xs text-slate-500">I dag</span>} />
            ))}
          </Box>
        </div>
        <div className="space-y-6">
          <Box title="Kontrakter der venter" empty="Ingen kontrakter ude lige nu." hint="Ring, hvis den har ligget i 3 dage.">
            {d.contracts.map((c) => (
              <Row key={c.id} item={c} right={<span className={`text-xs font-medium ${c.late ? "text-amber-700" : "text-slate-500"}`}>{c.days === 0 ? "Sendt i dag" : `${c.days} dage`}</span>} />
            ))}
          </Box>
          <Box title="Mangler et næste skridt" empty="Alle dine deals har et næste skridt." hint="Ring, eller lav en opgave med en dato.">
            {d.noNextStep.map((n) => (
              <Row key={n.id} item={n} right={<span className="text-xs text-slate-500">{n.days === 0 ? "I dag" : `${n.days} dage siden`}</span>} />
            ))}
          </Box>
          <Link href="/arpo/ringeliste" className="flex items-center justify-between rounded-xl bg-slate-900 p-4 text-white shadow-sm hover:bg-slate-800">
            <span>
              <span className="block text-sm font-semibold">Ringelisten</span>
              <span className="block text-xs text-slate-300">{d.leadsWaiting ? `${d.leadsWaiting} leads venter på at blive ringet op` : "Find nye leads at ringe til"}</span>
            </span>
            <span aria-hidden className="text-lg">→</span>
          </Link>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <h2 className="text-sm font-semibold text-slate-900">Dagens rytme</h2>
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <Rhythm when="Formiddag" what="Ring. De fleste tager telefonen før frokost." />
          <Rhythm when="Midt på dagen" what="Møder ude hos kunderne." />
          <Rhythm when="Eftermiddag" what="Følg op: kontrakter, opgaver og deals uden næste skridt." />
        </div>
      </section>
    </div>
  );
}

function Goal({ label, value, of }: { label: string; value: number; of: number }) {
  const pct = Math.min(100, Math.round((value / of) * 100));
  const done = value >= of;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold text-slate-900">{value}</span>
        <span className="text-sm text-slate-500">af {of}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${done ? "bg-emerald-600" : "bg-blue-600"}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-xs text-slate-500">{done ? "Nået" : `${of - value} mere`}</div>
    </div>
  );
}

function Box({ title, empty, hint, href, children }: { title: string; empty: string; hint?: string; href?: string; children: React.ReactNode[] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">
          {title} {children.length > 0 && <span className="ml-1 font-normal text-slate-400">{children.length}</span>}
        </h2>
        {href ? (
          <Link href={href} className="text-xs font-medium text-blue-600 hover:underline">
            Se alle
          </Link>
        ) : (
          hint && children.length > 0 && <span className="text-xs text-slate-500">{hint}</span>
        )}
      </div>
      {children.length ? <ul className="divide-y divide-slate-100">{children}</ul> : <p className="px-4 py-4 text-sm text-slate-500">{empty}</p>}
    </section>
  );
}

function Row({ item, left, right }: { item: MyDayItem; left?: React.ReactNode; right?: React.ReactNode }) {
  const body = (
    <>
      {left}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-900">{item.title}</span>
        {item.sub && <span className="block truncate text-xs text-slate-500">{item.sub}</span>}
      </span>
      {right}
    </>
  );
  return (
    <li>
      {item.dealId ? (
        <Link href={`/arpo/deals/${item.dealId}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
          {body}
        </Link>
      ) : (
        <div className="flex items-center gap-3 px-4 py-2.5">{body}</div>
      )}
    </li>
  );
}

function Rhythm({ when, what }: { when: string; what: string }) {
  return (
    <div className="rounded-lg bg-white p-3 ring-1 ring-inset ring-slate-200">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{when}</div>
      <div className="mt-1 text-slate-700">{what}</div>
    </div>
  );
}
