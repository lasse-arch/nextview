import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import type { ProposalData } from "@/lib/tour-proposal";
import { TourProposalView, proposalFonts } from "@/components/tour-proposal-view";

/*
 * A tour proposal for a customer (made in Generator): public on its own long,
 * random link and read-only - nothing here can change anything, and nothing
 * but the proposal itself is shown. Not indexed.
 */

export const dynamic = "force-dynamic";

const byToken = (token: string) => (/^[A-Za-z0-9_-]{20,40}$/.test(token) ? prisma.tourProposal.findUnique({ where: { token }, select: { data: true, customer: true } }) : null);

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const p = await byToken((await params).token);
  return { title: p ? `Oplæg til ${p.customer} - Nextview360` : "Nextview360", robots: { index: false, follow: false } };
}

export default async function PublicProposal({ params }: { params: Promise<{ token: string }> }) {
  const p = await byToken((await params).token);
  if (!p) notFound();
  const d = p.data as unknown as ProposalData;
  const fonts = proposalFonts(d);
  return (
    <>
      {fonts && <link rel="stylesheet" href={fonts} />}
      <TourProposalView d={d} />
    </>
  );
}
