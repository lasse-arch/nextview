import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentCustomer, getCurrentUser } from "@/lib/auth";
import { logout } from "@/lib/actions/auth";
import { ToastProvider } from "@/components/toast";
import { SettingsMenu } from "./settings-menu";
import { SidebarNav, type SidebarNavItem } from "./sidebar-nav";
import { MobileNav } from "./mobile-nav";
import { PresentationModeToggle } from "./presentation-mode-toggle";
import { isPresentationMode } from "@/lib/presentation-mode";
import { NewsBell } from "./news-bell";
import { getUnreadNewsCount } from "@/lib/actions/news";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, presenting] = await Promise.all([getCurrentUser(), isPresentationMode()]);
  if (!user) redirect((await getCurrentCustomer()) ? "/kunde" : "/api/auth/session-ended?next=/arpo");

  const unreadNewsCount = await getUnreadNewsCount(user.id, user.newsReadAt ?? null);

  // The menu in named parts - what a seller uses every day first, the company's own pages and money last.
  const admin = user.role === "ADMIN";
  const navItems: SidebarNavItem[] = [
    {
      section: "Salg",
      items: [
        { href: "/arpo/deals", label: "Deals", icon: "deals" },
        { href: "/arpo/leadindbakke", label: "Leadindbakke", icon: "inbox" },
        { href: "/arpo/leadgeneration", label: "Leadgeneration", icon: "radar" },
        { href: "/arpo/ringeliste", label: "Ringeliste", icon: "phone" },
        { href: "/arpo/kalender", label: "Kalender", icon: "calendar" },
        { href: "/arpo/opgaver", label: "Opgaver", icon: "tasks" },
        { href: "/arpo/online-kunder", label: "Online kunder", icon: "tour" },
        { href: "/arpo/mailgenerator", label: "Mailgenerator", icon: "mail" },
      ],
    },
    { section: "Kunder", items: [{ href: "/arpo/kunder", label: "Live kunder", icon: "users" }] },
    {
      section: "Tours",
      items: admin
        ? [
            { href: "/arpo/tour-lab", label: "Tours", icon: "tour" },
            { href: "/arpo/tour-lab/personer", label: "Personer i scans", icon: "scanPeople" },
          ]
        : [],
    },
    {
      section: "Virksomheden",
      items: [
        { href: "/arpo/commission", label: "Provision", icon: "percent" },
        ...(user.canAccessBilling ? [{ href: "/arpo/stats", label: "Stats", icon: "stats" as const }] : []),
        ...(admin ? [{ href: "/arpo/vaekst", label: "Vækst", icon: "growth" as const }, { href: "/arpo/health", label: "Health", icon: "pulse" as const }] : []),
      ],
    },
    {
      section: "Betaling",
      items: user.canAccessBilling
        ? [
            { href: "/arpo/settings/dinero", label: "Fakturaer", icon: "receipt" },
            { href: "/arpo/settings/betaling", label: "Betalingsstatus", icon: "checkCircle" },
            { href: "/arpo/settings/betalingsservice", label: "Betalingsservice", icon: "bank" },
          ]
        : [],
    },
  ];

  const settingsItems = [
    { href: "/arpo/profile", label: "Min profil" },
    { href: "/arpo/deals/import", label: "Importér" },
    { href: "/arpo/settings/email", label: "E-mail" },
    { href: "/arpo/settings/email-templates", label: "E-mail-skabeloner" },
    { href: "/arpo/settings/docuseal", label: "Kontrakter" },
  ];
  if (user.role === "ADMIN") {
    settingsItems.push({ href: "/arpo/users", label: "Brugere" });
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
        <aside className="arpo-sidebar sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-slate-50 p-3 md:flex">
          <Link href="/arpo" className="flex items-center px-2.5 pb-3 pt-3">
            <Image src="/logo.png" alt="Nextview360" width={942} height={219} className="h-6 w-auto" priority />
          </Link>

          <SidebarNav items={navItems} />

          <div className="flex-1" />

          <SettingsMenu items={settingsItems} up />

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

          <div className="arpo-topbar flex items-center justify-end gap-2.5 px-4 pt-4 sm:px-6 md:px-10 md:pt-6">
            <NewsBell unreadCount={unreadNewsCount} />
            <PresentationModeToggle enabled={presenting} />
            <Link
              href="/arpo/deals/new"
              className="rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
            >
              + Ny lead
            </Link>
          </div>
          <main className="arpo-main flex-1 px-4 pb-10 pt-4 sm:px-6 md:px-10">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
