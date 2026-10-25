import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSettingValue } from "@/lib/integration-settings";
import { listTours } from "@/lib/tours";
import { NewTour } from "./new-tour";
import { TourLab } from "./tour-lab";
import type { TourConfig } from "./tours/types";


/** Claude may take a minute or two to build or change a tour. */
export const maxDuration = 300;
export const metadata = { title: "Tour-lab" };

const when = (d: Date) => d.toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" });

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
  if (user?.role !== "ADMIN") redirect("/");
  const [tours, sdkKey] = await Promise.all([listTours(), getSettingValue("MATTERPORT_SDK_KEY")]);
  // One customer can have several tours (one for each step of the customer journey) - shown together.
  const groups = new Map<string, typeof tours>();
  for (const t of tours) {
    const c = t.config as unknown as TourConfig;
    const key = t.deal ? (t.deal.displayName ?? t.deal.companyName) : c.brand;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return (
    <div className="space-y-10" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif' }}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-[#1d1d1f]">Tours</h1>
          <p className="text-[14px] text-[#6e6e73]">Tryk på en tour for at redigere den.</p>
        </div>
        <NewTour tours={tours.map((t) => ({ slug: t.slug, name: t.name }))} />
      </div>

      {[...groups].map(([customer, list]) => {
        const deal = list.find((t) => t.deal)?.deal;
        return (
          <section key={customer}>
            <div className="mb-3 flex items-baseline gap-2">
              <h2 className="text-[17px] font-semibold text-[#1d1d1f]">{customer}</h2>
              {deal ? (
                <Link href={`/deals/${deal.id}`} className="text-[13px] text-[#0071e3] hover:underline">
                  Kunde ↗
                </Link>
              ) : (
                <span className="text-[13px] text-[#8e8e93]">Ikke knyttet til en kunde</span>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {list.map((t) => {
                const c = t.config as unknown as TourConfig;
                const pic = picture(c);
                return (
                  <div key={t.id} className="group relative overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,.06)] ring-1 ring-black/[.05] transition hover:shadow-[0_12px_30px_rgba(0,0,0,.12)]">
                    <Link href={`/tour-lab/${t.slug}/rediger`} className="block">
                      <div className="relative aspect-[16/10] overflow-hidden" style={{ background: pic.logo && c.logoOnLight ? "#f5f5f7" : c.colors.main }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={pic.image}
                          alt=""
                          className={pic.logo ? "absolute inset-0 m-auto max-h-[40%] max-w-[55%] object-contain" : "h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"}
                        />
                      </div>
                      <div className="px-4 py-3">
                        <div className="truncate text-[15px] font-medium text-[#1d1d1f]">{t.name}</div>
                        <div className="text-[12px] text-[#8e8e93]">Ændret {when(t.updatedAt)}</div>
                      </div>
                    </Link>
                    <a
                      href={`/tour-lab/${t.slug}`}
                      target="_blank"
                      rel="noopener"
                      className="absolute right-3 top-3 rounded-full bg-black/45 px-3 py-1 text-[12px] font-medium text-white opacity-0 backdrop-blur-md transition hover:bg-black/60 group-hover:opacity-100"
                    >
                      Åbn tour ↗
                    </a>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <details className="rounded-2xl bg-white/60 px-4 py-3 ring-1 ring-black/[.05]">
        <summary className="cursor-pointer select-none text-[14px] text-[#6e6e73]">Udviklerværktøjer (Matterport SDK-nøgle og testværktøj)</summary>
        <div className="mt-4">
          <TourLab sdkKey={sdkKey} />
        </div>
      </details>
    </div>
  );
}
