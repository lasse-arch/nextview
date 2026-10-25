import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettingValue } from "@/lib/integration-settings";
import { ensureToursSeeded } from "@/lib/tours";
import type { TourConfig } from "../../tours/types";
import { TourEditor } from "./editor";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return { title: `Rediger tour – ${(await params).slug}` };
}

/** The tour editor: a tour's whole setup, with a live preview and its versions. */
export default async function TourEditPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") redirect("/");
  await ensureToursSeeded().catch(() => {});
  const tour = await prisma.tour.findUnique({
    where: { slug: (await params).slug },
    select: {
      slug: true,
      config: true,
      deal: { select: { id: true, companyName: true, displayName: true } },
      versions: { orderBy: { createdAt: "desc" }, take: 40, select: { id: true, note: true, createdByName: true, createdAt: true } },
    },
  });
  if (!tour) notFound();
  return (
    <TourEditor
      slug={tour.slug}
      initial={tour.config as unknown as TourConfig}
      deal={tour.deal ? { id: tour.deal.id, name: tour.deal.displayName ?? tour.deal.companyName } : null}
      aiReady={Boolean(process.env.ANTHROPIC_API_KEY || (await getSettingValue("ANTHROPIC_API_KEY")))}
      versions={tour.versions.map((v) => ({ id: v.id, note: v.note, by: v.createdByName, at: v.createdAt.toISOString() }))}
    />
  );
}
