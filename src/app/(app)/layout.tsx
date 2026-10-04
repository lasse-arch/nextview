import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "@/lib/actions/auth";
import { ToastProvider } from "@/components/toast";
import { SettingsMenu } from "./settings-menu";
import { SidebarNav, type SidebarNavItem, type SidebarNavLink } from "./sidebar-nav";
import { MobileNav } from "./mobile-nav";
import { PresentationModeToggle } from "./presentation-mode-toggle";
import { isPresentationMode } from "@/lib/presentation-mode";
import { NewsBell } from "./news-bell";
import { getUnreadNewsCount } from "@/lib/actions/news";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, presenting] = await Promise.all([getCurrentUser(), isPresentationMode()]);
  if (!user) redirect("/login");

  const unreadNewsCount = await getUnreadNewsCount(user.id, user.newsReadAt ?? null);

  // Company-level pages (commission, visitor stats, growth) grouped under
  // one collapsible "Virksomheden" entry, so the day-to-day sales pages
  // stay at the top of the sidebar.
  const companyItems: SidebarNavLink[] = [{ href: "/commission", label: "Provision", icon: "percent" }];
  if (user.canAccessBilling) {
    companyItems.push({ href: "/stats", label: "Stats", icon: "stats" });
  }
  if (user.role === "ADMIN") {
    companyItems.push({ href: "/vaekst", label: "Vækst", icon: "growth" });
  }

  const navItems: SidebarNavItem[] = [
    { href: "/", label: "Oversigt", icon: "home" },
    { href: "/deals", label: "Deals", icon: "deals" },
    { href: "/leadindbakke", label: "Leadindbakke", icon: "inbox" },
    { href: "/leadgeneration", label: "Leadgeneration", icon: "radar" },
    { href: "/ringeliste", label: "Ringeliste", icon: "phone" },
    { href: "/kunder-live", label: "Live kunder", icon: "users" },
    { href: "/kalender", label: "Kalender", icon: "calendar" },
    { href: "/opgaver", label: "Opgaver", icon: "tasks" },
    { label: "Virksomheden", icon: "building", children: companyItems },
  ];

  const settingsItems = [
    { href: "/profile", label: "Min profil" },
    { href: "/deals/import", label: "Importér" },
    { href: "/settings/email", label: "E-mail" },
    { href: "/settings/email-templates", label: "E-mail-skabeloner" },
    { href: "/settings/docuseal", label: "Kontrakter" },
  ];
  if (user.canAccessBilling) {
    settingsItems.push({ href: "/settings/dinero", label: "Fakturaer" }, { href: "/settings/betaling", label: "Betalingsstatus" });
  }
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
        <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-slate-50 p-3 md:flex">
          <Link href="/" className="flex items-center px-2.5 pb-6 pt-3">
            <Image src="/logo.png" alt="Nextview360" width={942} height={219} className="h-6 w-auto" priority />
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
          <MobileNav
            navItems={navItems}
            settingsItems={settingsItems}
            userName={user.name}
            userInitials={initials}
            userAvatarUrl={user.avatarUrl ?? null}
            logoutAction={logout}
          />

          <div className="flex items-center justify-end gap-2.5 px-4 pt-4 sm:px-6 md:px-10 md:pt-6">
            <NewsBell unreadCount={unreadNewsCount} />
            <PresentationModeToggle enabled={presenting} />
            <Link
              href="/deals/new"
              className="rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
            >
              + Ny lead
            </Link>
          </div>
          <main className="flex-1 px-4 pb-10 pt-4 sm:px-6 md:px-10">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
