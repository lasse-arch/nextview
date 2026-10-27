import { redirect } from "next/navigation";

/** The customer list moved to /arpo/kunder (each customer has its own page under it). */
export default function OldLiveCustomers() {
  redirect("/arpo/kunder");
}
