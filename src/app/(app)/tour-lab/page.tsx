import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSettingValue } from "@/lib/integration-settings";
import { TourLab } from "./tour-lab";

export const metadata = { title: "Tour-lab" };

/**
 * Prototype of our own tour front-end: an overview picture (3D drawing or
 * drone photo) with points we place ourselves - clicking one jumps into the
 * Matterport tour at that exact spot, or opens a 360° (drone) photo. Lets us
 * try how it feels with a real tour before building it properly.
 */
export default async function TourLabPage() {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") redirect("/");
  return <TourLab sdkKey={await getSettingValue("MATTERPORT_SDK_KEY")} />;
}
