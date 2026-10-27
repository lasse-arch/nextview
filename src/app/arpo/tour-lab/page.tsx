import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSettingValue } from "@/lib/integration-settings";
import { leadsByTour } from "@/lib/tour-stats";
import { listTours } from "@/lib/tours";
import { NewTour } from "./new-tour";
import { TourLab } from "./tour-lab";
import { ToursList, type TourRow } from "./tours-list";
import { DetachAll } from "./detach-all";
import type { TourConfig } from "./tours/types";


/** Claude may take a minute or two to build or change a tour. */
export const maxDuration = 300;
export const metadata = { title: "Tour-lab" };


/**
 * Our own tour front-end: the customers' tours (one engine, a setup per tour,
 * kept in the database) and, below, the tool for trying the Matterport SDK.
 */
/** A picture that says which tour it is: its cover photo, a place's photo, or its logo on its own colour. */
function picture(c: TourConfig): { image: string; logo: boolean } {
  const photo = c.cover?.image && c.cover.image !== c.logo ? c.cover.image : c.places?.[0]?.image;
  return photo ? { image: photo, logo: false } : { image: c.logo, logo: true };
}

export default async function TourLabPage() {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") redirect("/arpo");
  const [tours, sdkKey, results] = await Promise.all([listTours(), getSettingValue("MATTERPORT_SDK_KEY"), leadsByTour(30)]);
  const mpskinsLeft = tours.filter((t) => (t.config as unknown as TourConfig).tourPage).length;
  const rows: TourRow[] = tours.map((t) => {
    const c = t.config as unknown as TourConfig;
    const pic = picture(c);
    return {
      slug: t.slug,
      name: t.name,
      customer: t.deal ? (t.deal.displayName ?? t.deal.companyName) : null,
      dealId: t.deal?.id ?? null,
      image: pic.image,
      logo: pic.logo,
      background: pic.logo && c.logoOnLight ? "#f5f5f7" : c.colors.main,
      published: t.published,
      updatedAt: t.updatedAt.toISOString(),
      visits: results[t.slug]?.visits ?? 0,
      leads: results[t.slug]?.leads ?? 0,
    };
  });
  return (
    <div className="space-y-6" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif' }}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-[#1d1d1f]">Tours</h1>
          <p className="text-[14px] text-[#6e6e73]">{tours.length} tours · tryk på en for at redigere den.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/arpo/tour-lab/personer" className="rounded-full bg-white px-4 py-2 text-[14px] font-medium text-[#1d1d1f] ring-1 ring-black/[.08] hover:bg-[#f5f5f7]">
            Personer i scans
          </Link>
          <NewTour tours={tours.map((t) => ({ slug: t.slug, name: t.name }))} />
        </div>
      </div>

      {mpskinsLeft > 0 && <DetachAll count={mpskinsLeft} />}

      <ToursList rows={rows} />

      <details className="rounded-2xl bg-white/60 px-4 py-3 ring-1 ring-black/[.05]">
        <summary className="cursor-pointer select-none text-[14px] text-[#6e6e73]">Udviklerværktøjer (Matterport SDK-nøgle og testværktøj)</summary>
        <div className="mt-4">
          <TourLab sdkKey={sdkKey} />
        </div>
      </details>
    </div>
  );
}
