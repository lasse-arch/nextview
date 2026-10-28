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
  bindingLabel: string;
  noticeLabel: string;
  monthsSuffix: string;
  section4Title: string;
  section4Body: string[];
  section5Title: string;
  section5Body: string;
  section6Title: string;
  section6Body: string;
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
    <p>${esc(t.section3Body)}</p>
    ${fieldRow(t.bindingLabel, `${data.bindingMonths} ${t.monthsSuffix}`)}
    ${fieldRow(t.noticeLabel, `${data.noticeMonths} ${t.monthsSuffix}`)}
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
