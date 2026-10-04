"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cloneElement, useState, type ReactElement } from "react";
import { IconChevronDown } from "./nav-icons";

export type SidebarNavLink = {
  href: string;
  label: string;
  icon: ReactElement<{ className?: string }>;
};

/** A collapsible group of links (e.g. "Virksomheden" holding Provision/Stats/
 * Vækst) - folds open inline in the sidebar rather than as a popover, so its
 * pages stay one click away with their own icons, like top-level items. */
export type SidebarNavGroup = {
  label: string;
  icon: ReactElement<{ className?: string }>;
  children: SidebarNavLink[];
};

export type SidebarNavItem = SidebarNavLink | SidebarNavGroup;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, onNavigate, nested }: { item: SidebarNavLink; onNavigate?: () => void; nested?: boolean }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`flex items-center gap-2.5 rounded-lg py-2 text-[13.5px] transition-colors ${nested ? "pl-5 pr-2.5" : "px-2.5"} ${
        active ? "bg-blue-50 font-semibold text-blue-600" : "font-medium text-slate-700 hover:bg-slate-100"
      }`}
    >
      {cloneElement(item.icon, { className: active ? "text-blue-600" : "text-slate-500" })}
      {item.label}
    </Link>
  );
}

function NavGroup({ group, onNavigate }: { group: SidebarNavGroup; onNavigate?: () => void }) {
  const pathname = usePathname();
  const containsActive = group.children.some((c) => isActive(pathname, c.href));
  // Always open while on one of its own pages, so the current page is never
  // hidden; otherwise opened/closed by clicking the heading.
  const [toggledOpen, setToggledOpen] = useState(false);
  const open = containsActive || toggledOpen;

  function toggle() {
    setToggledOpen(!open);
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        disabled={containsActive}
        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors hover:bg-slate-100 ${
          containsActive ? "font-semibold text-slate-900" : "font-medium text-slate-700"
        }`}
      >
        {cloneElement(group.icon, { className: "text-slate-500" })}
        <span className="flex-1 text-left">{group.label}</span>
        <IconChevronDown className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-0.5 flex flex-col gap-0.5">
          {group.children.map((child) => (
            <NavLink key={child.href} item={child} onNavigate={onNavigate} nested />
          ))}
        </div>
      )}
    </div>
  );
}

export function SidebarNav({ items, onNavigate }: { items: SidebarNavItem[]; onNavigate?: () => void }) {
  return (
    <div className="flex flex-col gap-0.5">
      {items.map((item) =>
        "children" in item ? (
          item.children.length > 0 && <NavGroup key={item.label} group={item} onNavigate={onNavigate} />
        ) : (
          <NavLink key={item.href} item={item} onNavigate={onNavigate} />
        )
      )}
    </div>
  );
}
