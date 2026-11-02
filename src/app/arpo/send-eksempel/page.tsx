import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { demoSmsSetup } from "@/lib/actions/demo-sms";
import { SendExample } from "./send-example";

export const metadata = { title: "Send eksempel" };

/*
 * Salg → Send eksempel: type a new customer's name and mobile number and send
 * them one of our showcase tours on SMS - their own link, so we see if and
 * when they look (see src/lib/actions/demo-sms.ts).
 */
export default async function SendExamplePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/session-ended?next=/arpo/send-eksempel");
  return <SendExample initial={await demoSmsSetup()} />;
}
