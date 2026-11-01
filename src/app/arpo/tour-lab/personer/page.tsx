import { redirect } from "next/navigation";
import { getTeamUser } from "@/lib/auth";
import { teamCan } from "@/lib/team-roles";
import { peopleFindings } from "@/lib/actions/tour-people";
import { PeopleReview } from "./review";

// A dozen scans per call, each looked at by nextviewAI twice - give it time.
export const maxDuration = 300;

export const metadata = { title: "Personer i scans" };

/** Scans with people in them, across all tours: check them, and hide or keep each one. */
export default async function PeoplePage() {
  const user = await getTeamUser();
  if (!user || !teamCan(user, "tours")) redirect("/arpo");
  return <PeopleReview initial={await peopleFindings()} />;
}
