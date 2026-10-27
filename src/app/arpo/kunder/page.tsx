import Link from "next/link";
import { customerCards, forPicker, type CustomerCard } from "@/lib/customer-cards";
import { DealItemPill } from "./deal-item-pill";
import { CustomerPicker, Thumb } from "./customer-picker";

export const metadata = { title: "Kunder" };

/*
 * The customers: find one fast (the picker - type a few letters), or browse
 * the live ones, those on their way, or those who stopped. A customer opens
 * their overview; a product pill opens the product itself. No amounts here,
 * so it can be shown in a meeting.
 */

const TABS: { key: CustomerCard["state"]; label: string }[] = [
  { key: "live", label: "Live" },
  { key: "coming", label: "På vej" },
  { key: "stopped", label: "Stoppet" },
];

const city = (address: string | null) => address?.split(",").pop()?.replace(/\d{4}/, "").trim() || null;
const since = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" }) : null);

/** Customers that went live in the last 30 days. */
function liveLastMonth(cards: CustomerCard[]): number {
  const month = Date.now() - 30 * 86_400_000;
  return cards.filter((c) => c.state === "live" && c.liveAt && new Date(c.liveAt).getTime() > month).length;
}

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ vis?: string }> }) {
  const { vis } = await searchParams;
  const tab = TABS.find((t) => t.key === vis)?.key ?? "live";
  const all = await customerCards();
  const shown = all.filter((c) => c.state === tab);
  const count = (s: CustomerCard["state"]) => all.filter((c) => c.state === s).length;
  const fresh = liveLastMonth(all);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">Kunder</h1>
        <p className="mt-1 text-sm text-slate-500">
          {count("live")} live{fresh ? ` · ${fresh} ny${fresh > 1 ? "e" : ""} den sidste måned` : ""}
          {count("coming") ? ` · ${count("coming")} på vej` : ""}
        </p>
      </div>

      <CustomerPicker customers={forPicker(all)} variant="hero" />

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "live" ? "/arpo/kunder" : `/arpo/kunder?vis=${t.key}`}
            className={`-mb-px border-b-2 px-3 pb-2.5 text-sm font-medium transition ${tab === t.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {t.label} <span className="text-slate-400">{count(t.key)}</span>
          </Link>
        ))}
      </div>

      <ul className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80">
        {shown.map((c) => (
          <li key={c.id} className="group relative flex flex-col gap-3 border-b border-slate-100 px-4 py-3.5 transition last:border-0 hover:bg-slate-50/70 sm:flex-row sm:items-center">
            <Link href={`/arpo/kunder/${c.id}`} className="flex min-w-0 flex-1 items-center gap-4">
              <Thumb src={c.thumb} name={c.name} size="lg" />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold text-slate-900 group-hover:underline">{c.name}</span>
                <span className="block truncate text-[13px] text-slate-500">
                  {[c.state === "live" && since(c.liveAt) ? `Live siden ${since(c.liveAt)}` : null, city(c.address), c.industry].filter(Boolean).join(" · ")}
                </span>
                {c.hasLogin && <span className="mt-1 inline-block rounded bg-[#0071e3]/8 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-[#0058b0]">Har login til kundesiden</span>}
              </span>
            </Link>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {c.products.length === 0 && <span className="text-xs text-slate-400">Ingen produkter tilføjet</span>}
              {c.products.map((item) => (
                <DealItemPill key={item.id} item={item} />
              ))}
              <Link href={`/arpo/kunder/${c.id}`} aria-hidden tabIndex={-1} className="hidden pl-1 text-lg text-slate-300 group-hover:text-slate-500 sm:block">
                ›
              </Link>
            </div>
          </li>
        ))}
        {shown.length === 0 && <li className="px-5 py-10 text-center text-sm text-slate-400">Ingen kunder her.</li>}
      </ul>
    </div>
  );
}
