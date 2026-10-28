import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dealName } from "@/lib/labels";
import { industryOf } from "@/lib/industries";
import { onlineTours } from "@/lib/online-tours";
import { getAppBaseUrl } from "@/lib/email-oauth";
import { MailGenerator } from "./mail-generator";

export const metadata = { title: "Mailgenerator" };

/*
 * Salg → Mailgenerator: a mail from a few lines - after a meeting, a first
 * mail, an offer - with the price and tours to look at, written the way the
 * team writes (see src/lib/actions/sales-mail.ts). A deal is optional.
 */
export default async function MailGeneratorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/session-ended?next=/arpo/mailgenerator");

  const [deals, tours, learned] = await Promise.all([
    prisma.deal.findMany({
      where: { churnedAt: null, ...(user.role === "ADMIN" ? {} : { ownerId: user.id }) },
      orderBy: { updatedAt: "desc" },
      take: 400,
      select: { id: true, companyName: true, displayName: true, contactName: true, contactEmail: true, invoiceEmail: true, industry: true },
    }),
    onlineTours(),
    prisma.salesMail.count({ where: { finalAt: { not: null } } }),
  ]);
  const base = getAppBaseUrl();
  const sellerName = [user.name, user.lastName].filter(Boolean).join(" ");

  return (
    <MailGenerator
      deals={deals.map((d) => ({ id: d.id, name: dealName(d), contact: d.contactName ?? "", email: d.contactEmail || d.invoiceEmail || "", industry: industryOf(dealName(d), d.industry) }))}
      tours={tours.flatMap((t) =>
        (t.variants.length > 1 ? t.variants.map((v) => ({ key: v.key, name: `${t.customer} - ${v.label}`, url: v.url })) : [{ key: t.key, name: t.customer, url: t.url }]).map((x) => ({
          ...x,
          url: x.url.startsWith("/") ? `${base}${x.url}` : x.url,
          industry: t.industry,
        }))
      )}
      signature={["Med venlig hilsen", sellerName, "Nextview360", user.phone ? `Tlf: ${user.phone}` : null].filter((l): l is string => Boolean(l))}
      learned={learned}
    />
  );
}
