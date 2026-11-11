import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getProposal } from "@/lib/actions/tour-proposal";
import { TourProposalView, proposalFonts } from "@/components/tour-proposal-view";
import { ProposalBar } from "./proposal-bar";

export const metadata = { title: "Tour-oplæg" };

/* Generator → "Få et oplæg til touren": one proposal, as the customer will see it - with its link and mail to copy. */
export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/session-ended?next=/arpo/generator");
  const p = await getProposal((await params).id);
  if (!p) notFound();
  const fonts = proposalFonts(p.data);
  return (
    <div className="-m-4 sm:-m-6">
      {fonts && <link rel="stylesheet" href={fonts} />}
      <ProposalBar token={p.token} customer={p.data.customer} mail={p.data.mail} />
      <TourProposalView d={p.data} />
    </div>
  );
}
