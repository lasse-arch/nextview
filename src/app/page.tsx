import { redirect } from "next/navigation";
import { getCurrentCustomer, getCurrentUser } from "@/lib/auth";

/** "/" outside the website's own address (on nextview360.dk, "/" is the website - see proxy.ts): Arpo for the team, their own page for customers. */
export default async function Home() {
  if (await getCurrentUser()) redirect("/arpo");
  if (await getCurrentCustomer()) redirect("/kunde");
  redirect("/api/auth/session-ended");
}
