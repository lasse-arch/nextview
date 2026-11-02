import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dealName } from "@/lib/labels";
import { industryOf } from "@/lib/industries";
import { onlineTours } from "@/lib/online-tours";
import { getAppBaseUrl } from "@/lib/email-oauth";
import { MailGenerator, type MailSender } from "../mailgenerator/mail-generator";
import { teamCan } from "@/lib/team-roles";


/*
 * Salg → Generator → Mail: a mail from a few lines - after a meeting, a first
 * mail, an offer - with the price and tours to look at, written the way the
 * team writes (see src/lib/actions/sales-mail.ts). A deal is optional.
 */
export async function MailSection({ user }: { user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>> }) {

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
  const sign = (u: { name: string; lastName: string | null; phone: string | null }) =>
    ["Med venlig hilsen", [u.name, u.lastName].filter(Boolean).join(" "), "Nextview360", u.phone ? `Tlf: ${u.phone}` : null].filter((l): l is string => Boolean(l));
  // An admin can write and send in a colleague's name (from the colleague's own Gmail) - the others only as themselves.
  const team = teamCan(user, "admin")
    ? await prisma.user.findMany({
        where: { disabledAt: null, id: { not: user.id } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, lastName: true, phone: true, role: true, extraRoles: true, emailAccounts: { where: { provider: "GOOGLE" }, select: { id: true }, take: 1 } },
      })
    : [];
  const senders: MailSender[] | undefined = team.length
    ? [
        { id: user.id, name: sellerName, signature: sign(user), gmail: true },
        ...team.filter((u) => teamCan(u, "sales") || teamCan(u, "admin")).map((u) => ({ id: u.id, name: [u.name, u.lastName].filter(Boolean).join(" "), signature: sign(u), gmail: u.emailAccounts.length > 0 })),
      ]
    : undefined;

  return (
    <MailGenerator
      deals={deals.map((d) => ({ id: d.id, name: dealName(d), contact: d.contactName ?? "", email: d.contactEmail || d.invoiceEmail || "", industry: industryOf(dealName(d), d.industry) }))}
      tours={tours.flatMap((t) =>
        (t.variants.length > 1 ? t.variants.map((v) => ({ key: v.key, name: `${t.customer} - ${v.label}`, url: v.url })) : [{ key: t.key, name: t.customer, url: t.url }]).map((x) => ({
          ...x,
          // Our own tours (Arpo): the key is the tour's address - it can go out as a showcase link.
          slug: t.ours ? x.key.replace(/^t:/, "") : undefined,
          url: x.url.startsWith("/") ? `${base}${x.url}` : x.url,
          industry: t.industry,
        }))
      )}
      signature={sign(user)}
      senders={senders}
      learned={learned}
    />
  );
}
