import "server-only";
import { getTeamUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { teamCan } from "@/lib/team-roles";

/*
 * An admin on a customer's page ("Se som kunde", /kunde?som=<deal>) may do
 * everything the customer's owner may: invite and remove users, change the
 * statistics mail, approve a tour, draw a winner. Never a customer session at
 * the same time - the portal's actions take the customer when there is one,
 * and only otherwise ask this (a team admin, for that deal and its locations).
 */
export async function adminPreview(som: unknown): Promise<{ user: { id: string; name: string; email: string }; dealIds: string[] } | null> {
  if (typeof som !== "string" || !som || som.length > 40) return null;
  const user = await getTeamUser();
  if (!user || !teamCan(user, "admin")) return null;
  const deal = await prisma.deal.findUnique({ where: { id: som }, select: { id: true, branches: { select: { id: true } } } });
  return deal ? { user: { id: user.id, name: user.name, email: user.email }, dealIds: [deal.id, ...deal.branches.map((b) => b.id)] } : null;
}
