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

  revalidatePath("/arpo/nyheder");
  return { ok: true };
}

export async function deleteNewsPost(postId: string): Promise<void> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan slette nyheder.");
  await prisma.newsPost.delete({ where: { id: postId } });
  revalidatePath("/arpo/nyheder");
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
  await requireUser();
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
    minutesAgo: 0,
    title: "Mailgenerator under Salg",
    body: "Under Salg → Mailgenerator skriver nextviewAI et mailforslag ud fra et par linjer: hvem den er til, hvad I talte om, og om det er efter et møde, en første henvendelse, et tilbud eller en opfølgning. En deal er valgfri - vælger du en, udfyldes navn, firma og e-mail.\n\nSkriv prisen ind (etablering, månedlig pris, afdelinger, binding og betingelser), så kommer den med - præcis som du har skrevet den, for prisen sættes ind af Arpo og ikke af AI'en. Du kan også vælge op til 3 tours, som kunden kan se, og linkene kommer med.\n\nRet i forslaget, tryk \"Kortere\", \"Mere personlig\" osv., eller skriv selv, hvad der skal laves om. Send den fra din egen Gmail (med en deal ligger den på dealen) eller kopiér den. Den skriver som en sælger, ikke som en reklame - og den lærer: de mails, I sender herfra, bruges som eksempler næste gang, også dét I har rettet.",
    screenshotUrl: "/news/mailgenerator.png",
  },
  {
    minutesAgo: 0,
    title: "Salg pr. måned på Provision",
    body: "Øverst på Provision kan sælgerne nu se, hvad de har solgt måned for måned: antal salg, etablering solgt, MRR solgt og provision - med den valgte måned som kort øverst (og hvor meget det er op eller ned i forhold til måneden før) og de seneste 12 måneder i en tabel med totaler. Klik på en måned for at se den.\n\nSom sælger ser du kun dine egne salg. Som admin kan du se alle samlet, hvem der solgte hvad i måneden, eller vælge én sælger. Tallene tælles som i målene: salgsdatoen, dealens sælger, MRR = den månedlige pris.",
    screenshotUrl: "/news/salg-pr-maaned.png",
  },
  {
    minutesAgo: 0,
    title: "Ny besøgsrapport - og kunden vælger selv, hvor tit",
    body: "Besøgsrapporten er lavet helt om. For kunder med tours i Arpo bygges den nu af vores egne tal - de samme som på kundens side - og den viser tydeligt, hvad touren gør for dem: antal besøg (og hvordan det går ift. perioden før), hvor mange timer de besøgende tilsammen har brugt i touren, hvor mange der gik videre til booking eller kontakt, det mest besøgte sted, hvor de blev længst, hvad de valgte i menuen og åbnede, og flere tours side om side. Kun det, touren er sat til at dele med kunden, kommer med.\n\nMailen viser nu de vigtigste tal direkte i selve mailen med en knap til kundens side, så værdien ses uden at åbne PDF'en. Rapporten dækker den periode, den sendes for (1, 2 eller 3 måneder).\n\nKunden kan selv vælge på sin side under Statistik → \"Statistik på mail\": hver måned, hver 2. måned, hver 3. måned eller ikke på mail. I kan stadig ændre det på dealen. Kunder, hvis tours stadig kun ligger på explore, får den gamle rapport.",
    screenshotUrl: "/news/besoegsrapport.png",
  },
  {
    minutesAgo: 0,
    title: "\"Find din plads\" og gåafstande på luftfotoet",
    body: "Tours med luftfoto kan nu have \"Find din plads\": gæsten svarer på et par spørgsmål (fx hvem kommer, hvad bor I i, hvad er vigtigst), og touren flyver hen til det sted, der passer bedst, med \"Bedst til jer\", andre gode bud og Book-knappen. Spørgsmålene og hvilke steder der passer til hvert svar sættes under Luftfoto og kort → Find din plads. Der er også færdige camping-spørgsmål.\n\nPunkterne kan også have gåafstande (\"2 min til stranden\"). De står på kortet, og når et punkt er åbent, tegnes stregerne til stederne på billedet.\n\nOgså nyt: luftfotos og 360°-billeder fra de første prototyper (fx Hals) kan gøres redigerbare med ét klik, \"Ret med AI\" beholder nu fuld skarphed alle steder, hvor intet blev ændret, og punkternes billeder vises hele.",
    screenshotUrl: "/news/find-din-plads.png",
  },
  {
    minutesAgo: 0,
    title: "Ny tour med nextviewAI: se planen, før den bygger",
    body: "Når I laver en ny tour med nextviewAI, bygger den ikke længere med det samme. Først fortæller den, hvad den vil bygge og hvorfor: hvem touren er til, hvordan den starter, menupunkterne i rækkefølge, hvilke historier og stedkort den bruger (og fravælger), hvordan touren sælger, og hvad I selv skal gøre bagefter. Er der noget, den er i tvivl om, spørger den.\n\nSkriv rettelser under planen og tryk \"Lav planen om\" - så retter den planen og beholder resten. Når planen er god, trykker I \"Byg touren efter planen\", og den bygger præcis det, I har godkendt.",
    screenshotUrl: "/news/ai-plan.png",
  },
  {
    minutesAgo: 0,
    title: "Vejret på luftfotoet - lige nu og måned for måned",
    body: "En tour med luftfoto kan nu vise vejret, hvor stedet ligger: en lille knap nederst med graderne lige nu. Trykker man på den, ser man vejret i dag (sol/regn, vind, solopgang og solnedgang) - og kan vælge en måned og se, hvordan den typisk er: temperatur, varmeste dag, soltimer, regn og vind. Godt for fx campingpladser og hoteller, hvor gæsterne planlægger, hvornår de skal komme.\n\nTallene kommer fra DMI (vejret nu, og gennemsnittet af de sidste 10 år for måneden). Slås til i tour-editoren under Luftfoto og kort → Vejret, hvor man skriver byen.",
    screenshotUrl: "/news/vejret.png",
  },
  {
    minutesAgo: 0,
    title: "Send touren til gennemgang hos kunden",
    body: "I tour-editoren under Feedback er der nu \"Send til gennemgang\": kunden får en mail fra lasse@ med et link til touren, hvor de går rundt, trykker \"Giv feedback\" der, hvor noget skal rettes, og \"Godkend\", når de er tilfredse. Har kunden adgang til kundesiden, kommer den med i mailen - og under Rettelser kan de også se touren, skrive rettelser og godkende. Touren kan sendes, før den er udgivet.\n\nI editoren står der, hvornår den er sendt, om kunden har godkendt, og hvor mange rettelser der er åbne. Hører I ikke noget, kan I sende en påmindelse - eller trykke \"Godkend selv\". Godkender kunden, får I en mail. Efter en godkendelse kan I sende touren til en ny gennemgang. Udgiv virker som før og venter ikke på kunden.",
    screenshotUrl: "/news/gennemgang.png",
  },
  {
    minutesAgo: 0,
    title: "Kundeoverblik: alt om en kunde på én side",
    body: "Klik på en kunde under \"Live kunder\" (eller \"Kundeoverblik\" på dealen), og du får alt samlet: kontaktinfo, aftale og betaling, fakturaer med status (betalt, sendt, forfalden), kundens tours med besøg de sidste 30 dage, hvem der kan logge ind på kundesiden - og hvornår de sidst gjorde det.\n\nNederst er en tidslinje med alle mails og hændelser, nyeste først: velkomstmail, login-links, fakturaer sendt og betalt, Betalingsservice-træk, statistikrapporter (og om de er åbnet), kontrakten og mails fra dealen. Admins kan trykke \"Se kundesiden som kunde\" og se præcis det, kunden ser.",
    screenshotUrl: "/news/kundeoverblik.png",
  },
  {
    minutesAgo: 1,
    title: "Gør kunden live direkte fra touren",
    body: "Øverst under \"Del og udgiv\" i tour-editoren er der nu én knap: \"Udgiv touren endelig og gør kunden live\". Den lægger touren ud på tour.nextview360.dk, giver kontaktpersonen login til kundesiden, sætter dealen Live og sender velkomstmailen - nu med en kort introduktion til kundesiden og en knap til at logge ind. Mangler filmtiden, beder den om den først.",
    screenshotUrl: "/news/goer-kunden-live.png",
  },
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
  {
    minutesAgo: 0,
    title: "Ring op direkte fra computeren",
    body: "Telefonnumre i Arpo kan nu klikkes - det grønne nummer på ringelisten, \"📞 Ring op\" ved telefonfeltet på dealen og numrene i Leadindbakke og Leadgeneration. Opkaldet går ud fra din egen mobil med dit eget nummer: på en Mac med iPhone (slå \"Opkald på andre enheder\" til på iPhonen, samme Apple-ID), og på Windows via Phone Link. Du taler i computerens mikrofon/headset. Blyanten ved nummeret på ringelisten retter nummeret.",
    screenshotUrl: "/news/ring-op.png",
  },
  {
    minutesAgo: 0,
    title: "Betalingsservice kører nu automatisk via SFTP",
    body: "Under Indstillinger → Betalingsservice kan Arpo nu selv sende betalingsfilerne til Mastercard og hente kvitteringer og resultater - uden at nogen skal logge ind med MitID. Opsætning én gang: skriv jeres UserID, tryk \"Generér SSH-nøgle\", download nøglefilen og upload den til postkassen i My File Transfer i browseren. Når der kommer en .OK-kvittering, kan du trykke \"Test forbindelse\".\n\nDerefter kører det én gang om dagen: med \"Lav og send betalingsfilen automatisk\" slået til laves og sendes filen selv, og betalinger og tilmeldinger fra Betalingsservice indlæses af sig selv - betalte fakturaer markeres som betalt, også i Dinero. Kvitteringer kan ses under \"Hentet fra postkassen\".",
    screenshotUrl: "/news/betalingsservice-sftp.png",
  },
  {
    minutesAgo: 0,
    title: "Alle kunder på Betalingsservice",
    body: "Alle kunder betaler nu via Betalingsservice, medmindre de er sat til \"Almindelig faktura\" på dealen - også nye deals. Under Indstillinger → Betalingsservice flytter \"Sæt alle kunder på Betalingsservice\" de nuværende kunder over én gang og giver dem et kundenummer. Listen viser, hvor mange der er tilmeldt, og hvem der mangler.\n\nEn ny kunde venter ikke på Betalingsservice: etableringen og første periode er almindelige fakturaer (FI/bankoverførsel) med tilmeldingsoplysningerne på, og først kvartalet efter opkræves via Betalingsservice - automatisk for dem, der er tilmeldt, ellers med indbetalingskort. Kontrakten har nu et felt, hvor kunden skriver sin fakturamail, som lægges ind på dealen af sig selv. Afviser en kunde en betaling i Betalingsservice, bliver fakturaen markeret med rødt, og der kommer en opgave på dealen om at rykke kunden.",
    screenshotUrl: "/news/alle-paa-betalingsservice.png",
  },
  {
    minutesAgo: 0,
    title: "Tilmeldingsmail til Betalingsservice",
    body: "Under Indstillinger → Betalingsservice kan I nu indsætte jeres BS Tilmeldingslink fra Mastercard Connect og sende en tilmeldingsmail fra lasse@nextview360.dk til alle kunder, der ikke er tilmeldt endnu - med en rød \"Tilmeld Betalingsservice\"-knap (MitID) og kundens eget kundenummer. \"Se mailen\" viser den først, og hver kunde i listen har sin egen \"Send mail\"-knap og kan se, hvornår den sidst blev sendt.\n\nAfdelinger, der faktureres samlet med en hovedkunde, står nu under hovedkunden i listen og bruger hovedkundens tilmelding. Linket kommer også på fakturaerne i stedet for betalingsservice.dk, hvor man ikke kan tilmelde sig.",
    screenshotUrl: "/news/tilmeldingsmail.png",
  },
  {
    minutesAgo: 0,
    title: "Log ind med Google",
    body: "Du kan nu logge ind i Arpo med din Google-arbejdskonto - tryk \"Log ind med Google\" på login-siden og vælg kontoen med samme e-mail som din Arpo-bruger. Så gælder Googles egen sikkerhed (fx 2-trinsbekræftelse) også for Arpo.\n\nNår alle har prøvet det, kan en admin under Brugere slå \"Kræv Google-login\" til - så virker adgangskoder ikke længere, og alle der er logget ind med adgangskode bliver logget ud og skal ind med Google.",
    screenshotUrl: "/news/google-login.png",
  },
  {
    minutesAgo: 0,
    title: "Ring tilbage - direkte fra ringelisten",
    body: "Siger kunden \"ring igen i næste uge\", så tryk den nye blå \"🔁 Ring tilbage\"-knap på ringelisten. Skriv en kort note og vælg dato og klokkeslæt - så opretter Arpo opgaven \"Ring tilbage til <firma>\" til dig på den dag, med tidspunktet og noten i beskrivelsen. Noten gemmes også på dealen, og leadet rykker videre til Kontaktet, så det ikke står og venter på listen - opgaven minder dig om det.",
    screenshotUrl: "/news/ring-tilbage.png",
  },
  {
    minutesAgo: 0,
    title: "Etablering først når kunden er tilfreds",
    body: "Har I lovet en kunde, at etableringen først faktureres, når produktet er leveret, og de har godkendt det? Fjern krydset i \"Etablering faktureres ved underskrift\", når I laver kontrakten - så står det i kontrakten (godkendt automatisk, hvis kunden ikke har påpeget konkrete mangler inden for 7 dage efter levering), og Arpo fakturerer ikke etableringen af sig selv.\n\nPå dealen står der så \"Etablering afventer kundens godkendelse\". Når kunden har godkendt, sætter I dealen Live - så faktureres etableringen ved næste fakturakørsel. På eksisterende deals kan I gøre det samme med knappen \"Vent til kunden har godkendt\" under Fakturaer, så længe etableringen ikke er faktureret endnu.",
    screenshotUrl: "/news/etablering-afventer.png",
  },
  {
    minutesAgo: 0,
    title: "Book filming - med kalenderinvitation til kunden",
    body: "Ved siden af \"Book møde\" på dealen er der nu en rød \"🎬 Book filming\"-knap. Vælg starttidspunkt, hvor mange timer optagelsen forventes at tage, og hvem der filmer (Lasse, Victor eller begge). Invitationen sendes fra din egen Google-kalender til kundens e-mail fra kontrakten - og til en ekstra adresse i \"Send også til\", fx pedellen eller forstanderen - med kundens adresse som sted.\n\nI invitationen står der, at vi kommer ud og optager på det aftalte tidspunkt, hvem der kommer, og hvad kunden skal have klar: pænt og ryddet op, døre låst op, lys tændt osv. Den skriver også, at kun starttidspunktet er gældende - sluttiden er kun et estimat, og vi tager selvfølgelig først hjem, når vi er færdige.\n\nSamtidig får hverken mødeinvitationer eller filming-invitationer længere et Google Meet-link på, så ingen tror, at mødet er online.",
    screenshotUrl: "/news/book-filming.png",
  },
  {
    minutesAgo: 0,
    title: "Velkomstmail når kunden sættes Live",
    body: "Når en kunde sættes Live første gang, får de nu automatisk en mail fra lasse@nextview360.dk: \"Velkommen til Nextview360 - vi har nu lavet alt det hårde arbejde, og det hele er klar til at arbejde for jeres virksomhed\", med links til det, vi har leveret, og deres hjemmeside, og at de er velkomne til at skrive eller ringe på 23 27 07 86, hvis de har brug for ændringer eller har spørgsmål.\n\nLinkene tages fra Ydelser på dealen (tour, hjemmeside osv.) - så sørg for, at de er udfyldt, inden I sætter kunden Live. Nederst under Ydelser kan I se mailen (\"Se mail\"), om den er sendt, og sende den (igen) i hånden. Mailen sendes kun én gang automatisk.",
    screenshotUrl: "/news/velkomstmail.png",
  },
  {
    minutesAgo: 0,
    title: "Kontrakt til kunder med flere lokationer",
    body: "Har kunden flere afdelinger, kan du nu lave én kontrakt med en tour til hver. Sæt flueben i \"Kunden har flere lokationer\" under Nextview360 Tour på kontraktsiden, og skriv navn, adresse, etablering og månedspris for hver lokation (\"+ Tilføj lokation\" for flere). Kontrakten viser en tabel med alle lokationerne og totalen, og fakturaerne og ydelserne på dealen får en linje pr. lokation, fx \"Nextview360 Tour - Aarhus\". Virker også på fritstående kontrakter.",
    screenshotUrl: "/news/flere-lokationer.png",
  },
  {
    minutesAgo: 0,
    title: "Kunderne får deres egen side med login",
    body: "Kunderne kan nu logge ind og se deres egen side: deres tours med de tal, vi deler, koderne til at sætte touren ind på deres hjemmeside, linket til at give feedback, den underskrevne kontrakt som PDF, og hvordan de får fat i os. Fakturaer kan de ikke se der - dem får de tilsendt som altid.\n\nGiv adgang under \"Kundens login\" på dealens side (kun admin): skriv kundens e-mail, og tryk \"Giv adgang og send mail\". Kunden får en mail fra lasse@nextview360.dk med et login-link. Der er ingen adgangskode - næste gang skriver kunden bare sin e-mail på login-siden og får et nyt link, der virker i 15 minutter. Har kunden afdelinger, får de adgang til dem alle. Under \"Kundens login\" kan du også se, hvornår de sidst var logget ind, sende linket igen eller fjerne adgangen.\n\nKunderne kan kun se deres egne ting og kan aldrig komme ind i Arpo. Samtidig er Arpo flyttet til /arpo, så hjemmesiden, login og Arpo kan ligge på samme adresse, nextview360.dk. Gamle links og bogmærker sender selv videre.",
    screenshotUrl: "/news/kundelogin.png",
  },
  {
    minutesAgo: 0,
    title: "Ny menu og en Health-side",
    body: "Menuen er delt i afsnit - Salg, Kunder, Tours, Virksomheden og Betaling - uden noget, der skal foldes ud, og Tours har fået sit eget afsnit med Tours og Personer i scans. Indstillinger ligger nederst.\n\nUnder Virksomheden → Health (admin) kan I se, om alt kører: databasen, hjemmesiden, tourene på Cloudflare, MPSkins, den natlige backup, Gmail og kalender, Dinero, DocuSeal, Betalingsservice, Matterport og nextviewAI - grøn, gul eller rød, med hvad der er galt. Øverst står, hvor mange der kigger på jeres tours lige nu, og hvor mange der har besøgt dem det sidste døgn, 7 og 30 dage - samlet og for hver tour. Siden opdaterer sig selv hvert 30. sekund.",
    screenshotUrl: "/news/health.png",
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
  const user = await requireUser();
  if (user.role !== "ADMIN" || user.id !== adminUserId) return;
  // Replaced by "Møder booket denne uge - på forsiden" shortly after it went out.
  await prisma.newsPost.deleteMany({ where: { title: "Møder booket i dag - på forsiden" } });
  // First version pointed at a separate "Link til produkt" field, since replaced by the Ydelser links.
  await prisma.newsPost.deleteMany({
    where: { title: "Velkomstmail når kunden sættes Live", body: { contains: "Link til produkt" } },
  });

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
