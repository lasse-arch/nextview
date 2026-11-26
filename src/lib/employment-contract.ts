import "server-only";
import type { ContractTerm, Employee, PayTerms } from "@prisma/client";
import { CONTRACT_SIGNER } from "@/lib/contract-template-data";
import { logoDataUri } from "@/lib/contract-html-template";

/*
 * The employment contract for a funktionær - designed like our customer contract (logo, the parties side by side,
 * the key figures in a box, a heading per subject) - only the [fields] are filled in from the employee's card, the pay terms and the "særlige vilkår".
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
    return `<p class="sub-h">Garantiløn</p><p>${when[0].toUpperCase()}${when.slice(1)} er Medarbejderen garanteret en løn på mindst brutto ${kr(t.amountOre ?? 0)} kr. pr. måned. Er den samlede løn for måneden (fast løn, timeløn for de registrerede timer og provision) mindre, betaler Nextview360 forskellen sammen med lønnen. Gælder garantien eller ansættelsen kun en del af en måned, regnes garantien forholdsmæssigt.</p>`;
  return `<p class="sub-h">${esc(t.title)}</p><p>${esc(t.text)} Vilkåret gælder ${when}.</p>`;
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
  const h = (title: string) => `<p class="section-title">${title}</p>`;
  const P = (...lines: string[]) => lines.filter(Boolean).map((l) => (l.startsWith("<u>") ? `<p class="sub-h">${l.slice(3, -4)}</p>` : `<p>${l}</p>`)).join("");
  // The first time Arpo is named, it says what it is.
  let arpoNamed = false;
  const arpo = () => (arpoNamed ? "Arpo" : ((arpoNamed = true), "Arpo (Nextview360's CRM-system)"));
  const field = (label: string, value: string) => `<div class="field-row"><span class="field-label">${esc(label)}</span><span class="field-value">${esc(value)}</span></div>`;
  const probation = e.probationEnd ? `Prøvetiden løber til og med den ${date(e.probationEnd)}` : "De første 3 måneder af ansættelsen er gensidig prøvetid";

  const pay7 = hourly
    ? `Lønnen er ved tiltrædelse aftalt til <b>brutto ${kr(pay.hourlyOre ?? 0)} kr. pr. time</b> for de timer, Medarbejderen arbejder og registrerer i ${arpo()}.`
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
      `Den normale arbejdstid er <b>${num(weekly)} timer om ugen</b>, fordelt på ${esc(workDaysText(e.workDays))}. Medarbejderen registrerer sin daglige arbejdstid i ${arpo()}, som arbejdstidsloven kræver.`,
      fixed ? `Medarbejderen er ansat på funktionsløn. Lønnen dækker derfor også arbejde ud over den normale arbejdstid, som stillingen naturligt kræver.` : hourly ? `Arbejde ud over den aftalte tid betales med timelønnen, når det er aftalt med nærmeste leder.` : "",
      `Nextview360 sørger for, at den gennemsnitlige ugentlige arbejdstid ikke overstiger 48 timer. Medarbejderen aftaler tilrettelæggelsen af arbejdet, ferie og andet fravær med ${manager ? esc(manager) : "nærmeste leder"}.`
    ),
    h("Ferie"),
    P(
      fixed
        ? `Medarbejderen har ret til 25 feriedage om året med løn og et ferietillæg på 1 % efter ferieloven.${commission ? " Af provisionen optjenes feriegodtgørelse på 12,5 %." : ""}`
        : `Medarbejderen har ret til 25 feriedage om året efter ferieloven. I stedet for løn under ferien optjenes feriegodtgørelse på 12,5 % af lønnen${commission ? " og provisionen" : ""}.`,
      `Ferie aftales med Nextview360 og registreres i ${arpo()}.`
    ),
    h("Sygdom og fravær"),
    P(
      `Ved sygdom eller andet fravær giver Medarbejderen besked til ${esc(sickTo)} telefonisk så tidligt som muligt og senest ved arbejdstidens begyndelse på første fraværsdag, og registrerer fraværet i ${arpo()}.`,
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
      `Kørsel i egen bil for arbejdet godtgøres med skattefri kørepenge efter Skattestyrelsens satser, når kørslen er registreret i ${arpo()}.`,
      `<u>Udstyr</u>`,
      `Udstyr, som Nextview360 stiller til rådighed (fx computer og kameraudstyr), tilhører Nextview360. Det skal behandles forsvarligt og afleveres straks ved fratræden. Privat brug aftales særskilt.`
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
      `Medarbejderen får en arbejdskonto hos Google og adgang til ${arpo()}. De bruges til arbejdet, og i begrænset omfang må e-mail og internet bruges privat. Adgangen lukkes ved fratræden.`,
      `<u>Persondata</u>`,
      `Nextview360 behandler Medarbejderens personoplysninger som beskrevet i den udleverede privatlivsmeddelelse. CPR-nummer og bankoplysninger registreres kun i lønsystemet. Medarbejderen holder sin adresse og sine kontaktoplysninger opdateret i ${arpo()}.`,
      `<u>Misligholdelse</u>`,
      `Misligholder en af parterne sine forpligtelser væsentligt, kan den anden part ophæve ansættelsen uden varsel. Skyldes ophævelsen Medarbejderens misligholdelse, har Medarbejderen kun krav på løn indtil fratræden. Den part, der har misligholdt, erstatter den anden parts tab efter dansk rets almindelige regler.`,
      `<u>Tilbagelevering af materiale</u>`,
      `Ved fratræden afleverer Medarbejderen alt, der tilhører Nextview360, også optagelser, filer og andet i digital form. Medarbejderen kan ikke tilbageholde Nextview360's materiale.`
    ),
    terms.length ? `${h("Særlige vilkår")}<div class="terms">${terms.map(termText).join("")}</div>` : "",
  ].join("");

  const payLine = hourly ? `${kr(pay.hourlyOre ?? 0)} kr. pr. time` : commissionOnly ? "Provision" : `${kr(pay.monthlyOre ?? 0)} kr. pr. måned`;
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><title>Ansættelseskontrakt ${esc(name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root{--ink:#16233F;--fill:#EAF2FF;--fill-border:#CFE0FB;--line:#E4E7EC}
  *{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}
  body{font-family:'Inter',system-ui,-apple-system,Segoe UI,sans-serif;color:var(--ink);font-size:13.5px;line-height:1.55;-webkit-font-smoothing:antialiased}
  .page{max-width:760px;margin:0 auto;padding:48px 48px 56px}
  .masthead{text-align:center;margin-bottom:6px}.masthead img{height:40px;margin:0 auto 16px;display:block}
  .doc-title{font-size:24px;font-weight:800;letter-spacing:-.01em;margin:0 0 4px}.doc-subtitle{font-size:14px;margin:0 0 18px}
  .between-label{font-size:13px;margin:0 0 10px}
  .party-grid{display:flex;flex-wrap:wrap;border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-bottom:12px}
  .party-col{flex:1 1 0;min-width:220px;padding:16px 18px}.party-col+.party-col{border-left:1px solid var(--line)}
  .party-name{font-weight:700;font-size:15px;margin:0 0 2px}.party-role{font-size:12px;margin:0 0 10px}
  .field-row{display:flex;justify-content:space-between;gap:12px;padding:3px 0;font-size:13px}
  .field-value{background:var(--fill);border:1px solid var(--fill-border);border-radius:6px;padding:2px 8px;font-weight:500;text-align:right}
  .overview{background:#F8FAFC;border:1px solid var(--line);border-radius:12px;padding:14px 20px;margin:14px 0 6px}
  .overview .field-row{font-size:13.5px;padding:4px 0}.overview .field-row:not(:last-child){border-bottom:1px solid #ECEFF3}.overview .field-label{font-weight:600}
  .section-title{font-size:16px;font-weight:700;margin:22px 0 6px}
  .sub-h{font-weight:600;font-size:13.5px;margin:12px 0 3px!important}
  p{margin:0 0 8px}ul{margin:0 0 8px;padding-left:20px}li{margin-bottom:4px}
  .terms{border:1px solid var(--line);border-radius:12px;padding:6px 18px 8px;margin-top:4px}
  .sig-title{font-size:19px;font-weight:800;margin:28px 0 16px}
  .sig-grid{display:flex;flex-wrap:wrap;gap:40px;page-break-inside:avoid;break-inside:avoid}.sig-grid>div{flex:1 1 0;min-width:220px}
  .sig-party{font-size:13px;font-weight:700;margin-bottom:12px}.sig-box{border-bottom:1px solid var(--ink);height:56px;margin-bottom:10px}
  .sig-meta{font-size:12.5px;line-height:1.6}.sig-meta b{font-weight:600}
</style></head><body><div class="page">
  <div class="masthead">
    <img src="${logoDataUri()}" alt="Nextview360">
    <h1 class="doc-title">Ansættelseskontrakt</h1>
    <p class="doc-subtitle">Nextview360 ApS</p>
  </div>
  <p class="between-label">Der er dags dato indgået følgende ansættelseskontrakt mellem:</p>
  <div class="party-grid">
    <div class="party-col">
      <p class="party-name">Nextview360 ApS</p>
      <p class="party-role">Arbejdsgiver (herefter "Nextview360")</p>
      ${field("CVR", "46452445")}
      ${field("Adresse", "Danmarksgade 23, st., 9000 Aalborg")}
      ${field("Underskriver", CONTRACT_SIGNER.name)}
    </div>
    <div class="party-col">
      <p class="party-name">${esc(name)}</p>
      <p class="party-role">Medarbejder (herefter "Medarbejderen")</p>
      ${field("Adresse", e.homeAddress ?? "")}
      ${e.user.email ? field("E-mail", e.user.email) : ""}
      ${e.user.phone ? field("Mobil", e.user.phone) : ""}
    </div>
  </div>
  <div class="overview">
    ${field("Stilling", e.title)}
    ${field("Første arbejdsdag", date(e.startDate))}
    ${field("Arbejdstid", `${num(weekly)} timer om ugen`)}
    ${field("Løn", payLine + (commission && !commissionOnly ? " + provision" : ""))}
  </div>
  ${body}
  <p class="sig-title">Underskrifter</p>
  <p>Ansættelseskontrakten underskrives digitalt, og begge parter får en kopi.</p>
  <div class="sig-grid">
    <div><p class="sig-party">For Nextview360 ApS</p><div class="sig-box">{{Sign;type=signature;role=Company}}</div><p class="sig-meta"><b>${esc(CONTRACT_SIGNER.name)}</b><br>{{Date;type=date;role=Company;format=DD/MM/YYYY}}</p></div>
    <div><p class="sig-party">Som Medarbejder</p><div class="sig-box">{{Sign;type=signature;role=Employee}}</div><p class="sig-meta"><b>${esc(name)}</b><br>{{Date;type=date;role=Employee;format=DD/MM/YYYY}}</p></div>
  </div>
</div></body></html>`;
}
