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
  {
    minutesAgo: 0,
    title: "Fundne leads er nu grupperet pr. filter",
    body: "\"Fundne leads\" under Leadgeneration viste før alle filtres fund i én lang, blandet liste. Nu får hvert filter sin egen navngivne liste med eget antal - opret fx et filter kaldet \"Nye leads dagligt\" uden branche/område-begrænsning, så det selv kører CVR-registret igennem hver dag, og dets fund samler sig overskueligt for sig selv. Hver liste har sin egen \"Tilføj alle til ringeliste\"-knap, så du kan tilføje en hel dags fund til den valgte ringeliste med ét klik i stedet for én for én.",
    screenshotUrl: "/news/fundne-leads-grouped.png",
  },
  {
    minutesAgo: 0,
    title: "Sæt mål for flere perioder - ikke kun denne måned",
    body: "\"Mål\" på forsiden (tidligere \"Mål denne måned\") kan nu sættes for \"Denne måned\", \"Dette kvartal\", \"Resten af året\" eller \"Hele året\" - vælg bare perioden i dropdown'en, når du opretter et mål. Et mål forsvinder automatisk fra listen, når dets periode er omme, så den ikke bliver stående og vise forældet fremgang.\n\nDer er også en ny målmetrik: \"Solgt i alt\" - den matcher dashboardets egen \"Solgt i alt\"-boks (alle aktive kunders fulde kontraktværdi, ikke kun det der er solgt inden for perioden), så fx et \"Resten af året\"-mål på 1,5 mio. kr. viser jeres reelle status med det samme, i stedet for at starte ved 0 kr.",
    screenshotUrl: "/news/goal-periods.png",
  },
  {
    minutesAgo: 0,
    title: "Se om kunden har åbnet jeres stats-rapport",
    body: "Under hver kunde på Stats-siden (og i kundens afsendelses-historik) kan du nu se en grøn \"Åbnet\"-badge, så snart kunden har åbnet den e-mail de fik med deres besøgsrapport - eller en grå \"Ikke åbnet\", hvis den stadig ligger ulæst. Virker for både automatiske og manuelle afsendelser. Hold musen over badgen for at se præcis hvornår den blev åbnet første gang.",
    screenshotUrl: "/news/report-open-tracking.png",
  },
  {
    minutesAgo: 0,
    title: "Vedhæft filer når du sender mails fra en deal",
    body: "Mail-boksen på dealsiden har nu et \"Vedhæft filer\"-felt, så du kan sende fx et tilbud eller nogle billeder direkte med mailen i stedet for at skulle sende det separat. Vælg én eller flere filer, se dem listet med størrelse lige under, og fjern en igen med krydset hvis du fortrød. Op til 25 MB i alt pr. mail (Gmails egen grænse).",
    screenshotUrl: "/news/email-attachments.png",
  },
  {
    minutesAgo: 0,
    title: "Indsæt et Pocket-link - få hele mødereferatet automatisk",
    body: "\"AI-mødenote\"-feltet på en deal kan nu tage imod et rent Pocket-delelink (fra heypocket.com) i stedet for at du selv skal kopiere teksten ind. Indsæt linket alene og tryk \"Gem mødenote\", så henter den automatisk det hele i baggrunden - summary, to-dos og den fulde transskription, uanset hvilken fane der tilfældigvis er åben på Pocket-siden.\n\nNoten vises som én kompakt linje med mødets titel og en \"Åbn hele referatet\"-knap, så den ikke fylder resten af dealens noter ud - men hele referatet er stadig ét klik væk.",
    screenshotUrl: "/news/pocket-integration.png",
  },
  {
    minutesAgo: 0,
    title: "Fundne leads viser nu også virksomheder, der allerede er tilføjet",
    body: "Før forsvandt en virksomhed helt fra et filters liste under \"Fundne leads\", hvis et andet filter havde fundet den først, eller den allerede var en deal - \"Kør nu\" sagde bare \"fandtes allerede\". Nu står den på listen hos hvert filter, der finder den, med en gul besked om hvorfor: \"Allerede tilføjet til ringelisten …\", \"Findes allerede som deal (stadie)\" eller \"Afvist tidligere\".\n\nEr den allerede en deal, kan du åbne den direkte eller trykke \"Skjul\" for at fjerne den fra listen - dealen røres ikke. Tilføjer du en virksomhed fra én liste, forsvinder den kun fra den liste; står den også på et andet filters liste, får den beskeden dér. Samtidig kan \"Op til 1000 pr. kørsel\" nu også nå virksomheder længere nede i CVR, i stedet for at få de samme 1000 nyeste tilbage hver gang.",
    screenshotUrl: "/news/fundne-leads-already-added.png",
  },
  {
    minutesAgo: 0,
    title: "Importér en CSV-fil som fundne leads",
    body: "Har du en liste over fx alle højskoler med telefon, e-mail og hjemmeside, kan du nu lægge den ind under Leadgeneration → \"Fundne leads\" med knappen \"Importér CSV\". Filen bliver sin egen liste (opkaldt efter filen, men du kan give den et andet navn), og hver række kan tilføjes til ringelisten, tilføjes som deal eller afvises - præcis som et filters fund. \"Tilføj alle til ringeliste\" virker også.\n\nFilen skal bare have en \"Navn\"-kolonne. Telefon, Email, Hjemmeside, Adresse, Postnr, By og Land bruges, hvis de er der, og et CVR-nummer er ikke nødvendigt. Både semikolon og komma virker som skilletegn. Findes en virksomhed allerede som deal (samme navn eller e-mail), står den med en gul besked i stedet for at blive oprettet to gange.",
    screenshotUrl: "/news/csv-import.png",
  },
  {
    minutesAgo: 0,
    title: "Ny side: Leadindbakke - Deals-tavlen er nu til de deals, I arbejder på",
    body: "Alle leads, der kommer ind via ringelisterne (indsat på Ringeliste, eller tilføjet til en ringeliste fra Leadgeneration), lander nu i den nye \"Leadindbakke\" i menuen i stedet for at fylde Lead-kolonnen på Deals. Her kan du søge på navn, telefon, adresse og CVR, filtrere på ringeliste og sælger, og se dem som Ikke ringet, Kontaktet eller Tabt.\n\nSå snart der bookes et møde, rykker leadet selv over på Deals med alle noter og historik. Vil du arbejde videre med et lead før et møde (fx en der ikke havde tid lige nu), så tryk \"Flyt til Deals\" - enkeltvis eller for flere på én gang. Leads du selv opretter med \"+ Ny lead\" kommer stadig direkte på Deals.\n\nDublet-tjekket er også blevet skarpere: opretter du en deal med samme CVR, navn, kaldenavn eller adresse som en eksisterende - også én der ligger som Tabt i leadindbakken - får du en advarsel med link til den, så I ikke starter forfra på en, I allerede har ringet til.",
    screenshotUrl: "/news/leadindbakke.png",
  },
  {
    minutesAgo: 0,
    title: "Ny side: Betalingsservice - kunder kan betale via indbetalingskort og automatisk betaling",
    body: "En kunde kan nu sættes på Betalingsservice under \"Fakturaer\" på dealen (\"Betaling: Betalingsservice\"). Kunden får et fast kundenummer (fx NV00012) og får stadig sin faktura fra Dinero som før - men kvartalsfakturaen forfalder d. 1. i kvartalet og har teksten \"Beløbet opkræves via Betalingsservice - betal venligst ikke via bankoverførsel\". Kvartalsfakturaen til en Betalingsservice-kunde laves fra d. 1. i måneden før kvartalet, så den kan nå Betalingsservices frist. Etableringen sendes altid som en almindelig faktura, som kunden selv betaler.\n\nUnder Indstillinger → Betalingsservice ligger alle fakturaer, der venter på at blive opkrævet. \"Lav betalingsfil\" laver filen, som du downloader og uploader hos Betalingsservice - senest kl. 11 på 6.-sidste bankdag i måneden før (siden viser fristen). Når Betalingsservice sender resultatfilen tilbage, indlæser du den samme sted: betalte fakturaer markeres som betalt, også i Dinero (på mellemregningskontoen), og afviste eller tilbageførte står med rødt, så I kan rykke. Kunder uden aftale får indbetalingskort; når de tilmelder sig automatisk betaling i netbanken, opdateres de selv, når aftalefilen indlæses.",
    screenshotUrl: "/news/betalingsservice.png",
  },
  {
    minutesAgo: 0,
    title: "Skriv en årsag, når en deal markeres som tabt",
    body: "Når du markerer en deal som tabt - med \"❌ Tabt\" på ringelisten, \"Markér som tabt\" på dealen, ved at trække den til Tabt på Deals-tavlen eller ved at vælge Tabt i stadie-feltet - kommer der nu et felt, hvor du skriver hvorfor. Årsagen gemmes som en note på dealen (\"Tabt: ...\"), så den, der tager fat i kunden senere, kan se hvad der skete.",
    screenshotUrl: "/news/tabt-aarsag.png",
  },
  {
    minutesAgo: 0,
    title: "Møder booket denne uge - på forsiden",
    body: "Forsiden viser nu, hvor mange møder der er booket gennem systemet denne uge, og hvem der har booket dem, med en søjle for hver dag mandag til søndag. Hold musen over en søjle for at se dagens fordeling pr. sælger. Det tæller den dag, mødet blev booket - ikke den dag, mødet holdes.",
    screenshotUrl: "/news/moder-booket-uge.png",
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
  // Replaced by "Møder booket denne uge - på forsiden" shortly after it went out.
  await prisma.newsPost.deleteMany({ where: { title: "Møder booket i dag - på forsiden" } });

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
