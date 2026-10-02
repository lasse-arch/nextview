"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export function CommissionFilters({
  sellers,
  monthOptions,
  selectedSellerId,
  selectedMonth,
  isAdmin,
}: {
  sellers: { id: string; name: string }[];
  monthOptions: { value: string; label: string }[];
  selectedSellerId: string;
  selectedMonth: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === "all") next.delete(key);
    else next.set(key, value);
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {isAdmin && (
        <select
          value={selectedSellerId}
          onChange={(e) => updateParam("seller", e.target.value)}
          className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-700"
        >
          <option value="all">Alle sælgere</option>
          {sellers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
      <select
        value={selectedMonth}
        onChange={(e) => updateParam("month", e.target.value)}
        className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-700"
      >
        <option value="all">Alle måneder</option>
        {monthOptions.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
    </div>
  );
}
