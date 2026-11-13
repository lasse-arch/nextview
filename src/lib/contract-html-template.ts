import fs from "node:fs";
import path from "node:path";
import type { ContractHtmlData, ContractLanguage } from "@/lib/contract-template-data";
import { CONTRACT_SIGNER } from "@/lib/contract-template-data";

const LOGO_PATH = path.join(process.cwd(), "public/logo.png");

function logoDataUri(): string {
  const buf = fs.readFileSync(LOGO_PATH);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

const COMPANY = {
  name: "Nextview360 ApS",
  cvr: "46452445",
  address: "Vesterbro 18, st., 9000 Aalborg",
};

type Labels = {
  docTitle: string;
  between: string;
  supplier: string;
  customer: string;
  cvr: string;
  address: string;
  contact: string;
  email: string;
  phone: string;
  section1Title: string;
  section1Body: (count: number) => string;
  section2Title: string;
  products: {
    nextviewTour: {
      name: string;
      sub: string;
      bullets: string[];
      quantityLabel: string;
      unitPriceLabel: string;
      totalPriceLabel: string;
      /** The table for a customer with several locations - one tour per location. */
      locationsIntro: string;
      locationCol: string;
      addressCol: string;
      setupCol: string;
      monthlyCol: string;
      totalRow: string;
    };
    hjemmeside: { name: string; bulletsSubscription: string[]; bulletsOneTime: string[]; setupLabel: string; priceLabel: string };
    droneOptagelse: { name: string; bullets: string[]; priceLabel: string };
    visitkort: { name: string; sub: string; bullets: string[]; quantityLabel: string; priceLabel: string };
  };
  overviewSetup: string;
  overviewPrice: string;
  overviewNote: string;
  overviewNoteOnApproval: string;
  additionalTermsTitle: string;
  section3Title: string;
  section3Body: string;
  /** Section 3 when the agreement does not renew itself. */
  section3BodyFixed: string;
  bindingLabel: string;
  noticeLabel: string;
  monthsSuffix: string;
  section4Title: string;
  section4Body: string[];
  section5Title: string;
  section5Body: string;
  section6Title: string;
  section6Body: string;
  section7Title: string;
  section7Body: string;
  /** The data processing agreement (GDPR art. 28) - its section, and Appendix 1 (approved text, 2026-11-13). */
  dpa: {
    title: (n: number) => string;
    body: string;
    appendixTitle: string;
    basisTitle: string;
    basis: string;
    sections: { title: string; items?: [string, string][]; text?: string; table?: { cols: [string, string, string]; rows: [string, string, string][]; after: string } }[];
  };
  signaturesTitle: string;
  invoiceEmailLabel: string;
};

const LABELS: Record<ContractLanguage, Labels> = {
  da: {
    docTitle: "Samarbejdsaftale",
    between: "Mellem",
    supplier: "Leverandør",
    customer: "Kunde",
    cvr: "CVR",
    address: "Adresse",
    contact: "Kontakt",
    email: "E-mail",
    phone: "Telefon",
    section1Title: "1) Aftalens genstand",
    section1Body: (count) =>
      count <= 1
        ? "Leverandøren leverer den i denne aftale valgte ydelse til kunden. Ydelsen, der er en del af denne aftale, og dens pris, fremgår af afsnit 2 nedenfor."
        : "Leverandøren leverer de i denne aftale valgte ydelser til kunden. Ydelserne, der er en del af denne aftale, og deres pris, fremgår af afsnit 2 nedenfor.",
    section2Title: "2) Produkter, ydelser & pris",
    products: {
      nextviewTour: {
        name: "Nextview360 Tour",
        sub: "— 360° virtuel rundvisning",
        bullets: [
          "Fuldt optimeret virtuel rundvisning med produkt- og infohotspots",
          "Udgivelse på egen hjemmeside – med koder til hele touren og til hvert sted i den",
          "Touren på flere sprog efter behov – inkluderet",
          "Adgang til egen kundeportal med statistik, der opdateres løbende: antal besøg, hvor de besøgende går hen og bliver længst, hvad de klikker på, og hvor mange der går videre til booking eller kontakt. Her findes også koderne til hjemmesiden, rettelser til touren og kontrakten",
          "Besøgsrapport på mail hver måned, hver 2. eller hver 3. måned – kunden vælger selv",
          "Løbende opdatering og udvikling af touren og platformen samt support",
          "1 årlig genoptagelse pr. lokation – yderligere genoptagelser aftales til en pris pr. optagelse",
          "Billeder i høj kvalitet, taget i forbindelse med den virtuelle tour, som kunden frit kan bruge – fx på hjemmeside, sociale medier og i markedsføring",
        ],
        quantityLabel: "Antal lokationer",
        unitPriceLabel: "Etableringspris (eks. moms)",
        totalPriceLabel: "Pris pr. måned (eks. moms)",
        locationsIntro: "Aftalen omfatter en tour for hver af kundens lokationer herunder. Hver lokation har sin egen etableringspris og månedlige pris.",
        locationCol: "Lokation",
        addressCol: "Adresse",
        setupCol: "Etablering",
        monthlyCol: "Pr. måned",
        totalRow: "I alt (eks. moms)",
      },
      hjemmeside: {
        name: "Nextview360 hjemmeside",
        bulletsSubscription: [
          "Design og opsætning af hjemmeside tilpasset kundens branding",
          "Responsivt design, der fungerer på mobil, tablet og computer",
          "<b>Hosting og løbende drift inkluderet i abonnementet</b>",
          "Mindre tekst- og billedopdateringer",
        ],
        bulletsOneTime: [
          "Design og opsætning af hjemmeside tilpasset kundens branding",
          "Responsivt design, der fungerer på mobil, tablet og computer",
        ],
        setupLabel: "Etableringspris (engangs, eks. moms)",
        priceLabel: "Pris pr. måned (eks. moms)",
      },
      droneOptagelse: {
        name: "Drone-optagelse",
        bullets: [
          "Luftfoto- og videooptagelse tilpasset kundens behov",
          "Erfarne dronepiloter",
          "Efterbehandling og redigering af optaget materiale",
          "Levering af billeder/video i høj kvalitet til fri afbenyttelse",
        ],
        priceLabel: "Pris (engangsbeløb, eks. moms)",
      },
      visitkort: {
        name: "Visitkort",
        sub: "",
        bullets: [
          "Professionelt design tilpasset kundens visuelle identitet",
          "Tryk i høj kvalitet på valgfrit papir/finish",
          "Hurtig levering",
        ],
        quantityLabel: "Antal",
        priceLabel: "Pris i alt (engangsbeløb, eks. moms)",
      },
    },
    overviewSetup: "Samlet etableringspris (eks. moms)",
    overviewPrice: "Samlet månedlig pris (eks. moms)",
    overviewNote: "Etableringsprisen betales ved underskrift af kontrakten, med mindre andet er angivet i Yderligere betingelser.",
    overviewNoteOnApproval:
      "Etableringsprisen faktureres, når produktet er leveret og godkendt af kunden. Har kunden ikke inden for 7 dage efter levering skriftligt påpeget konkrete mangler, anses produktet for godkendt. Påpeger kunden mangler, udbedrer Nextview360 dem, hvorefter produktet anses for godkendt.",
    additionalTermsTitle: "Yderligere betingelser",
    section3Title: "3) Løbetid og opsigelse",
    section3Body:
      "Aftalen træder i kraft ved underskrift af begge parter. Bindingsperioden starter, når det/de valgte produkt(er) er leveret til kunden. Aftalen forlænges automatisk med en periode af samme længde som bindingsperioden, medmindre den opsiges skriftligt med det opsigelsesvarsel, der står herunder, til udgangen af den løbende periode.",
    section3BodyFixed:
      "Aftalen træder i kraft ved underskrift af begge parter. Bindingsperioden starter, når det/de valgte produkt(er) er leveret til kunden. Aftalen forlænges ikke automatisk: den ophører ved bindingsperiodens udløb, medmindre parterne skriftligt aftaler at forlænge den. Det er derfor ikke nødvendigt at opsige aftalen.",
    bindingLabel: "Bindingsperiode",
    noticeLabel: "Opsigelsesvarsel",
    monthsSuffix: "måneder",
    section4Title: "4) Betaling",
    section4Body: [
      "Fakturering sker kvartalsvist forud (netto 8 dage), medmindre andet er angivet under Yderligere betingelser.",
      "Betaling sker via faktura eller efter aftale om automatisk betaling. Forsinket betaling påløber rente efter renteloven.",
      "Betales en faktura ikke senest 14 dage efter forfald, og er der sendt en skriftlig rykker, kan leverandøren lukke for de løbende ydelser – fx touren eller hjemmesiden – indtil der er betalt. Ved væsentlig misligholdelse, herunder gentagen manglende betaling, kan leverandøren hæve aftalen, og det resterende beløb for den løbende periode forfalder da straks til betaling. Rykkergebyr og inkassoomkostninger opkræves efter gældende regler.",
    ],
    section5Title: "5) Fortrolighed",
    section5Body:
      "Begge parter forpligter sig til at behandle fortrolige oplysninger om modparten som fortrolige. Oplysninger må ikke videregives til tredjepart uden forudgående skriftligt samtykke.",
    section6Title: "6) Ansvar",
    section6Body:
      "Leverandørens ansvar er begrænset til direkte tab forårsaget af grov uagtsomhed eller forsæt. Eventuel erstatning kan ikke overstige det samlede beløb, kunden har betalt inden for de seneste 12 måneder under denne aftale.",
    section7Title: "7) Brug som reference",
    section7Body:
      "Kunden giver Nextview360 ret til at bruge den virtuelle tour, billeder og video fra optagelsen samt kundens navn og logo som reference i Nextview360's markedsføring – fx på Nextview360's hjemmeside, på sociale medier, i præsentationer og i salgsmateriale. Nextview360 præsenterer altid kunden på en ordentlig og flot måde, der afspejler kunden positivt. Retten gælder i aftalens løbetid og i op til 12 måneder efter dens ophør, og den er en undtagelse fra fortroligheden i afsnit 5. Statistik og andre oplysninger fra kundeportalen bruges ikke uden kundens skriftlige samtykke.",
    dpa: {
      title: (n) => `${n}) Databehandling`,
      body: "Når Nextview360 behandler personoplysninger for Kunden, sker det efter databehandleraftalen i Bilag 1. Bilaget er en del af denne aftale og underskrives sammen med den. Kunden er dataansvarlig, og Nextview360 er databehandler.",
      appendixTitle: "Bilag 1: Databehandleraftale",
      basisTitle: "Grundlag",
      basis: "Parterne bruger EU-Kommissionens standardkontraktbestemmelser for databehandlere (gennemførelsesafgørelse (EU) 2021/915, i Datatilsynets danske udgave). Bestemmelserne gælder uændret, og punkterne herunder er deres bilag A–D.",
      sections: [
        {
          title: "A. Hvad vi behandler og hvorfor",
          items: [
            ["Formål", "At levere Kundens virtuelle tour, kontaktformular, konkurrencer og kundeportal."],
            ["Hvem oplysningerne handler om", "Besøgende, der skriver til Kunden gennem touren eller deltager i en konkurrence. Personer, der kan ses på billeder og film i touren. Kundens egne brugere af kundeportalen."],
            ["Hvilke oplysninger", "Navn, e-mail, telefon og den besked, personen selv skriver. Billeder og film af personer i Kundens lokaler. Login-e-mail til kundeportalen."],
            ["Ingen følsomme oplysninger", "Der behandles ikke følsomme oplysninger, medmindre Kunden selv beder besøgende om det."],
            ["Hvad vi ikke gemmer", "Besøgsstatistikken gemmer ikke IP-adresser eller andet, der kan bruges til at genkende den enkelte besøgende."],
            ["Hvor længe", "Så længe aftalen løber. Henvendelser fra kontaktformularen gemmes i 12 måneder, medmindre Kunden ønsker andet."],
          ],
        },
        {
          title: "B. Underleverandører",
          text: "Kunden godkender disse underleverandører. Vi giver besked mindst 30 dage før, vi tager en ny i brug, og Kunden kan sige nej.",
          table: {
            cols: ["Leverandør", "Bruges til", "Hvor"],
            rows: [
              ["Vercel Inc.", "Drift af hjemmeside og kundeportal, filer", "EU"],
              ["Neon Inc.", "Database", "EU"],
              ["Cloudflare Inc.", "Visning af den udgivne tour", "EU / USA"],
              ["Matterport Inc.", "3D-scanninger og 360°-billeder", "USA"],
              ["Resend Inc.", "Afsendelse af kontaktformularer og login-mails", "USA"],
              ["Anthropic PBC", "nextviewAI: tjek af billeder for personer, så de kan skjules", "USA"],
            ],
            after: "Overførsel til USA sker efter EU-USA-ordningen (Data Privacy Framework) eller EU's standardkontrakt for overførsler.",
          },
        },
        {
          title: "C. Instruks og sikkerhed",
          items: [
            ["Kun efter Kundens instruks", "Vi bruger kun oplysningerne til formålet i punkt A."],
            ["Adgang", "Kun medarbejdere, der skal bruge oplysningerne, har adgang. De har tavshedspligt og logger ind personligt."],
            ["Beskyttelse", "Al trafik er krypteret (HTTPS). Adgangskoder og nøgler gemmes ikke i koden."],
            ["Personer på billeder", "Personer, der kan genkendes på billeder i touren, kan skjules på Kundens anmodning."],
            ["Brud", "Opdager vi et brud på sikkerheden, giver vi Kunden besked uden unødig forsinkelse og senest inden for 48 timer."],
            ["Hjælp til Kunden", "Vi hjælper Kunden, hvis en person beder om at se, rette eller slette sine oplysninger."],
          ],
        },
        {
          title: "D. Når aftalen slutter",
          text: "Inden for 30 dage efter aftalens ophør sletter vi Kundens personoplysninger, eller vi giver dem tilbage, hvis Kunden beder om det. Det gælder ikke, hvis loven kræver, at vi gemmer dem.",
        },
      ],
    },
    signaturesTitle: "Underskrifter",
    invoiceEmailLabel: "E-mail til fakturaer",
  },
  en: {
    docTitle: "Subscription Agreement",
    between: "Between",
    supplier: "Supplier",
    customer: "Customer",
    cvr: "Company Reg. No.",
    address: "Address",
    contact: "Contact",
    email: "Email",
    phone: "Phone",
    section1Title: "1) Subject of the Agreement",
    section1Body: (count) =>
      count <= 1
        ? "The Supplier shall deliver the service selected in this agreement to the Customer. The service that is part of this agreement, and its price, is set out in section 2 below."
        : "The Supplier shall deliver the services selected in this agreement to the Customer. The services that are part of this agreement, and their prices, are set out in section 2 below.",
    section2Title: "2) Products, Services & Pricing",
    products: {
      nextviewTour: {
        name: "Nextview360 Tour",
        sub: "— 360° virtual tour",
        bullets: [
          "Fully optimized virtual tour with product and info hotspots",
          "Published on the customer's own website – with codes for the whole tour and for each place in it",
          "The tour in several languages as needed – included",
          "Access to the customer's own portal with continuously updated statistics: number of visits, where visitors go and stay longest, what they click on, and how many go on to booking or contact. The portal also holds the website codes, tour change requests and the contract",
          "Visitor report by e-mail every month, every 2 or every 3 months – the customer chooses",
          "Ongoing updates and development of the tour and the platform, plus support",
          "1 annual re-shoot per location – further re-shoots are agreed at a price per shoot",
          "High-quality images, taken in connection with the virtual tour, which the customer may use freely – e.g. on their website, social media and in marketing",
        ],
        quantityLabel: "Number of locations",
        unitPriceLabel: "Setup fee (excl. VAT)",
        totalPriceLabel: "Price per month (excl. VAT)",
        locationsIntro: "This agreement covers a tour for each of the Customer's locations below. Each location has its own setup fee and monthly price.",
        locationCol: "Location",
        addressCol: "Address",
        setupCol: "Setup",
        monthlyCol: "Per month",
        totalRow: "Total (excl. VAT)",
      },
      hjemmeside: {
        name: "Nextview360 Website",
        bulletsSubscription: [
          "Website design and setup tailored to the customer's branding",
          "Responsive design that works on mobile, tablet and desktop",
          "<b>Hosting and ongoing operation included in the subscription</b>",
          "Minor text and image updates",
        ],
        bulletsOneTime: [
          "Website design and setup tailored to the customer's branding",
          "Responsive design that works on mobile, tablet and desktop",
        ],
        setupLabel: "Setup fee (one-off, excl. VAT)",
        priceLabel: "Price per month (excl. VAT)",
      },
      droneOptagelse: {
        name: "Drone Footage",
        bullets: [
          "Aerial photo and video footage tailored to the customer's needs",
          "Experienced drone pilots",
          "Post-production and editing of the captured material",
          "Delivery of high-quality images/video for the customer's free use",
        ],
        priceLabel: "Price (one-off, excl. VAT)",
      },
      visitkort: {
        name: "Business Cards",
        sub: "",
        bullets: [
          "Professional design tailored to the customer's visual identity",
          "High-quality print on paper/finish of choice",
          "Fast delivery",
        ],
        quantityLabel: "Quantity",
        priceLabel: "Total price (one-off, excl. VAT)",
      },
    },
    overviewSetup: "Total setup fee (excl. VAT)",
    overviewPrice: "Total monthly price (excl. VAT)",
    overviewNote: "The setup fee is due on signing of the contract, unless otherwise stated under Additional Terms.",
    overviewNoteOnApproval:
      "The setup fee is invoiced once the product has been delivered and approved by the customer. If the customer has not pointed out specific defects in writing within 7 days of delivery, the product is deemed approved. If the customer points out defects, Nextview360 remedies them, after which the product is deemed approved.",
    additionalTermsTitle: "Additional Terms",
    section3Title: "3) Term and Termination",
    section3Body:
      "This agreement takes effect once signed by both parties. The binding period begins once the selected product(s) have been delivered to the Customer. The agreement is automatically renewed for a period of the same length as the binding period, unless it is terminated in writing with the notice period stated below, effective at the end of the current period.",
    section3BodyFixed:
      "This agreement takes effect once signed by both parties. The binding period begins once the selected product(s) have been delivered to the Customer. The agreement is not renewed automatically: it ends when the binding period expires, unless the parties agree in writing to extend it. Notice of termination is therefore not required.",
    bindingLabel: "Binding period",
    noticeLabel: "Notice period",
    monthsSuffix: "months",
    section4Title: "4) Payment",
    section4Body: [
      "Invoicing is quarterly in advance (net 8 days), unless otherwise stated under Additional Terms.",
      "Payment is made by invoice or by agreement on automatic payment. Late payment accrues interest under the Danish Interest Act.",
      "If an invoice is not paid within 14 days after the due date and a written reminder has been sent, the Supplier may suspend the ongoing services – e.g. the tour or the website – until payment has been made. In case of material breach, including repeated non-payment, the Supplier may terminate the agreement, and the remaining amount for the current period then falls due immediately. Reminder fees and collection costs are charged in accordance with applicable rules.",
    ],
    section5Title: "5) Confidentiality",
    section5Body:
      "Both parties undertake to treat confidential information about the other party as confidential. Information may not be disclosed to third parties without prior written consent.",
    section6Title: "6) Liability",
    section6Body:
      "The Supplier's liability is limited to direct losses caused by gross negligence or intent. Any damages cannot exceed the total amount paid by the Customer within the preceding 12 months under this agreement.",
    section7Title: "7) Use as a reference",
    section7Body:
      "The Customer grants Nextview360 the right to use the virtual tour, images and video from the shoot, and the Customer's name and logo as a reference in Nextview360's marketing – e.g. on Nextview360's website, on social media, in presentations and in sales material. Nextview360 will always present the Customer in a proper and attractive way that reflects well on the Customer. This right applies during the agreement and for up to 12 months after it ends, and is an exception to the confidentiality in section 5. Statistics and other information from the customer portal are not used without the Customer's written consent.",
    dpa: {
      title: (n) => `${n}) Data processing`,
      body: "When Nextview360 processes personal data on the Customer's behalf, it does so under the data processing agreement in Appendix 1. The appendix is part of this agreement and is signed with it. The Customer is the data controller, and Nextview360 is the data processor.",
      appendixTitle: "Appendix 1: Data Processing Agreement",
      basisTitle: "Basis",
      basis: "The parties use the European Commission's standard contractual clauses for processors (Implementing Decision (EU) 2021/915). The clauses apply unchanged, and the points below are their Annexes A–D.",
      sections: [
        {
          title: "A. What we process and why",
          items: [
            ["Purpose", "To provide the Customer's virtual tour, contact form, competitions and customer portal."],
            ["Whose data", "Visitors who write to the Customer through the tour or enter a competition. People who can be seen in photos and videos in the tour. The Customer's own users of the customer portal."],
            ["What data", "Name, e-mail, phone and the message the person writes. Photos and videos of people in the Customer's premises. Login e-mail for the customer portal."],
            ["No sensitive data", "No sensitive data is processed, unless the Customer asks visitors for it."],
            ["What we don't keep", "Visit statistics do not store IP addresses or anything else that can identify the individual visitor."],
            ["How long", "For as long as the agreement runs. Messages from the contact form are kept for 12 months, unless the Customer wishes otherwise."],
          ],
        },
        {
          title: "B. Sub-processors",
          text: "The Customer approves these sub-processors. We give notice at least 30 days before using a new one, and the Customer may object.",
          table: {
            cols: ["Provider", "Used for", "Where"],
            rows: [
              ["Vercel Inc.", "Hosting of website and customer portal, files", "EU"],
              ["Neon Inc.", "Database", "EU"],
              ["Cloudflare Inc.", "Serving the published tour", "EU / USA"],
              ["Matterport Inc.", "3D scans and 360° images", "USA"],
              ["Resend Inc.", "Sending contact-form and login e-mails", "USA"],
              ["Anthropic PBC", "nextviewAI: checking images for people so they can be hidden", "USA"],
            ],
            after: "Transfers to the USA take place under the EU-US Data Privacy Framework or the EU standard contractual clauses for transfers.",
          },
        },
        {
          title: "C. Instructions and security",
          items: [
            ["Only on the Customer's instructions", "We only use the data for the purpose in point A."],
            ["Access", "Only staff who need the data have access. They are bound by confidentiality and log in personally."],
            ["Protection", "All traffic is encrypted (HTTPS). Passwords and keys are not stored in the code."],
            ["People in images", "People who can be recognised in images in the tour can be hidden at the Customer's request."],
            ["Breaches", "If we discover a security breach, we notify the Customer without undue delay and no later than 48 hours."],
            ["Helping the Customer", "We help the Customer if a person asks to see, correct or delete their data."],
          ],
        },
        {
          title: "D. When the agreement ends",
          text: "Within 30 days of the agreement ending, we delete the Customer's personal data, or return it if the Customer asks. This does not apply where the law requires us to keep it.",
        },
      ],
    },
    signaturesTitle: "Signatures",
    invoiceEmailLabel: "Email for invoices",
  },
};

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fieldRow(label: string, value: string): string {
  return `<div class="field-row"><span class="field-label">${esc(label)}</span><span class="field-value">${esc(value)}</span></div>`;
}

function subSpan(sub: string): string {
  return sub ? ` <span class="sub">${esc(sub)}</span>` : "";
}

/** Bullets are static, translator-authored copy (not user input) - a few
 * intentionally include a literal <b> tag, so they're trusted as raw HTML
 * rather than escaped like the rest of the document's dynamic values. */
function bulletList(bullets: string[]): string {
  return `<ul class="product-list">${bullets.map((b) => `<li>${b}</li>`).join("")}</ul>`;
}

/**
 * Renders the full contract as HTML (rendered to PDF via
 * contract-pdf-renderer.ts, then sent to DocuSeal as a PDF submission).
 * DocuSeal's own {{Sign;type=signature;role=X}}/{{Date;type=date;role=X}}
 * text tags are embedded directly in the signature section below and must
 * pass through untouched - they're auto-detected by DocuSeal regardless of
 * whether the source document is a docx or, as here, a PDF.
 */
/** The customer fills in where their invoices go when signing - picked up
 * by the DocuSeal webhook and saved as the deal's invoice e-mail. */
export const INVOICE_EMAIL_FIELD = "Fakturamail";

export function buildContractHtml(data: ContractHtmlData, language: ContractLanguage): string {
  const t = LABELS[language];
  const p = data.products;

  const productCards: string[] = [];

  if (p.nextviewTour.selected) {
    const pt = t.products.nextviewTour;
    const locs = p.nextviewTour.locations;
    const prices = locs.length
      ? `<p class="loc-intro">${esc(pt.locationsIntro)}</p>
      <table class="loc-table">
        <thead><tr><th>${esc(pt.locationCol)}</th><th>${esc(pt.addressCol)}</th><th class="num">${esc(pt.setupCol)}</th><th class="num">${esc(pt.monthlyCol)}</th></tr></thead>
        <tbody>
          ${locs.map((l) => `<tr><td><b>${esc(l.name)}</b></td><td>${esc(l.address)}</td><td class="num">${esc(l.setupFee)}</td><td class="num">${esc(l.price)}</td></tr>`).join("\n          ")}
        </tbody>
        <tfoot><tr><td colspan="2">${esc(pt.totalRow)}</td><td class="num">${esc(p.nextviewTour.setupFee)}</td><td class="num">${esc(p.nextviewTour.price)}</td></tr></tfoot>
      </table>
      <div class="price-rows">
        ${fieldRow(pt.quantityLabel, String(locs.length))}
      </div>`
      : `<div class="price-rows">
        ${fieldRow(pt.unitPriceLabel, p.nextviewTour.setupFee)}
        ${fieldRow(pt.totalPriceLabel, p.nextviewTour.price)}
      </div>`;
    productCards.push(`
    <div class="product-card">
      <p class="product-name">${esc(pt.name)}${subSpan(pt.sub)}</p>
      ${bulletList(pt.bullets.map(esc))}
      ${prices}
    </div>`);
  }

  if (p.hjemmeside.selected) {
    const pt = t.products.hjemmeside;
    const bullets = p.hjemmeside.hasMonthlyPrice ? pt.bulletsSubscription : pt.bulletsOneTime;
    productCards.push(`
    <div class="product-card">
      <p class="product-name">${esc(pt.name)}</p>
      ${bulletList(bullets)}
      <div class="price-rows">
        ${fieldRow(pt.setupLabel, p.hjemmeside.setupFee)}
        ${p.hjemmeside.hasMonthlyPrice ? fieldRow(pt.priceLabel, p.hjemmeside.price) : ""}
      </div>
    </div>`);
  }

  if (p.droneOptagelse.selected) {
    const pt = t.products.droneOptagelse;
    productCards.push(`
    <div class="product-card">
      <p class="product-name">${esc(pt.name)}</p>
      ${bulletList(pt.bullets.map(esc))}
      <div class="price-rows">
        ${fieldRow(pt.priceLabel, p.droneOptagelse.setupFee)}
      </div>
    </div>`);
  }

  if (p.visitkort.selected) {
    const pt = t.products.visitkort;
    productCards.push(`
    <div class="product-card">
      <p class="product-name">${esc(pt.name)}${subSpan(pt.sub)}</p>
      ${bulletList(pt.bullets.map(esc))}
      <div class="price-rows">
        ${fieldRow(pt.quantityLabel, String(p.visitkort.quantity))}
        ${fieldRow(pt.priceLabel, p.visitkort.setupFee)}
      </div>
    </div>`);
  }

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
<meta charset="UTF-8">
<title>${esc(data.client.company)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root{
    --ink:#16233F;
    --fill:#EAF2FF;
    --fill-border:#CFE0FB;
    --line:#E4E7EC;
    --bg:#FFFFFF;
  }
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;background:var(--bg);}
  body{
    font-family:'Inter',system-ui,-apple-system,Segoe UI,sans-serif;
    color:var(--ink);
    font-size:14.5px;
    line-height:1.55;
    -webkit-font-smoothing:antialiased;
  }
  .page{ max-width:760px; margin:0 auto; padding:48px 48px 56px; }
  .masthead{ text-align:center; margin-bottom:6px; }
  .masthead img{ height:40px; margin:0 auto 16px; display:block; }
  .doc-title{ font-size:24px; font-weight:800; letter-spacing:-0.01em; margin:0 0 4px; color:var(--ink); }
  .doc-subtitle{ font-size:14px; color:var(--ink); margin:0 0 18px; }
  .rule{ border:none; border-top:1px solid var(--line); margin:20px 0; }
  .between-label{ font-size:13px; color:var(--ink); margin:0 0 10px; }
  .party-grid{ display:flex; flex-wrap:wrap; border:1px solid var(--line); border-radius:12px; overflow:hidden; margin-bottom:12px; }
  .party-col{ flex:1 1 0; min-width:220px; padding:16px 18px; }
  .party-col + .party-col{ border-left:1px solid var(--line); }
  .party-name{ font-weight:700; font-size:15px; margin:0 0 2px; }
  .party-role{ font-size:12px; color:var(--ink); margin:0 0 10px; }
  .field-row{ display:flex; justify-content:space-between; gap:12px; padding:3px 0; font-size:13.5px; }
  .field-label{ color:var(--ink); }
  .field-value{ background:var(--fill); border:1px solid var(--fill-border); border-radius:6px; padding:2px 8px; font-weight:500; color:var(--ink); }
  .section{ margin:20px 0; }
  .section-title{ font-size:17px; font-weight:700; margin:0 0 8px; color:var(--ink); }
  .section p{ margin:0 0 8px; }
  .product-card{ border:1px solid var(--line); border-radius:12px; padding:16px 20px; margin-bottom:12px; }
  .product-name{ font-size:15.5px; font-weight:700; margin:0 0 8px; }
  .product-name .sub{ font-weight:400; color:var(--ink); font-size:13px; }
  .product-list{ margin:0 0 10px; padding-left:20px; }
  .product-list li{ margin-bottom:4px; font-size:13.5px; }
  .price-rows{ border-top:1px solid var(--line); padding-top:8px; }
  .loc-intro{ font-size:13.5px; margin:0 0 8px; }
  .loc-table{ width:100%; border-collapse:collapse; font-size:13px; margin:0 0 10px; page-break-inside:auto; }
  .loc-table th{ text-align:left; font-size:11.5px; font-weight:600; text-transform:uppercase; letter-spacing:.04em; padding:6px 8px; border-bottom:1px solid var(--line); }
  .loc-table td{ padding:7px 8px; border-bottom:1px solid #ECEFF3; vertical-align:top; }
  .loc-table tr{ page-break-inside:avoid; break-inside:avoid; }
  .loc-table .num{ text-align:right; white-space:nowrap; }
  .loc-table tfoot td{ font-weight:700; border-bottom:none; background:var(--fill); }
  .overview{ background:#F8FAFC; border:1px solid var(--line); border-radius:12px; padding:16px 20px; margin:14px 0; }
  .overview-row{ display:flex; justify-content:space-between; padding:4px 0; font-size:14px; }
  .overview-row:not(:last-child){ border-bottom:1px solid #ECEFF3; }
  .overview-row .field-label{ font-weight:600; color:var(--ink); }
  .overview-note{ font-size:13px; color:var(--ink); margin-top:8px; }
  .terms-box{ border:1px solid var(--line); border-radius:12px; padding:14px 18px; font-size:13.5px; margin-bottom:8px; white-space:pre-wrap; }
  .dpa{ margin:28px 0 20px; page-break-before:always; break-before:page; font-size:13.5px; }
  .dpa p{ margin:0 0 8px; }
  .dpa-h{ font-size:14.5px; font-weight:700; margin:16px 0 6px !important; color:var(--ink); }
  .dpa-list{ margin:0 0 8px; padding-left:20px; }
  .dpa-list li{ margin-bottom:5px; }
  .sig-title{ font-size:19px; font-weight:800; margin:0 0 16px; color:var(--ink); }
  .sig-grid{ display:flex; flex-wrap:wrap; gap:40px; page-break-inside:avoid; break-inside:avoid; }
  .sig-grid > div{ flex:1 1 0; min-width:220px; }
  .sig-party{ font-size:13px; font-weight:700; color:var(--ink); margin-bottom:12px; }
  .sig-box{ border-bottom:1px solid var(--ink); height:56px; margin-bottom:10px; display:flex; align-items:center; justify-content:center; font-size:13px; color:var(--ink); }
  .sig-meta{ font-size:12.5px; color:var(--ink); line-height:1.6; }
  .sig-meta b{ color:var(--ink); font-weight:600; }
</style>
</head>
<body>
<div class="page">

  <div class="masthead">
    <img src="${logoDataUri()}" alt="Nextview360">
    <h1 class="doc-title">${esc(t.docTitle)}</h1>
    <p class="doc-subtitle">${esc(COMPANY.name)}</p>
  </div>

  <p class="between-label">${esc(t.between)}</p>
  <div class="party-grid">
    <div class="party-col">
      <p class="party-name">${esc(COMPANY.name)}</p>
      <p class="party-role">${esc(t.supplier)}</p>
      ${fieldRow(t.cvr, COMPANY.cvr)}
      ${fieldRow(t.address, COMPANY.address)}
      ${fieldRow(t.contact, data.seller.name)}
      ${fieldRow(t.email, data.seller.email)}
      ${fieldRow(t.phone, data.seller.phone)}
    </div>
    <div class="party-col">
      <p class="party-name">${esc(data.client.company)}</p>
      <p class="party-role">${esc(t.customer)}</p>
      ${fieldRow(t.cvr, data.client.cvr)}
      ${fieldRow(t.address, `${data.client.address}, ${data.client.zipCity}`)}
      ${fieldRow(t.contact, data.client.name)}
      ${fieldRow(t.email, data.client.email)}
      ${fieldRow(t.phone, data.client.phone)}
    </div>
  </div>

  <div class="section">
    <p class="section-title">${esc(t.section1Title)}</p>
    <p>${esc(t.section1Body(data.selectedCount))}</p>
  </div>

  <div class="section">
    <p class="section-title">${esc(t.section2Title)}</p>
    ${productCards.join("\n")}

    <div class="overview">
      ${fieldRow(t.overviewSetup, data.setupPriceTotal)}
      ${fieldRow(t.overviewPrice, data.priceTotal)}
      <p class="overview-note">${esc(data.establishmentOnApproval ? t.overviewNoteOnApproval : t.overviewNote)}</p>
    </div>

    ${
      data.additionalTerms
        ? `<p class="section-title" style="font-size:14.5px;margin-top:20px;">${esc(t.additionalTermsTitle)}</p>
    <div class="terms-box">${esc(data.additionalTerms)}</div>`
        : ""
    }
  </div>

  <div class="section">
    <p class="section-title">${esc(t.section3Title)}</p>
    <p>${esc(data.autoRenew ? t.section3Body : t.section3BodyFixed)}</p>
    ${fieldRow(t.bindingLabel, `${data.bindingMonths} ${t.monthsSuffix}`)}
    ${data.autoRenew ? fieldRow(t.noticeLabel, `${data.noticeMonths} ${t.monthsSuffix}`) : ""}
  </div>

  <div class="section">
    <p class="section-title">${esc(t.section4Title)}</p>
    ${t.section4Body.map((p) => `<p>${esc(p)}</p>`).join("\n    ")}
  </div>

  <div class="section">
    <p class="section-title">${esc(t.section5Title)}</p>
    <p>${esc(t.section5Body)}</p>
  </div>

  <div class="section">
    <p class="section-title">${esc(t.section6Title)}</p>
    <p>${esc(t.section6Body)}</p>
  </div>
${
  data.referenceUse
    ? `
  <div class="section">
    <p class="section-title">${esc(t.section7Title)}</p>
    <p>${esc(t.section7Body)}</p>
  </div>
`
    : ""
}
  <div class="section">
    <p class="section-title">${esc(t.dpa.title(data.referenceUse ? 8 : 7))}</p>
    <p>${esc(t.dpa.body)}</p>
  </div>

  <div class="dpa">
    <p class="section-title" style="font-size:19px;font-weight:800">${esc(t.dpa.appendixTitle)}</p>
    <p class="dpa-h">${esc(t.dpa.basisTitle)}</p>
    <p>${esc(t.dpa.basis)}</p>
${t.dpa.sections
  .map(
    (sec) => `    <p class="dpa-h">${esc(sec.title)}</p>
${sec.text ? `    <p>${esc(sec.text)}</p>\n` : ""}${sec.items ? `    <ul class="dpa-list">${sec.items.map(([k, v]) => `<li><b>${esc(k)}:</b> ${esc(v)}</li>`).join("")}</ul>\n` : ""}${
      sec.table
        ? `    <table class="loc-table"><thead><tr>${sec.table.cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${sec.table.rows.map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>
    <p>${esc(sec.table.after)}</p>\n`
        : ""
    }`
  )
  .join("")}
  </div>
  <hr class="rule">

  <p class="sig-title">${esc(t.signaturesTitle)}</p>
  <div class="sig-grid">
    <div>
      <p class="sig-party">${esc(COMPANY.name)}</p>
      <div class="sig-box">{{Sign;type=signature;role=Company}}</div>
      <p class="sig-meta">
        <b>${esc(CONTRACT_SIGNER.name)}</b><br>
        ${esc(CONTRACT_SIGNER.email)}<br>
        {{Date;type=date;role=Company;format=DD/MM/YYYY}}
      </p>
    </div>
    <div>
      <p class="sig-party">${esc(data.client.company)}</p>
      <div class="sig-box">{{Sign;type=signature;role=Customer}}</div>
      <p class="sig-meta">
        <b>${esc(data.client.name)}</b><br>
        ${esc(data.client.email)}<br>
        {{Date;type=date;role=Customer;format=DD/MM/YYYY}}
      </p>
      <p class="sig-meta" style="margin-top:10px">
        ${esc(t.invoiceEmailLabel)}:<br>
        {{${INVOICE_EMAIL_FIELD};type=text;role=Customer;required=true}}
      </p>
    </div>
  </div>

</div>
</body>
</html>`;
}
