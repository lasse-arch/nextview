import "server-only";
import type { ContractTerm, Employee, PayTerms } from "@prisma/client";
import { CONTRACT_SIGNER } from "@/lib/contract-template-data";

/*
 * The employment contract for a funktionær - the text Lasse approved (26 November 2026), word for word; only the
 * [fields] are filled in from the employee's card. Change the wording only after a new approval.
 * DocuSeal finds the signature and date fields from the {{…;role=X}} tags (see contract-html-template.ts).
 *
 * Waiting for approval: § 7 for pay by the hour or commission only, and § 17 "Særlige vilkår" (a guarantee or other terms).
 * Until NEW_TEXT_APPROVED is true, a contract that uses them can be read as a PDF but not sent.
 */
export const NEW_TEXT_APPROVED = false;

/** Does this contract use text that still waits for approval? */
export const usesUnapprovedText = (pay: Pick<PayTerms, "model"> | undefined, terms: unknown[]) => !NEW_TEXT_APPROVED && (pay?.model === "COMMISSION_ONLY" || pay?.model === "HOURLY" || terms.length > 0);

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
    return `<b>Garantiløn:</b> ${when[0].toUpperCase()}${when.slice(1)} er medarbejderen garanteret en løn på mindst ${kr(t.amountOre ?? 0)} kr. om måneden før skat. Er lønnen og provisionen tilsammen mindre i en måned, betaler Nextview360 forskellen sammen med lønnen. Gælder garantien eller ansættelsen kun en del af en måned, regnes garantien forholdsmæssigt.`;
  return `<b>${esc(t.title)}:</b> ${esc(t.text)} Vilkåret gælder ${when}.`;
}

