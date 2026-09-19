"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SidebarNav, type SidebarNavItem } from "./sidebar-nav";
import { SettingsMenu } from "./settings-menu";
import { IconMenu, IconX } from "./nav-icons";

export function MobileNav({
  navItems,
  settingsItems,
  userName,
  userInitials,
  userAvatarUrl,
  logoutAction,
}: {
  navItems: SidebarNavItem[];
  settingsItems: { href: string; label: string }[];
  userName: string;
  userInitials: string;
  userAvatarUrl: string | null;
  logoutAction: () => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 md:hidden">
        <Link href="/" className="flex items-center">
          <Image src="/logo.png" alt="Nextview360" width={942} height={219} className="h-6 w-auto" priority />
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Åbn menu"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100"
        >
          <IconMenu />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative flex h-full w-72 max-w-[80vw] flex-col overflow-y-auto bg-slate-50 p-3 shadow-xl">
            <div className="flex items-center justify-between px-2.5 pb-5 pt-2">
              <Link href="/" onClick={() => setOpen(false)} className="flex items-center">
                <Image src="/logo.png" alt="Nextview360" width={942} height={219} className="h-6 w-auto" priority />
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Luk menu"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <IconX />
              </button>
            </div>

            <SidebarNav items={navItems} onNavigate={() => setOpen(false)} />

            <div className="my-2.5 mx-1.5 h-px bg-slate-200" />

            <SettingsMenu items={settingsItems} onNavigate={() => setOpen(false)} />

            <div className="flex-1" />

            <div className="flex items-center gap-2.5 border-t border-slate-200 px-2.5 pt-3">
              {userAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={userAvatarUrl} alt={userName} className="h-7 w-7 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
                  {userInitials}
                </span>
              )}
              <span className="flex-1 truncate text-[13px] font-medium text-slate-900">{userName}</span>
              <form action={logoutAction}>
                <button type="submit" className="text-[12px] text-slate-400 transition-colors hover:text-slate-900">
                  Log ud
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
