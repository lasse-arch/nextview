import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { onlineTours } from "@/lib/online-tours";
import { OnlineTours } from "./online-tours";

export const metadata = { title: "Online kunder" };

/*
 * "Online kunder" (Salg): every tour that's out there, by industry - so a
 * seller about to meet a campsite finds a campsite tour to show in seconds,
 * and shows it in a big window right there. Our own tours from Arpo, and the
 * tour links on live customers that are still on explore. No money here.
 */
export default async function OnlineCustomersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/session-ended?next=/arpo");

  const list = await onlineTours();

  return <OnlineTours tours={list} isAdmin={user.role === "ADMIN"} />;
}
