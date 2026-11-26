import Link from "next/link";

/** Mine opgaver / Min tilgængelighed / Planlægning (admin) - the filming pages, like Planday's schedule tabs. */
export function FilmTabs({ at, admin }: { at: "opgaver" | "ledig" | "plan"; admin: boolean }) {
  const tabs: [typeof at, string, string][] = [
    ["opgaver", "Mine opgaver", "/arpo/filmninger"],
    ["ledig", "Min tilgængelighed", "/arpo/filmninger/ledig"],
    ...(admin ? ([["plan", "Planlægning", "/arpo/filmninger/plan"]] as [typeof at, string, string][]) : []),
  ];
  return (
    <nav className="mb-5 flex gap-1 rounded-xl bg-[#f2f2f7] p-1">
      {tabs.map(([k, label, href]) => (
        <Link key={k} href={href} className={`flex-1 rounded-lg px-3 py-2 text-center text-[14px] font-medium ${at === k ? "bg-white text-[#1d1d1f] shadow-sm" : "text-[#6e6e73] hover:text-[#1d1d1f]"}`}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
