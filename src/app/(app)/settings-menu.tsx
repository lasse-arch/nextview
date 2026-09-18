"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconGear, IconChevronDown } from "./nav-icons";

export function SettingsMenu({ items }: { items: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const active = items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors ${
          active ? "bg-blue-50 font-semibold text-blue-600" : "font-medium text-slate-700 hover:bg-slate-100"
        }`}
      >
        <IconGear className={active ? "text-blue-600" : "text-slate-500"} />
        <span className="flex-1 text-left">Indstillinger</span>
        <IconChevronDown className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
