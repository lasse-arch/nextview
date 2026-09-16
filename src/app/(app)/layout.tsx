import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "@/lib/actions/auth";
import { ToastProvider } from "@/components/toast";
import { SettingsMenu } from "./settings-menu";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const navItems = [
    { href: "/", label: "Dashboard" },
    { href: "/deals", label: "Deals" },
    { href: "/deals/import", label: "Importér" },
    { href: "/commission", label: "Provision" },
  ];
  if (user.role === "ADMIN") {
    navItems.push({ href: "/vaekst", label: "Vækst" });
  }

  const settingsItems = [
    { href: "/settings/email", label: "E-mail" },
    { href: "/settings/pandadoc", label: "Kontrakter" },
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
      <div className="flex min-h-screen flex-col">
        <header className="border-b border-slate-200 bg-white shadow-sm">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <div className="flex items-center gap-8">
              <span className="text-lg font-semibold tracking-tight text-slate-900">Nextview360</span>
              <nav className="flex items-center gap-5 text-sm font-medium text-slate-500">
                {navItems.map((item) => (
                  <Link key={item.href} href={item.href} className="transition-colors hover:text-slate-900">
                    {item.label}
                  </Link>
                ))}
                <SettingsMenu items={settingsItems} />
              </nav>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/deals/new"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
              >
                + Ny lead
              </Link>
              <div className="flex items-center gap-3 text-sm text-slate-600">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                  {initials}
                </span>
                <span>{user.name}</span>
                <form action={logout}>
                  <button type="submit" className="text-slate-400 transition-colors hover:text-slate-900">
                    Log ud
                  </button>
                </form>
              </div>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      </div>
    </ToastProvider>
  );
}
