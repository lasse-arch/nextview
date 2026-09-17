import fs from "node:fs";
import path from "node:path";
import type { ContractHtmlData, ContractLanguage } from "@/lib/contract-template-data";

const LOGO_PATH = path.join(process.cwd(), "public/logo.png");

function logoDataUri(): string {
  const buf = fs.readFileSync(LOGO_PATH);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

const COMPANY = {
  name: "Nextview 360 ApS",
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
    nextviewTour: { name: string; sub: string; bullets: string[]; quantityLabel: string; unitPriceLabel: string; totalPriceLabel: string };
    hjemmeside: { name: string; bullets: string[]; setupLabel: string; priceLabel: string };
    droneOptagelse: { name: string; bullets: string[]; quantityLabel: string; priceLabel: string };
    visitkort: { name: string; sub: string; bullets: string[]; quantityLabel: string; priceLabel: string };
  };
  overviewSetup: string;
  overviewPrice: string;
  overviewNote: string;
  additionalTermsTitle: string;
  invoicingNote: string;
  section3Title: string;
  section3Body: string;
  bindingLabel: string;
  noticeLabel: string;
  monthsSuffix: string;
  section4Title: string;
  section4Body: string;
  section5Title: string;
  section5Body: string;
  section6Title: string;
  section6Body: string;
  signaturesTitle: string;
  awaitingSignature: string;
  signedAt: string;
};

const LABELS: Record<ContractLanguage, Labels> = {
  da: {
    docTitle: "Abonnementsaftale",
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
          "Udgivelse på både Google Street View og egen hjemmeside",
          "Support samt 1 årlig genoptagelse pr. lokation",
          "Billeder i høj kvalitet til fri afbenyttelse",
          "Kvartalsvis performance-rapportering (engagement, visninger, henvendelser)",
        ],
        quantityLabel: "Antal lokationer",
        unitPriceLabel: "Etableringspris",
        totalPriceLabel: "Pris pr. måned",
      },
      hjemmeside: {
        name: "Hjemmeside",
        bullets: [
          "Design og opsætning af hjemmeside tilpasset kundens branding",
          "Integration af 360°-rundvisning (hvis valgt) og kontaktformular",
          "Hosting og løbende drift inkluderet i abonnementet",
          "Mindre tekst- og billedopdateringer efter aftale",
        ],
        setupLabel: "Etableringspris (engangs)",
        priceLabel: "Pris pr. måned",
      },
      droneOptagelse: {
        name: "Drone-optagelse",
        bullets: [
          "Luftfoto- og videooptagelse af lokation(er) med drone",
          "Efterbehandling og redigering af optaget materiale",
          "Levering af billeder/video i høj kvalitet til fri afbenyttelse",
          "Gennemføres efter forudgående aftale om dato og adgang",
        ],
        quantityLabel: "Antal optagelser",
        priceLabel: "Pris (engangsbeløb)",
      },
      visitkort: {
        name: "Visitkort",
        sub: "— med QR-kode til virtuel rundvisning",
        bullets: [
          "Fysiske visitkort med tilhørende unik QR-kode",
          "QR-koden linker direkte til kundens virtuelle rundvisning",
          "Design tilpasses kundens eksisterende visuelle identitet",
        ],
        quantityLabel: "Antal",
        priceLabel: "Pris i alt (engangsbeløb)",
      },
    },
    overviewSetup: "Samlet etableringspris",
    overviewPrice: "Samlet månedlig pris",
    overviewNote: "Etableringsprisen betales ved underskrift af kontrakten, med mindre andet er angivet i Yderligere betingelser.",
    additionalTermsTitle: "Yderligere betingelser",
    invoicingNote: "Fakturering: Kvartalsvist forud (netto 8 dage), med mindre andet er angivet nedenfor.",
    section3Title: "3) Løbetid og opsigelse",
    section3Body:
      "Aftalen træder i kraft ved underskrift af begge parter. Bindingsperioden starter dog først, når det/de valgte produkt(er) er afleveret/leveret af leverandøren til kunden.",
    bindingLabel: "Bindingsperiode",
    noticeLabel: "Opsigelsesvarsel",
    monthsSuffix: "måneder",
    section4Title: "4) Betaling",
    section4Body:
      "Betaling sker via faktura eller efter særskilt aftale om automatisk betaling. Forsinket betaling påløber rente i henhold til renteloven og eventuelle inddrivelsesomkostninger.",
    section5Title: "5) Fortrolighed",
    section5Body:
      "Begge parter forpligter sig til at behandle fortrolige oplysninger om modparten som fortrolige. Oplysninger må ikke videregives til tredjepart uden forudgående skriftligt samtykke.",
    section6Title: "6) Ansvar",
    section6Body:
      "Leverandørens ansvar er begrænset til direkte tab forårsaget af grov uagtsomhed eller forsæt. Eventuel erstatning kan ikke overstige det samlede beløb, kunden har betalt inden for de seneste 12 måneder under denne aftale.",
    signaturesTitle: "Underskrifter",
    awaitingSignature: "Afventer underskrift",
    signedAt: "Underskrevet",
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
          "Published on both Google Street View and the customer's own website",
          "Support plus 1 annual re-shoot per location",
          "High-quality images for the customer's free use",
          "Quarterly performance reporting (engagement, views, inquiries)",
        ],
        quantityLabel: "Number of locations",
        unitPriceLabel: "Setup fee",
        totalPriceLabel: "Price per month",
      },
      hjemmeside: {
        name: "Website",
        bullets: [
          "Website design and setup tailored to the customer's branding",
          "Integration of the 360° tour (if selected) and a contact form",
          "Hosting and ongoing operation included in the subscription",
          "Minor text and image updates by agreement",
        ],
        setupLabel: "Setup fee (one-off)",
        priceLabel: "Price per month",
      },
      droneOptagelse: {
        name: "Drone Footage",
        bullets: [
          "Aerial photo and video footage of the location(s) by drone",
          "Post-production and editing of the captured material",
          "Delivery of high-quality images/video for the customer's free use",
          "Carried out by prior agreement on date and access",
        ],
        quantityLabel: "Number of shoots",
        priceLabel: "Price (one-off)",
      },
      visitkort: {
        name: "Business Cards",
        sub: "— with QR code to the virtual tour",
        bullets: [
          "Physical business cards with a unique QR code",
          "The QR code links directly to the customer's virtual tour",
          "Design adapted to the customer's existing visual identity",
        ],
        quantityLabel: "Quantity",
        priceLabel: "Total price (one-off)",
      },
    },
    overviewSetup: "Total setup fee",
    overviewPrice: "Total monthly price",
    overviewNote: "The setup fee is due on signing of the contract, unless otherwise stated under Additional Terms.",
    additionalTermsTitle: "Additional Terms",
    invoicingNote: "Invoicing: Quarterly in advance (net 8 days), unless otherwise stated below.",
    section3Title: "3) Term and Termination",
    section3Body:
      "This agreement takes effect once signed by both parties. The binding period, however, only begins once the selected product(s) have been delivered by the Supplier to the Customer.",
    bindingLabel: "Binding period",
    noticeLabel: "Notice period",
    monthsSuffix: "months",
    section4Title: "4) Payment",
    section4Body:
      "Payment is made by invoice or by separate agreement on automatic payment. Late payment accrues interest under the Danish Interest Act and any recovery costs.",
    section5Title: "5) Confidentiality",
    section5Body:
      "Both parties undertake to treat confidential information about the other party as confidential. Information may not be disclosed to third parties without prior written consent.",
    section6Title: "6) Liability",
    section6Body:
      "The Supplier's liability is limited to direct losses caused by gross negligence or intent. Any damages cannot exceed the total amount paid by the Customer within the preceding 12 months under this agreement.",
    signaturesTitle: "Signatures",
    awaitingSignature: "Awaiting signature",
    signedAt: "Signed",
  },
};

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fieldRow(label: string, value: string): string {
  return `<div class="field-row"><span class="field-label">${esc(label)}</span><span class="field-value">${esc(value)}</span></div>`;
}

