import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSettingValue } from "@/lib/integration-settings";
import { listTours } from "@/lib/tours";
import { NewTour } from "./new-tour";
import { TourLab } from "./tour-lab";

export const metadata = { title: "Tour-lab" };

const when = (d: Date) => d.toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" });

/**
 * Our own tour front-end: the customers' tours (one engine, a setup per tour,
 * kept in the database) and, below, the tool for trying the Matterport SDK.
 */
export default async function TourLabPage() {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") redirect("/");
  const [tours, sdkKey] = await Promise.all([listTours(), getSettingValue("MATTERPORT_SDK_KEY")]);
  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Tours</h1>
            <p className="text-sm text-slate-500">Vores egne tours oven på Matterport - én motor, en opsætning pr. tour.</p>
          </div>
          <NewTour tours={tours.map((t) => ({ slug: t.slug, name: t.name }))} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tours.map((t) => (
            <div key={t.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <Link href={`/tour-lab/${t.slug}`} className="font-semibold text-slate-900 hover:text-indigo-600">
                {t.name}
              </Link>
              <div className="mt-1 text-sm text-slate-500">
                {t.deal ? (
                  <Link href={`/deals/${t.deal.id}`} className="hover:underline">
                    {t.deal.displayName ?? t.deal.companyName}
                  </Link>
                ) : (
                  <span className="italic">Ikke knyttet til en kunde</span>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                <span>/tour-lab/{t.slug}</span>
                <span>Ændret {when(t.updatedAt)}</span>
              </div>
              <div className="mt-3 flex gap-2">
                <Link href={`/tour-lab/${t.slug}/rediger`} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
                  Rediger
                </Link>
                <Link href={`/tour-lab/${t.slug}`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Åbn tour
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
      <TourLab sdkKey={sdkKey} />
    </div>
  );
}
