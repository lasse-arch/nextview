import "server-only";
import type { ContractTerm, Employee, PayTerms } from "@prisma/client";
import { CONTRACT_SIGNER } from "@/lib/contract-template-data";

/*
 * The employment contract for a funktionær, laid out like a classic Danish contract (the parties centred, a heading per
 * subject) - only the [fields] are filled in from the employee's card, the pay terms and the "særlige vilkår".
 * DocuSeal finds the signature and date fields from the {{…;role=X}} tags (see contract-html-template.ts).
 *
 * Never in it: the CPR number (it lives only in the payroll system), consent to personal data or photos (consent in an
 * employment contract isn't free under GDPR - the privacy notice covers the processing), or a ban on side jobs
 * (ansættelsesbevisloven § 6 since 2023 only allows limits with a reason).
 *
 * The text waits for Lasse's approval: until CONTRACT_TEXT_APPROVED is true it can be read as a PDF, not sent.
 */
export const CONTRACT_TEXT_APPROVED = false;

/** Does sending wait for the text to be approved? */
export const usesUnapprovedText = () => !CONTRACT_TEXT_APPROVED;

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const MONTHS = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];
const date = (d: Date) => `${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const DAYS = ["mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag"];

/** "mandag til fredag", or the days listed ("mandag, onsdag og fredag"). */
export function workDaysText(days: number[]): string {
  const d = [...days].sort((a, b) => a - b);
  const run = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  if (d.length >= 3 && run) return `${DAYS[d[0] - 1]} til ${DAYS[d[d.length - 1] - 1]}`;
  const names = d.map((x) => DAYS[x - 1]);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} og ${names[names.length - 1]}` : (names[0] ?? "");
}
const num = (n: number) => n.toLocaleString("da-DK", { maximumFractionDigits: 2 });
const kr = (ore: number) => (ore / 100).toLocaleString("da-DK", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** What's missing before the contract can be made - in words, for the admin. */
export function contractProblem(e: Pick<Employee, "kind" | "homeAddress" | "duties">, pay: PayTerms | undefined): string | null {
  if (e.kind !== "SALARIED") return "Kontrakten er til funktionærer (fast løn). Andre ansættelser har deres egen kontrakt.";
  if (!e.homeAddress) return "Skriv medarbejderens adresse (under Kørsel eller Ansættelse).";
  if (!e.duties) return "Skriv kort, hvad opgaverne er (Ansættelse → Opgaver).";
  if (pay?.model === "HOURLY" ? !pay.hourlyOre : !pay?.monthlyOre && pay?.model !== "COMMISSION_ONLY") return pay?.model === "HOURLY" ? "Sæt timelønnen under Løn." : "Sæt en månedsløn under Løn.";
  return null;
}

type Term = Pick<ContractTerm, "kind" | "title" | "text" | "amountOre" | "from" | "to">;

/** One "særligt vilkår" in words. */
export function termText(t: Term): string {
  const when = `fra den ${date(t.from)}${t.to ? ` til og med den ${date(t.to)}` : ""}`;
  if (t.kind === "GUARANTEE")
    return `<p><u>Garantiløn</u></p><p>${when[0].toUpperCase()}${when.slice(1)} er Medarbejderen garanteret en løn på mindst brutto ${kr(t.amountOre ?? 0)} kr. pr. måned. Er den samlede løn for måneden (fast løn, timeløn for de registrerede timer og provision) mindre, betaler Nextview360 forskellen sammen med lønnen. Gælder garantien eller ansættelsen kun en del af en måned, regnes garantien forholdsmæssigt.</p>`;
  return `<p><u>${esc(t.title)}</u></p><p>${esc(t.text)} Vilkåret gælder ${when}.</p>`;
}

type ContractEmployee = Employee & { user: { name: string; lastName: string | null; email?: string; phone?: string | null }; manager?: { name: string; lastName?: string | null } | null };

export function employmentContractHtml(e: ContractEmployee, pay: PayTerms, sickTo: string, terms: Term[] = []): string {
  const name = `${e.user.name}${e.user.lastName ? ` ${e.user.lastName}` : ""}`;
  const weekly = e.weeklyMinutes / 60;
  const hourly = pay.model === "HOURLY";
  const commissionOnly = pay.model === "COMMISSION_ONLY";
  const commission = pay.model === "MONTHLY_COMMISSION" || commissionOnly || (pay.commissionPct ?? 0) > 0;
  const fixed = !hourly && !commissionOnly;
  const manager = e.manager ? `${e.manager.name}${e.manager.lastName ? ` ${e.manager.lastName}` : ""}` : null;
  const h = (title: string) => `<h2>${title}</h2>`;
  const P = (...lines: string[]) => lines.filter(Boolean).map((l) => `<p>${l}</p>`).join("");
  const probation = e.probationEnd ? `Prøvetiden løber til og med den ${date(e.probationEnd)}` : "De første 3 måneder af ansættelsen er gensidig prøvetid";

  const pay7 = hourly
    ? `Lønnen er ved tiltrædelse aftalt til <b>brutto ${kr(pay.hourlyOre ?? 0)} kr. pr. time</b> for de timer, Medarbejderen arbejder og registrerer i Arpo.`
    : commissionOnly
      ? `Lønnen er provision efter den vedlagte provisionsaftale.`
      : `Lønnen er ved tiltrædelse aftalt til <b>brutto ${kr(pay.monthlyOre ?? 0)} kr. pr. måned</b>.`;

  const body = [
    h("Arbejdssted"),
    P(`Medarbejderen er tilknyttet Nextview360's adresse: Danmarksgade 23, st., 9000 Aalborg. Arbejdet udføres også ude hos kunderne og andre steder, som opgaverne kræver.`),
    h("Stillingens indhold"),
    P(`Medarbejderen ansættes som <b>${esc(e.title)}</b>${manager ? ` med reference til ${esc(manager)}` : ""}. Opgaverne er ${esc(e.duties)} og de opgaver, der naturligt hører til stillingen. Opgaverne kan ændre sig i takt med Nextview360's udvikling.`),
    h("Tiltrædelse og anciennitet"),
    P(`Medarbejderen tiltræder sin stilling den <b>${date(e.startDate)}</b>. Al anciennitet regnes fra denne dato.`, e.endDate ? `Ansættelsen er tidsbegrænset og ophører uden opsigelse den <b>${date(e.endDate)}</b>.` : ""),
    h("Prøvetid"),
    P(`${probation}. I prøvetiden kan begge parter opsige ansættelsen med 14 dages varsel til fratræden en hvilken som helst dag.`),
    h("Aflønning"),
    P(
      pay7,
      commission && !commissionOnly ? `Derudover får Medarbejderen provision efter den vedlagte provisionsaftale.` : "",
      `Lønnen${commission ? " og provisionen" : ""} udbetales bagud senest den sidste bankdag i måneden til Medarbejderens NemKonto${commission ? ". Provisionen beskattes som A-indkomst" : ""}.`,
      `Lønnen tages op til forhandling én gang om året. Der er ikke en pensionsordning knyttet til ansættelsen.`
    ),
    h("Arbejdstid"),
    P(
      `Den normale arbejdstid er <b>${num(weekly)} timer om ugen</b>, fordelt på ${esc(workDaysText(e.workDays))}. Medarbejderen registrerer sin daglige arbejdstid i Arpo, som arbejdstidsloven kræver.`,
      fixed ? `Medarbejderen er ansat på funktionsløn. Lønnen dækker derfor også arbejde ud over den normale arbejdstid, som stillingen naturligt kræver.` : hourly ? `Arbejde ud over den aftalte tid betales med timelønnen, når det er aftalt med nærmeste leder.` : "",
      `Nextview360 sørger for, at den gennemsnitlige ugentlige arbejdstid ikke overstiger 48 timer. Medarbejderen aftaler tilrettelæggelsen af arbejdet, ferie og andet fravær med ${manager ? esc(manager) : "nærmeste leder"}.`
    ),
    h("Ferie"),
    P(
      fixed
        ? `Medarbejderen har ret til 25 feriedage om året med løn og et ferietillæg på 1 % efter ferieloven.${commission ? " Af provisionen optjenes feriegodtgørelse på 12,5 %." : ""}`
        : `Medarbejderen har ret til 25 feriedage om året efter ferieloven. I stedet for løn under ferien optjenes feriegodtgørelse på 12,5 % af lønnen${commission ? " og provisionen" : ""}.`,
      `Ferie aftales med Nextview360 og registreres i Arpo.`
    ),
    h("Sygdom og fravær"),
    P(
      `Ved sygdom eller andet fravær giver Medarbejderen besked til ${esc(sickTo)} telefonisk så tidligt som muligt og senest ved arbejdstidens begyndelse på første fraværsdag, og registrerer fraværet i Arpo.`,
      `Nextview360 kan bede om dokumentation for sygdom (en tro og love-erklæring eller en lægeerklæring på Nextview360's regning).`,
      `Medarbejderen får løn under sygdom efter funktionærloven og deltager i kommunens opfølgning ved længerevarende sygdom.`
    ),
    h("Opsigelse"),
    P(
      `Efter prøvetiden kan Medarbejderen opsige ansættelsen med 1 måneds varsel til fratræden ved udgangen af en kalendermåned.`,
      `Nextview360 kan efter prøvetiden opsige ansættelsen til fratræden ved udgangen af en kalendermåned med et varsel på:`
    ) +
      `<ul><li>1 måned inden for de første 5 måneder af ansættelsen (inkl. prøvetid)</li><li>3 måneder inden for 2 år og 9 måneder</li><li>4 måneder inden for 5 år og 8 måneder</li><li>5 måneder inden for 8 år og 7 måneder</li><li>6 måneder herefter.</li></ul>` +
      P(`Opsigelse skal ske skriftligt og være modtageren i hænde senest den sidste dag i måneden.`),
    e.rule120 ? h("120-dages-reglen") : "",
    e.rule120
      ? P(`Uanset varslerne ovenfor kan Nextview360 opsige ansættelsen med 1 måneds varsel til fratræden ved udgangen af en kalendermåned efter funktionærlovens § 5, stk. 2, når alle tre betingelser er opfyldt:`) +
        `<ul><li>Medarbejderen har inden for de seneste 12 måneder fået løn under sygdom i i alt 120 dage (inkl. søn- og helligdage).</li><li>Opsigelsen sker i umiddelbar forbindelse med udløbet af de 120 sygedage.</li><li>Opsigelsen sker, mens Medarbejderen endnu er syg.</li></ul>`
      : "",
    h("Øvrige løngoder"),
    P(
      `<u>Arbejdsplads</u>`,
      `Medarbejderen har en arbejdsplads på kontoret, og der er gratis kaffe, te og sodavand til rådighed.`,
      `<u>Kørsel</u>`,
      `Kørsel i egen bil for arbejdet godtgøres med skattefri kørepenge efter Skattestyrelsens satser, når kørslen er registreret i Arpo.`,
      `<u>Udstyr</u>`,
      `Udstyr, som Nextview360 stiller til rådighed (fx computer, telefon og kameraudstyr), tilhører Nextview360. Det skal behandles forsvarligt og afleveres straks ved fratræden. Privat brug aftales særskilt.`
    ),
    h("Uddannelse"),
    P(`Nextview360 tilbyder den oplæring, stillingen kræver. Uddannelse, som Nextview360 pålægger Medarbejderen, betales af Nextview360 og regnes som arbejdstid.`),
    h("Overenskomst og relevante love"),
    P(`Der er ingen overenskomst, der dækker ansættelsen. Ansættelsen er bl.a. omfattet af funktionærloven, ferieloven, ansættelsesbevisloven og arbejdstidsloven. Nextview360 indbetaler ATP og de øvrige bidrag, loven kræver, gennem lønsystemet.`),
    h("Øvrige væsentlige vilkår"),
    P(
      `<u>Ophavsret, knowhow og opfindelser</u>`,
      `Nextview360 får ejendomsretten til al knowhow og ophavsretten til alt, hvad Medarbejderen frembringer som led i ansættelsen - fx optagelser, fotos, film, droneoptagelser, virtuelle tours, tekster og software - med ret til at bruge, ændre og overdrage det. Medarbejderens ret til at blive navngivet efter ophavsretslovens § 3 respekteres, i det omfang det er sædvanligt. Opfindelser følger lov om arbejdstageres opfindelser. Lønnen dækker enhver godtgørelse herfor, med de ufravigelige undtagelser i den lov.`,
      `<u>Tavshedspligt</u>`,
      `Medarbejderen har både under og efter ansættelsen tavshedspligt om Nextview360's forhold og om alt, Medarbejderen får kendskab til gennem arbejdet - herunder kunder, samarbejdspartnere, priser og kolleger - som efter sin natur ikke bør komme videre. Brud på tavshedspligten er væsentlig misligholdelse og kan medføre erstatningsansvar efter dansk rets almindelige regler.`,
      `<u>Forretningshemmeligheder og markedsføringsloven</u>`,
      `Medarbejderen er bekendt med lov om forretningshemmeligheder og markedsføringslovens § 3 om god markedsføringsskik, som bl.a. betyder, at kendskab til Nextview360's kunder og forretningsmetoder ikke må bruges i et nyt arbejde.`,
      `<u>Repræsentation og loyalitet</u>`,
      `Medarbejderen repræsenterer Nextview360 ansvarligt og loyalt over for kunder, samarbejdspartnere og kolleger og følger Nextview360's anvisninger om arbejdet og sikkerheden. Medarbejderen må ikke under ansættelsen - heller ikke i en opsigelsesperiode - drive eller tage arbejde i konkurrerende virksomhed.`,
      `<u>Bibeskæftigelse</u>`,
      `Medarbejderen må gerne have arbejde ved siden af uden for arbejdstiden, når det ikke konkurrerer med Nextview360, ikke går ud over arbejdet her og overholder arbejdstidsreglerne. Medarbejderen fortæller Nextview360 om bibeskæftigelse.`,
      `<u>IT, e-mail og internet</u>`,
      `Medarbejderen får en arbejdskonto hos Google og adgang til Arpo. De bruges til arbejdet, og i begrænset omfang må e-mail og internet bruges privat. Adgangen lukkes ved fratræden.`,
      `<u>Persondata</u>`,
      `Nextview360 behandler Medarbejderens personoplysninger som beskrevet i den udleverede privatlivsmeddelelse. CPR-nummer og bankoplysninger registreres kun i lønsystemet. Medarbejderen holder sin adresse og sine kontaktoplysninger opdateret i Arpo.`,
      `<u>Udlæg</u>`,
      `Udlæg, Medarbejderen har haft for Nextview360 efter aftale med nærmeste leder, refunderes mod kvittering, når kvitteringen er afleveret senest den 20. i måneden.`,
      `<u>Misligholdelse</u>`,
      `Misligholder en af parterne sine forpligtelser væsentligt, kan den anden part ophæve ansættelsen uden varsel. Skyldes ophævelsen Medarbejderens misligholdelse, har Medarbejderen kun krav på løn indtil fratræden. Den part, der har misligholdt, erstatter den anden parts tab efter dansk rets almindelige regler.`,
      `<u>Tilbagelevering af materiale</u>`,
      `Ved fratræden afleverer Medarbejderen alt, der tilhører Nextview360, også optagelser, filer og andet i digital form. Medarbejderen kan ikke tilbageholde Nextview360's materiale.`
    ),
    terms.length ? h("Særlige vilkår") + terms.map(termText).join("") : "",
    h("Underskrifter"),
    P(`Ansættelseskontrakten underskrives digitalt, og begge parter får en kopi.`),
  ].join("");

  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><style>
  body{font-family:Helvetica,Arial,sans-serif;color:#111;font-size:10pt;line-height:1.5;margin:0;padding:56px 72px 48px}
  h1{font-size:17pt;letter-spacing:.04em;text-align:center;margin:0 0 14px}
  .parter{text-align:center;margin:0 0 18px}.parter b{display:block;margin-top:8px}.parter .og{margin:12px 0 4px}.parter small{color:#444}
  .intro{margin:0 0 6px}
  h2{font-size:10.5pt;margin:16px 0 5px}p{margin:0 0 7px}ul{margin:0 0 7px;padding-left:22px}li{margin:0 0 2px}u{text-underline-offset:2px}
  .sig{display:flex;gap:40px;margin-top:26px;page-break-inside:avoid}.sig>div{flex:1}.sig-box{height:60px;border-bottom:1px solid #333;margin-bottom:6px}.small{color:#555;font-size:9pt}
  </style></head><body>
  <h1>ANSÆTTELSESKONTRAKT</h1>
  <div class="parter">
    <div><b>Parterne</b></div>
    <b>Nextview360 ApS</b>Danmarksgade 23, st.<br>9000 Aalborg<br>CVR 46452445<br><small>(herefter kaldet "Nextview360")</small>
    <div class="og">og</div>
    <b>${esc(name)}</b>${esc(e.homeAddress)}${e.user.email ? `<br>E-mail: ${esc(e.user.email)}` : ""}${e.user.phone ? `<br>Mobil: ${esc(e.user.phone)}` : ""}<br><small>(herefter kaldet "Medarbejderen")</small>
  </div>
  <p class="intro">Der er dags dato indgået følgende <b>ansættelseskontrakt</b> på nedennævnte vilkår:</p>
  ${body}
  <div class="sig">
    <div><div class="sig-box">{{Sign;type=signature;role=Company}}</div><b>For Nextview360 ApS</b><br><span class="small">${esc(CONTRACT_SIGNER.name)}</span><br><span class="small">Dato: {{Date;type=date;role=Company;format=DD/MM/YYYY}}</span></div>
    <div><div class="sig-box">{{Sign;type=signature;role=Employee}}</div><b>Som Medarbejder</b><br><span class="small">${esc(name)}</span><br><span class="small">Dato: {{Date;type=date;role=Employee;format=DD/MM/YYYY}}</span></div>
  </div>
  </body></html>`;
}
