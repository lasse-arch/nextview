import "server-only";
import { createHash } from "node:crypto";
import { revalidateTag, unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { loadTour } from "@/app/arpo/tour-lab/[slug]/load";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

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

/**
 * The review link's tour (/p/<token>): as it is in Arpo right now, published
 * or not - but read through the same cache as the published ones (by its last
 * change), so the customer gets the tour at the speed it will have, not a
 * slower one built from scratch on every visit. A saved change ("Gem") shows
 * at once; the editor's autosaved, unsaved changes never do.
 */
export async function reviewTour(token: string) {
  const row = await prisma.tour.findUnique({ where: { reviewToken: token }, select: { slug: true, config: true } });
  if (!row) return null;
  const setup = { ...(row.config as unknown as TourConfig), slug: row.slug };
  // Keyed by the setup itself (not the row's last change - the editor's autosave changes that without changing the tour).
  const version = createHash("sha1").update(JSON.stringify(row.config)).digest("hex").slice(0, 16);
  return unstable_cache(() => loadTour(setup), ["review-tour", row.slug, version], { tags: [tag(row.slug)], revalidate: 3600 })();
}

/** A tour was changed: its cached public copy is dropped, so the next visit gets the change. */
export function tourChanged(...slugs: string[]) {
  for (const slug of slugs) revalidateTag(tag(slug), { expire: 0 });
}
