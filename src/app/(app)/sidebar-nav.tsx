"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cloneElement, type ReactElement } from "react";

export type SidebarNavItem = {
  href: string;
  label: string;
  icon: ReactElement<{ className?: string }>;
};

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ items, onNavigate }: { items: SidebarNavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors ${
              active ? "bg-blue-50 font-semibold text-blue-600" : "font-medium text-slate-700 hover:bg-slate-100"
            }`}
          >
            {cloneElement(item.icon, { className: active ? "text-blue-600" : "text-slate-500" })}
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
