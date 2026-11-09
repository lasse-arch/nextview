import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { demoSmsSetup } from "@/lib/actions/demo-sms";
import { SendExample } from "../send-eksempel/send-example";
import { MailSection } from "./mail-section";
import { SentMails } from "./sent-mails";
import { AskSection } from "./ask-section";
import { listSalesAnswers } from "@/lib/actions/sales-helper";

export const metadata = { title: "Generator" };

/*
 * Salg → Generator: a mail (nextviewAI writes it the way we write, with price
 * and tours - our own as showcase links) or an SMS with a showcase tour, to a
 * new customer. Each showcase link is the recipient's own, so we see if and
 * when they look, and the seller hears it at once. "Spørg": nextviewAI
 * answers questions about the system and helps with objections, and the
 * team's good answers are kept as a FAQ (src/lib/actions/sales-helper.ts).
 */
export default async function GeneratorPage({ searchParams }: { searchParams: Promise<{ fane?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/session-ended?next=/arpo/generator");
  const fane = (await searchParams).fane;
  const sms = fane === "sms";
  const spoerg = fane === "spoerg";
  const tab = (on: boolean) => `rounded-lg px-4 py-1.5 text-sm font-medium transition ${on ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`;
  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-xl bg-slate-100 p-1">
        <Link href="/arpo/generator" className={tab(!sms && !spoerg)}>
          ✉️ Mail
        </Link>
        <Link href="/arpo/generator?fane=sms" className={tab(sms)}>
          💬 SMS
        </Link>
        <Link href="/arpo/generator?fane=spoerg" className={tab(spoerg)}>
          💡 Spørg
        </Link>
      </div>
      {spoerg ? (
        <AskSection faq={await listSalesAnswers()} />
      ) : sms ? (
        <SendExample initial={await demoSmsSetup()} />
      ) : (
        <>
          <MailSection user={user} />
          <SentMails user={user} />
        </>
      )}
    </div>
  );
}
