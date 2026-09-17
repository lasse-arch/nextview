import path from "node:path";
import fs from "node:fs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

const TEMPLATE_PATH = path.join(process.cwd(), "src/contract-templates/nextview360-contract.docx");

/**
 * Fills the Nextview360 contract template with deal data, including only the
 * product sections that are actually selected on the deal. Uses [[ ]]
 * delimiters (configured below) since the template also carries DocuSeal's
 * own {{Sign;type=signature;role=X}}/{{Date;type=date;role=X}} text tags,
 * which must pass through untouched for DocuSeal to place signature fields.
 */
export function generateContractDocx(data: Record<string, string | boolean>): Buffer {
  const content = fs.readFileSync(TEMPLATE_PATH, "binary");
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "[[", end: "]]" },
  });

  doc.render(data);

  return doc.getZip().generate({ type: "nodebuffer" });
}
