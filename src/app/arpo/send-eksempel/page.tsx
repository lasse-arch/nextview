import { redirect } from "next/navigation";

/* "Send eksempel" is the SMS tab of Salg → Generator now. */
export default function SendExamplePage() {
  redirect("/arpo/generator?fane=sms");
}
