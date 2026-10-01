"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/** Posting a feature announcement is admin-only - everyone else just reads. */
export async function createNewsPost(input: {
  title: string;
  body: string;
  screenshotUrl: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { ok: false, error: "Kun admin kan oprette nyheder." };

  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || !body) return { ok: false, error: "Udfyld både titel og tekst." };

  await prisma.newsPost.create({
    data: { title, body, screenshotUrl: input.screenshotUrl, createdById: user.id },
  });
  // The poster shouldn't see their own post as "unread" the moment they land back on the page.
  await prisma.user.update({ where: { id: user.id }, data: { newsReadAt: new Date() } });

  revalidatePath("/nyheder");
  return { ok: true };
}

export async function deleteNewsPost(postId: string): Promise<void> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan slette nyheder.");
  await prisma.newsPost.delete({ where: { id: postId } });
  revalidatePath("/nyheder");
}

/** Called when /nyheder is opened, so the header badge clears. Deliberately
 * no revalidatePath here - it's called directly from the page's own render
 * (not a Server Action invocation), and revalidating during render is
 * disallowed by Next.js. Not needed anyway: /nyheder and the layout's badge
 * both read fresh from the DB on every request already (they're dynamic
 * routes, via the cookie-reading requireUser/getCurrentUser call). */
export async function markNewsRead(): Promise<void> {
  const user = await requireUser();
  await prisma.user.update({ where: { id: user.id }, data: { newsReadAt: new Date() } });
}

export async function getUnreadNewsCount(userId: string, newsReadAt: Date | null): Promise<number> {
  return prisma.newsPost.count({
    where: { createdAt: { gt: newsReadAt ?? new Date(0) }, createdById: { not: userId } },
  });
}

/**
 * The three feature announcements requested when /nyheder shipped, seeded
 * automatically instead of needing production DB access (this sandbox only
 * ever talks to the local dev database) - the first admin to open the page
 * after deploy creates any of these that don't exist yet, keyed by title so
 * it only ever runs once per post. createdAt is backdated a little so they
 * read in the order the features actually shipped, oldest first.
 */
