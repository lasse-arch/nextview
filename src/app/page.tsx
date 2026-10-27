import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

/** "/" outside the website's own address: Arpo for the team. (On nextview360.dk, "/" is the website - see proxy.ts.) */
export default async function Home() {
  if (await getCurrentUser()) redirect("/arpo");
  redirect("/api/auth/session-ended");
}
