import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { peopleFindings } from "@/lib/actions/tour-people";
import { PeopleReview } from "./review";

// A dozen scans per call, each looked at by nextviewAI twice - give it time.
export const maxDuration = 300;

export const metadata = { title: "Personer i scans" };

/** Scans with people in them, across all tours: check them, and hide or keep each one. */
export default async function PeoplePage() {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") redirect("/");
  return <PeopleReview initial={await peopleFindings()} />;
}
