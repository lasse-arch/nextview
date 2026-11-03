"use server";

import { requireTeam } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dealName, stageLabels } from "@/lib/labels";

export type DealHit = { id: string; name: string; sub: string; stage: string };

/**
 * The search field at the top of Arpo: a deal by its name, the person, the
 * e-mail, the phone or the CVR - for the sales side (who see all deals in
 * the list too). At most eight, the latest touched first.
 */
export async function findDeals(query: string): Promise<DealHit[]> {
  await requireTeam("sales");
  const q = String(query ?? "").trim().slice(0, 80);
  if (q.length < 2) return [];
  const digits = q.replace(/\s/g, "");
  // Each word somewhere on the deal (name, nickname, person, e-mail) - small words ("og", "&", "ApS") left out, so
  // "Halvorsminde Efterskole og Fri Fagskole" finds "Halvorsminde Efterskole & Fri Fagskole" too.
  const SMALL = new Set(["og", "and", "&", "i", "på", "a/s", "as", "aps", "ivs", "-", "–"]);
  const words = q
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((w) => w && !SMALL.has(w))
    .slice(0, 6);
  const word = (w: string) => {
    const has = { contains: w, mode: "insensitive" as const };
    return { OR: [{ companyName: has }, { displayName: has }, { contactName: has }, { contactEmail: has }] };
  };
  // Any of the words, then the ones with the most of them first (at least half) - a name typed a little differently,
  // or longer than the deal's, still finds it.
  const found = await prisma.deal.findMany({
    where: {
      OR: [
        ...words.map(word),
        ...(/^\+?\d{4,}$/.test(digits) ? [{ contactPhone: { contains: digits } }, { cvrNumber: { contains: digits } }] : []),
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 60,
    select: { id: true, companyName: true, displayName: true, contactName: true, contactEmail: true, contactPhone: true, cvrNumber: true, address: true, stage: true },
  });
  const need = Math.max(1, Math.ceil(words.length / 2));
  const deals = found
    .map((d, i) => {
      const text = [d.companyName, d.displayName, d.contactName, d.contactEmail].filter(Boolean).join(" ").toLowerCase();
      const byNumber = digits.length >= 4 && [d.contactPhone, d.cvrNumber].some((v) => v?.replace(/\s/g, "").includes(digits));
      const hits = words.filter((w) => text.includes(w)).length;
      const name = dealName(d).toLowerCase();
      return { d, i, score: byNumber ? 100 : hits + (name.startsWith(words[0] ?? "\u0000") ? 0.5 : 0) + (name === q.toLowerCase() ? 2 : 0), ok: byNumber || hits >= need };
    })
    .filter((x) => x.ok)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, 8)
    .map((x) => x.d);
  return deals.map((d) => ({
    id: d.id,
    name: dealName(d),
    sub: [d.contactName, d.address?.split(",").pop()?.trim()].filter(Boolean).join(" · "),
    stage: stageLabels[d.stage] ?? d.stage,
  }));
}
