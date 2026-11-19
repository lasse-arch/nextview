import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { teamCan } from "@/lib/team-roles";
import { onlineTours, toursInProgress } from "@/lib/online-tours";
import { OnlineTours } from "./online-tours";
import { ToursInProgress } from "./in-progress";

export const metadata = { title: "Online kunder" };

/*
 * "Online kunder" (Salg): every tour that's out there, by industry - so a
 * seller about to meet a campsite finds a campsite tour to show in seconds,
 * and shows it in a big window right there. Our own tours from Arpo, and the
 * tour links on live customers that are still on explore. No money here.
 * "Tours i gang": the ones being built (sellers and admins), to follow and look at.
 */
export default async function OnlineCustomersPage({ searchParams }: { searchParams: Promise<{ fane?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/session-ended?next=/arpo");
  const mayFollow = teamCan(user, "sales") || teamCan(user, "admin");
  const inProgress = mayFollow && (await searchParams).fane === "i-gang";
  const tab = (on: boolean) => `rounded-lg px-4 py-1.5 text-sm font-medium transition ${on ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`;

  return (
    <div className="space-y-5">
      {mayFollow && (
        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          <Link href="/arpo/online-kunder" className={tab(!inProgress)}>
            Online
          </Link>
          <Link href="/arpo/online-kunder?fane=i-gang" className={tab(inProgress)}>
            Tours i gang
          </Link>
        </div>
      )}
      {inProgress ? (
        <>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Tours i gang</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">De tours, vi bygger lige nu: hvor langt de er, hvem der bygger dem, og hvornår de skal være klar. Tryk &quot;Se touren&quot; for at se den, som den er nu.</p>
          </div>
          <ToursInProgress tours={await toursInProgress()} today={new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen" }).format(new Date())} />
        </>
      ) : (
        <OnlineTours tours={await onlineTours()} isAdmin={user.role === "ADMIN"} />
      )}
    </div>
  );
}
