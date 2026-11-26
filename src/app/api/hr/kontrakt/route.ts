import { NextResponse } from "next/server";
import { getTeamUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isHrAdmin } from "@/lib/hr-access";
import { CONTRACT_SIGNER } from "@/lib/contract-template-data";
import { renderContractPdf } from "@/lib/contract-pdf-renderer";
import { contractProblem, employmentContractHtml } from "@/lib/employment-contract";

/** The employment contract as it would be sent - a PDF to read first. Only an admin. */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getTeamUser();
  if (!user || !isHrAdmin(user)) return NextResponse.json({ error: "Kun admin." }, { status: 403 });
  const url = new URL(request.url);
  const e = await prisma.employee.findUnique({ where: { id: url.searchParams.get("medarbejder") ?? "" }, include: { user: { select: { name: true, lastName: true, email: true, phone: true } }, manager: { select: { name: true, lastName: true } }, pay: { orderBy: { effectiveFrom: "desc" }, take: 1 }, terms: { orderBy: { from: "asc" } } } });
  if (!e) return NextResponse.json({ error: "Medarbejderen findes ikke." }, { status: 404 });
  const problem = contractProblem(e, e.pay[0]);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const sickTo = (url.searchParams.get("syg") ?? "").trim().slice(0, 80) || CONTRACT_SIGNER.name;
  const pdf = await renderContractPdf(employmentContractHtml(e, e.pay[0], sickTo, e.terms));
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="ansaettelseskontrakt.pdf"`, "Cache-Control": "private, no-store" } });
}
