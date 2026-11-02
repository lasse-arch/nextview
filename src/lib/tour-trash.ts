import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/*
 * The papirkurv's one way in: a tour, with its versions and Cloudflare
 * publications, kept whole as a DeletedTour (restorable for 30 days) - and
 * removed from the tours. Returned as the two database steps, so a caller can
 * put them in the same transaction as what it does next (a tour started over
 * puts its new one in, under the same address).
 */
export async function trashSteps(slug: string, byName: string): Promise<Prisma.PrismaPromise<unknown>[] | null> {
  const tour = await prisma.tour.findUnique({ where: { slug }, include: { versions: true, publications: true } });
  if (!tour) return null;
  const { versions, publications, ...row } = tour;
  return [
    prisma.deletedTour.create({ data: { slug, name: tour.name, deletedByName: byName, data: JSON.parse(JSON.stringify({ tour: row, versions, publications })) as Prisma.InputJsonValue } }),
    prisma.tour.delete({ where: { id: tour.id } }),
  ];
}
