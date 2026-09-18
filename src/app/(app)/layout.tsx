import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "@/lib/actions/auth";
import { ToastProvider } from "@/components/toast";
import { SettingsMenu } from "./settings-menu";
import { SidebarNav, type SidebarNavItem } from "./sidebar-nav";
import { PresentationModeToggle } from "./presentation-mode-toggle";
import { isPresentationMode } from "@/lib/presentation-mode";
import { IconHome, IconDeals, IconUsers, IconPercent, IconGrowth } from "./nav-icons";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, presenting] = await Promise.all([getCurrentUser(), isPresentationMode()]);
  if (!user) redirect("/login");

  const navItems: SidebarNavItem[] = [
    { href: "/", label: "Oversigt", icon: <IconHome /> },
    { href: "/deals", label: "Deals", icon: <IconDeals /> },
    { href: "/kunder-live", label: "Live kunder", icon: <IconUsers /> },
    { href: "/commission", label: "Provision", icon: <IconPercent /> },
  ];
  if (user.role === "ADMIN") {
    navItems.push({ href: "/vaekst", label: "Vækst", icon: <IconGrowth /> });
  }

  const settingsItems = [
    { href: "/profile", label: "Min profil" },
    { href: "/deals/import", label: "Importér" },
    { href: "/settings/email", label: "E-mail" },
    { href: "/settings/docuseal", label: "Kontrakter" },
    { href: "/settings/dinero", label: "Fakturaer" },
  ];
  if (user.role === "ADMIN") {
    settingsItems.push({ href: "/users", label: "Brugere" });
  }

  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <ToastProvider>
      <div className="flex min-h-screen" data-presentation={presenting ? "true" : "false"}>
        <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-slate-50 p-3">
          <Link href="/" className="flex items-center gap-2.5 px-2.5 pb-5 pt-2">
            <span className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">
              N
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-slate-900">Nextview360</span>
          </Link>

          <SidebarNav items={navItems} />

          <div className="my-2.5 mx-1.5 h-px bg-slate-200" />

          <SettingsMenu items={settingsItems} />

          <div className="flex-1" />

          <div className="flex items-center gap-2.5 border-t border-slate-200 px-2.5 pt-3">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt={user.name} className="h-7 w-7 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
                {initials}
              </span>
            )}
            <span className="flex-1 truncate text-[13px] font-medium text-slate-900">{user.name}</span>
            <form action={logout}>
              <button type="submit" className="text-[12px] text-slate-400 transition-colors hover:text-slate-900">
                Log ud
              </button>
            </form>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-end gap-2.5 px-10 pt-6">
            <PresentationModeToggle enabled={presenting} />
            <Link
              href="/deals/new"
              className="rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
            >
              + Ny lead
            </Link>
          </div>
          <main className="flex-1 px-10 pb-10 pt-4">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
