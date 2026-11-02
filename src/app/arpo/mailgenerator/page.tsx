import { redirect } from "next/navigation";

/* The mail generator is a tab of Salg → Generator now. */
export default function MailGeneratorPage() {
  redirect("/arpo/generator");
}