/**
 * Renders the full contract as HTML (rendered to PDF via
 * contract-pdf-renderer.ts, then sent to DocuSeal as a PDF submission).
 * DocuSeal's own {{Sign;type=signature;role=X}}/{{Date;type=date;role=X}}
 * text tags are embedded directly in the signature section below and must
 * pass through untouched - they're auto-detected by DocuSeal regardless of
 * whether the source document is a docx or, as here, a PDF.
 */
export function buildContractHtml(data: ContractHtmlData, language: ContractLanguage): string {
  const t = LABELS[language];
  const p = data.products;

  const productCards: string[] = [];

  if (p.nextviewTour.selected) {
    const pt = t.products.nextviewTour;
    productCards.push(`
    <div class="product-card">
      <p class="product-name">${esc(pt.name)} <span class="sub">${esc(pt.sub)}</span></p>
      <ul class="product-list">${pt.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
      <div class="price-rows">
        ${fieldRow(pt.unitPriceLabel, p.nextviewTour.setupFee)}
        ${fieldRow(pt.totalPriceLabel, p.nextviewTour.price)}
      </div>
    </div>`);
  }

  if (p.hjemmeside.selected) {
    const pt = t.products.hjemmeside;
    productCards.push(`
    <div class="product-card">
      <p class="product-name">${esc(pt.name)}</p>
      <ul class="product-list">${pt.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
      <div class="price-rows">
        ${fieldRow(pt.setupLabel, p.hjemmeside.setupFee)}
        ${fieldRow(pt.priceLabel, p.hjemmeside.price)}
      </div>
    </div>`);
  }

  if (p.droneOptagelse.selected) {
    const pt = t.products.droneOptagelse;
    productCards.push(`
    <div class="product-card">
      <p class="product-name">${esc(pt.name)}</p>
      <ul class="product-list">${pt.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
      <div class="price-rows">
        ${fieldRow(pt.priceLabel, p.droneOptagelse.setupFee)}
      </div>
    </div>`);
  }

  if (p.visitkort.selected) {
    const pt = t.products.visitkort;
    productCards.push(`
    <div class="product-card">
      <p class="product-name">${esc(pt.name)} <span class="sub">${esc(pt.sub)}</span></p>
      <ul class="product-list">${pt.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
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
    --brand-deep:#16233F;
    --fill:#EAF2FF;
    --fill-border:#CFE0FB;
    --line:#E4E7EC;
    --muted:#667085;
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
  .page{ max-width:760px; margin:0 auto; padding:56px 48px 64px; }
  .masthead{ text-align:center; margin-bottom:8px; }
  .masthead img{ height:44px; margin:0 auto 22px; display:block; }
  .doc-title{ font-size:26px; font-weight:800; letter-spacing:-0.01em; margin:0 0 6px; color:var(--brand-deep); }
  .doc-subtitle{ font-size:14px; color:var(--muted); margin:0 0 28px; }
  .rule{ border:none; border-top:1px solid var(--line); margin:28px 0; }
  .between-label{ font-size:13px; color:var(--muted); margin:0 0 14px; }
  .party-grid{ display:flex; flex-wrap:wrap; border:1px solid var(--line); border-radius:12px; overflow:hidden; margin-bottom:14px; }
  .party-col{ flex:1 1 0; min-width:220px; padding:18px 20px; }
  .party-col + .party-col{ border-left:1px solid var(--line); }
  .party-name{ font-weight:700; font-size:15px; margin:0 0 2px; }
  .party-role{ font-size:12px; color:var(--muted); margin:0 0 14px; }
  .field-row{ display:flex; justify-content:space-between; gap:12px; padding:6px 0; font-size:13.5px; }
  .field-label{ color:var(--muted); }
  .field-value{ background:var(--fill); border:1px solid var(--fill-border); border-radius:6px; padding:2px 8px; font-weight:500; color:var(--brand-deep); }
  .section{ margin:34px 0; page-break-inside:avoid; break-inside:avoid; }
  .section-title{ font-size:17px; font-weight:700; margin:0 0 10px; color:var(--brand-deep); }
  .section p{ margin:0 0 10px; }
  .product-card{ border:1px solid var(--line); border-radius:12px; padding:20px 22px; margin-bottom:14px; page-break-inside:avoid; break-inside:avoid; }
  .product-name{ font-size:15.5px; font-weight:700; margin:0 0 10px; }
  .product-name .sub{ font-weight:400; color:var(--muted); font-size:13px; }
  .product-list{ margin:0 0 16px; padding-left:20px; }
  .product-list li{ margin-bottom:5px; font-size:13.5px; }
  .price-rows{ border-top:1px solid var(--line); padding-top:12px; }
  .overview{ background:#F8FAFC; border:1px solid var(--line); border-radius:12px; padding:18px 22px; margin:20px 0; page-break-inside:avoid; break-inside:avoid; }
  .overview-row{ display:flex; justify-content:space-between; padding:6px 0; font-size:14px; }
  .overview-row:not(:last-child){ border-bottom:1px solid #ECEFF3; }
  .overview-row .field-label{ font-weight:600; color:var(--ink); }
  .overview-note{ font-size:13px; color:var(--muted); margin-top:10px; }
  .terms-box{ border:1px solid var(--line); border-radius:12px; padding:18px 22px; min-height:100px; font-size:13.5px; margin-bottom:8px; white-space:pre-wrap; }
  .sig-title{ font-size:19px; font-weight:800; margin:0 0 22px; color:var(--brand-deep); }
  .sig-grid{ display:flex; flex-wrap:wrap; gap:40px; page-break-inside:avoid; break-inside:avoid; }
  .sig-grid > div{ flex:1 1 0; min-width:220px; }
  .sig-party{ font-size:13px; font-weight:700; color:var(--muted); margin-bottom:14px; }
  .sig-box{ border-bottom:1px solid var(--ink); height:56px; margin-bottom:10px; display:flex; align-items:flex-end; justify-content:center; font-size:13px; color:var(--muted); }
  .sig-meta{ font-size:12.5px; color:var(--muted); line-height:1.7; }
  .sig-meta b{ color:var(--ink); font-weight:600; }
  @page{ size:A4; margin:0; }
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
      <p class="overview-note">${esc(t.overviewNote)}</p>
    </div>

    <p class="section-title" style="font-size:14.5px;margin-top:24px;">${esc(t.additionalTermsTitle)}</p>
    <div class="terms-box">${esc(t.invoicingNote)}${data.additionalTerms ? `\n\n${esc(data.additionalTerms)}` : ""}</div>
  </div>

  <div class="section">
    <p class="section-title">${esc(t.section3Title)}</p>
    <p>${esc(t.section3Body)}</p>
    ${fieldRow(t.bindingLabel, `${data.bindingMonths} ${t.monthsSuffix}`)}
    ${fieldRow(t.noticeLabel, `${data.noticeMonths} ${t.monthsSuffix}`)}
  </div>

  <div class="section">
    <p class="section-title">${esc(t.section4Title)}</p>
    <p>${esc(t.section4Body)}</p>
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
        <b>${esc(data.seller.name)}</b><br>
        ${esc(data.seller.email)}<br>
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
    </div>
  </div>

</div>
</body>
</html>`;
}