export function employmentContractHtml(e: Employee & { user: { name: string; lastName: string | null; email?: string; phone?: string | null } }, pay: PayTerms, sickTo: string, terms: Term[] = []): string {
  const name = `${e.user.name}${e.user.lastName ? ` ${e.user.lastName}` : ""}`;
  const weekly = e.weeklyMinutes / 60;
  const daily = weekly / Math.max(1, e.workDays.length);
  const commission = pay.model === "MONTHLY_COMMISSION" || pay.model === "COMMISSION_ONLY";
  const p = (n: number, title: string, body: string) => `<h2>${n}. ${title}</h2>${body}`;
  const sections = [
    p(1, "Parterne", `<p>Arbejdsgiver: Nextview360 ApS, CVR 46452445, Danmarksgade 23, st., 9000 Aalborg.<br>Medarbejder: ${esc(name)}, ${esc(e.homeAddress)}.${e.user.email ? `<br>E-mail: ${esc(e.user.email)}` : ""}${e.user.phone ? `, telefon: ${esc(e.user.phone)}` : ""}</p>`),
    p(2, "Arbejdssted", `<p>Arbejdsstedet er Danmarksgade 23, st., 9000 Aalborg. Arbejdet udføres også ude hos kunderne og andre steder, som opgaverne kræver.</p>`),
    p(3, "Stilling og opgaver", `<p>Medarbejderen ansættes som ${esc(e.title)}. Opgaverne er ${esc(e.duties)} og de opgaver, der naturligt hører til stillingen.</p>`),
    p(
      4,
      "Tiltrædelse",
      `<p>Ansættelsen begynder den ${date(e.startDate)}. ${e.endDate ? `Ansættelsen er tidsbegrænset og ophører uden opsigelse den ${date(e.endDate)}.` : "Ansættelsen er tidsubegrænset."}</p>`
    ),
    p(5, "Prøvetid", `<p>De første 3 måneder er prøvetid. I prøvetiden kan begge parter opsige ansættelsen med 14 dages varsel til fratræden en hvilken som helst dag.</p>`),
    p(
      6,
      "Arbejdstid",
      `<p>Den normale arbejdstid er ${num(weekly)} timer om ugen, i gennemsnit ${num(daily)} timer om dagen, fordelt på ${esc(workDaysText(e.workDays))}. Medarbejderen registrerer sin daglige arbejdstid i Arpo, som arbejdstidsloven kræver. Lønnen dækker også arbejde ud over den normale arbejdstid, som stillingen naturligt kræver. Nextview360 sørger for, at den gennemsnitlige ugentlige arbejdstid ikke overstiger 48 timer.</p>`
    ),
    p(
      7,
      "Løn",
      pay.model === "HOURLY"
        ? `<p>Lønnen er ${kr(pay.hourlyOre ?? 0)} kr. i timen for de timer, medarbejderen arbejder og registrerer i Arpo. Den udbetales bagud den sidste bankdag i måneden til medarbejderens NemKonto. ${commission ? "Medarbejderen får desuden provision efter den vedlagte provisionsaftale. Provisionen udbetales sammen med lønnen og beskattes som A-indkomst. " : ""}Lønnen tages op til forhandling én gang om året. Der er ikke en pensionsordning knyttet til ansættelsen.</p>`
        : pay.model === "COMMISSION_ONLY"
        ? `<p>Lønnen er provision efter den vedlagte provisionsaftale. Den udbetales bagud den sidste bankdag i måneden til medarbejderens NemKonto og beskattes som A-indkomst. Lønnen tages op til forhandling én gang om året. Der er ikke en pensionsordning knyttet til ansættelsen.</p>`
        : `<p>Lønnen er ${kr(pay.monthlyOre ?? 0)} kr. om måneden og udbetales bagud den sidste bankdag i måneden til medarbejderens NemKonto. ${commission ? "Medarbejderen får desuden provision efter den vedlagte provisionsaftale. Provisionen udbetales sammen med lønnen og beskattes som A-indkomst. " : ""}Lønnen tages op til forhandling én gang om året. Der er ikke en pensionsordning knyttet til ansættelsen.</p>`
    ),
    p(8, "Ferie", `<p>Medarbejderen har ret til ferie efter ferieloven, dvs. 25 dage om året med løn og et ferietillæg på 1 %. Ferie aftales med Nextview360.</p>`),
    p(
      9,
      "Personalegoder",
      `<p>Medarbejderen har en arbejdsplads på kontoret, og der er gratis kaffe, te og sodavand til rådighed. Kørsel i egen bil for arbejdet godtgøres med skattefri kørepenge efter Skattestyrelsens satser.</p>`
    ),
    p(10, "Sygdom", `<p>Ved sygdom melder medarbejderen sig syg til ${esc(sickTo)} så tidligt som muligt på første sygedag. Medarbejderen får løn under sygdom efter funktionærloven.</p>`),
    p(
      11,
      "Opsigelse",
      `<p>Funktionærlovens regler om opsigelse gælder. Har medarbejderen fået løn under sygdom i i alt 120 dage inden for 12 på hinanden følgende måneder, kan Nextview360 opsige ansættelsen med 1 måneds varsel til fratræden ved udgangen af en måned, jf. funktionærlovens § 5, stk. 2. Opsigelsen skal gives i umiddelbar forbindelse med udløbet af de 120 sygedage, mens medarbejderen endnu er syg.</p>`
    ),
    p(12, "Uddannelse", `<p>Nextview360 tilbyder den oplæring, stillingen kræver. Uddannelse, som Nextview360 pålægger medarbejderen, betales af Nextview360 og regnes som arbejdstid.</p>`),
    p(13, "Overenskomst", `<p>Ansættelsen er ikke omfattet af en overenskomst.</p>`),
    p(14, "Tavshedspligt", `<p>Medarbejderen har tavshedspligt om forretningshemmeligheder og om oplysninger om kunder og kolleger, også efter ansættelsen er ophørt.</p>`),
    p(15, "Behandling af personoplysninger", `<p>Nextview360 behandler medarbejderens personoplysninger som beskrevet i den udleverede privatlivsmeddelelse.</p>`),
    p(16, "Sociale sikringsordninger", `<p>Nextview360 indbetaler ATP og de øvrige bidrag, loven kræver, gennem lønsystemet.</p>`),
    ...(terms.length ? [p(17, "Særlige vilkår", terms.map((t) => `<p style="margin-bottom:6px">${termText(t)}</p>`).join(""))] : []),
  ];
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><style>
  body{font-family:Helvetica,Arial,sans-serif;color:#111;font-size:10.5pt;line-height:1.55;margin:0;padding:64px 72px 48px}
  h1{font-size:20pt;margin:0 0 4px}p.sub{color:#555;margin:0 0 18px}h2{font-size:11pt;margin:16px 0 4px}p{margin:0}
  .sig{display:flex;gap:40px;margin-top:36px;page-break-inside:avoid}.sig>div{flex:1}.sig-box{height:60px;border-bottom:1px solid #333;margin-bottom:6px}.small{color:#555;font-size:9pt}
  </style></head><body>
  <h1>Ansættelseskontrakt</h1><p class="sub">Nextview360 ApS og ${esc(name)}</p>
  ${sections.join("")}
  <div class="sig">
    <div><div class="sig-box">{{Sign;type=signature;role=Company}}</div><b>Nextview360 ApS</b><br><span class="small">${esc(CONTRACT_SIGNER.name)}</span><br><span class="small">Dato: {{Date;type=date;role=Company;format=DD/MM/YYYY}}</span></div>
    <div><div class="sig-box">{{Sign;type=signature;role=Employee}}</div><b>Medarbejderen</b><br><span class="small">${esc(name)}</span><br><span class="small">Dato: {{Date;type=date;role=Employee;format=DD/MM/YYYY}}</span></div>
  </div>
  </body></html>`;
}
