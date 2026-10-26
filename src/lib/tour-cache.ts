import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { loadTour } from "@/app/(app)/tour-lab/[slug]/load";
import type { TourConfig } from "@/app/(app)/tour-lab/tours/types";

/*
 * Published tours on customers' sites are read from a cache, not the database
 * on every visit: faster, and a tour keeps working through a database outage
 * (the last good copy is served while a refresh fails). Every change to a
 * tour drops its copy at once (tourChanged), and the copy refreshes by
 * itself hourly too - for live availability and anything changed outside
 * Arpo's own actions.
 */

const tag = (slug: string) => `tour:${slug}`;

async function published(slug: string): Promise<TourConfig | null> {
  const row = await prisma.tour.findUnique({ where: { slug }, select: { slug: true, config: true, published: true } });
  return row?.published ? { ...(row.config as unknown as TourConfig), slug: row.slug } : null;
}

/** A published tour's setup and everything it needs (null when it isn't published). */
export function publicTour(slug: string) {
  return unstable_cache(
    async () => {
      const setup = await published(slug);
      return setup ? loadTour(setup) : null;
    },
    ["public-tour", slug],
    { tags: [tag(slug)], revalidate: 3600 }
  )();
}

/** A tour was changed: its cached public copy is dropped, so the next visit gets the change. */
export function tourChanged(...slugs: string[]) {
  for (const slug of slugs) revalidateTag(tag(slug), { expire: 0 });
}
