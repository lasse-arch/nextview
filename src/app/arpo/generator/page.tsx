import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { demoSmsSetup } from "@/lib/actions/demo-sms";
import { SendExample } from "../send-eksempel/send-example";
import { MailSection } from "./mail-section";

export const metadata = { title: "Generator" };

/*
 * Salg → Generator: a mail (nextviewAI writes it the way we write, with price
 * and tours - our own as showcase links) or an SMS with a showcase tour, to a
 * new customer. Each showcase link is the recipient's own, so we see if and
 * when they look, and the seller hears it at once.
 */
export default async function GeneratorPage({ searchParams }: { searchParams: Promise<{ fane?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/session-ended?next=/arpo/generator");
  const sms = (await searchParams).fane === "sms";
  const tab = (on: boolean) => `rounded-lg px-4 py-1.5 text-sm font-medium transition ${on ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`;
  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-xl bg-slate-100 p-1">
        <Link href="/arpo/generator" className={tab(!sms)}>
          ✉️ Mail
        </Link>
        <Link href="/arpo/generator?fane=sms" className={tab(sms)}>
          💬 SMS
        </Link>
      </div>
      {sms ? <SendExample initial={await demoSmsSetup()} /> : <MailSection user={user} />}
    </div>
  );
}