const DEFAULT_POSTS: { title: string; body: string; minutesAgo: number; screenshotUrl: string }[] = [
  {
    minutesAgo: 15,
    title: "Se om kunden har åbnet din mail",
    body: "Mails du sender fra en deal (via skabelon-knappen) spores nu - under \"E-mail på dealen\" på dealens side kan du se en grøn \"Åbnet\"-badge, så snart kunden har åbnet mailen. Hold musen over badgen for at se hvor mange gange den er åbnet, og hvornår den blev åbnet første gang. Har den ikke en badge endnu, er den bare ikke åbnet af kunden endnu.",
    screenshotUrl: "/news/email-tracking.png",
  },
  {
    minutesAgo: 10,
    title: "Send mails med gemte skabeloner",
    body: "Når du skriver en mail til en kunde fra dealens side, kan du gemme den som en skabelon i stedet for at skrive den samme tekst forfra hver gang. Næste gang vælger du bare skabelonen i dropdown'en øverst i mail-boksen, og teksten sættes ind automatisk - du kan stadig redigere den før du sender. Skabelonerne kan også administreres samlet under Indstillinger → E-mail-skabeloner, hvis du vil rydde op eller lave nye uden at tage udgangspunkt i en konkret mail.",
    screenshotUrl: "/news/email-templates.png",
  },
  {
    minutesAgo: 2,
    title: "Ny side: Ringeliste",
    body: "Erstatter WhatsApp-tråden vi plejer at sende links i på ringedage. Gå til \"Ringeliste\" i menuen, og indsæt links - CVR-opslag, Facebook-sider, almindelige hjemmesider, eller bare et navn - ét pr. linje i boksen øverst. De bliver automatisk til rigtige leads: et CVR-link slår firmaet op i registret, en almindelig hjemmeside bliver scannet for navn/telefon/ejer, og en Facebook-side får et gæt på navn ud fra linket.\n\nOpret en ny liste for hver ringedag (\"+ Ny liste\"), så du kan skifte mellem dagens liste og tidligere lister. Under listen ser du en ring-kø med kun de leads der stadig mangler at blive ringet til - klik \"❌ Tabt\" eller \"📅 Book møde\" for at opdatere med det samme, uden at åbne dealen. Du kan også rette et gættet navn direkte i køen (blyant-ikonet), tilføje et telefonnummer (vises som en grøn markeret badge, når det er gemt) og tilføje et produkt med ét klik.",
    screenshotUrl: "/news/ringeliste.png",
  },
  {
    minutesAgo: 0,
    title: "Book møde på ét trin - lige ved firmanavnet",
    body: "Før krævede det at åbne \"Stadie\"-dropdownen langt nede i redigeringsformularen, vælge \"Møde booket\", udfylde et mødedato-felt der først dukkede op der, gemme hele formularen - og så separat åbne \"Send kalender invitation\" for rent faktisk at give kunden/kollegaer besked. Akavet, især midt i et telefonopkald.\n\nNu er der en lilla \"Book møde\"-knap lige ved siden af firmanavnet øverst på dealens side. Klik den, vælg dato/tid, lad kryds-feltet \"Send kalenderinvitation med det samme\" stå som det er (sat til som standard) - dealen rykker med det samme til Møde booket, og kalenderinvitationen sendes i samme trin. Virker uanset hvilket stadie dealen kommer fra. Den gamle \"Send kalender invitation\"-knap findes stadig, hvis du vil tilføje en kollega eller en besked bagefter.",
    screenshotUrl: "/news/book-meeting.png",
  },
  {
    minutesAgo: 0,
    title: "Stats-siden som kort i stedet for en bred tabel",
    body: "\"Live kunder\"-tabellen på Stats krævede før vandret scroll for at nå alle felter (MP-Skin nummer, CC, interval, sprog, næste afsendelse). Hver kunde er nu et kort i stedet, med felterne i et grid der bare bryder om på mindre skærme - intet scroll nødvendigt.\n\nSamtidig kan \"PDF\"-knappen nu downloade en samlet rapport for en kunde med sammenkoblede afdelinger (ligesom \"Send samlet\" allerede gjorde for mail) - den spørger om du vil have alle med, eller kun den ene. Og selve PDF-genereringen kører nu i baggrunden i stedet for at låse knappen: tryk \"PDF\", og den dukker op i nederste højre hjørne når den er klar, i stedet for at vente på en frossen knap i op til et minuts tid.",
    screenshotUrl: "/news/stats-cards.png",
  },
  {
    minutesAgo: 0,
    title: "Lead-filtre kan nu fodre direkte til en ringeliste",
    body: "Et filter under Leadgeneration kan sættes til automatisk at tilføje sine fundne leads som deals på en ringeliste, i stedet for at de bare samler sig under \"Fundne leads\" og skal tilføjes én for én. Åbn \"Redigér\" på et filter, og vælg under \"Ringeliste (automatisk)\": enten \"Opret ny liste hver dag\" (så dagens fund lander i en frisk liste, klar til at ringe på), eller en bestemt eksisterende liste. Gælder både den daglige automatiske kørsel og et manuelt \"Kør nu\".",
    screenshotUrl: "/news/auto-ringeliste.png",
  },
];

/**
 * Creates any of the three default posts that don't exist yet, and backfills
 * a screenshot onto one that was already created without one (e.g. the
 * first run of this function, before the screenshots existed) - same
 * can't-reach-production-DB workaround as ensureDefaultNewsPosts itself, so
 * a later screenshot addition still reaches prod without direct DB access.
 */
export async function ensureDefaultNewsPosts(adminUserId: string): Promise<void> {
  for (const post of DEFAULT_POSTS) {
    const existing = await prisma.newsPost.findFirst({ where: { title: post.title } });
    if (!existing) {
      await prisma.newsPost.create({
        data: {
          title: post.title,
          body: post.body,
          screenshotUrl: post.screenshotUrl,
          createdById: adminUserId,
          createdAt: new Date(Date.now() - post.minutesAgo * 60_000),
        },
      });
    } else if (!existing.screenshotUrl) {
      await prisma.newsPost.update({ where: { id: existing.id }, data: { screenshotUrl: post.screenshotUrl } });
    }
  }
}
