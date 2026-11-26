import { NextResponse } from "next/server";
import { getTeamUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { maySeePay, reachOf } from "@/lib/hr-access";

/**
 * An employee's document (e.g. the signed contract) - only to an admin or the person themself, like pay; every look is
 * logged (HrAccessLog). Served as a download-free inline PDF that can't run anything on our domain.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getTeamUser();
  if (!user) return NextResponse.json({ error: "Log ind." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const doc = await prisma.employeeDocument.findUnique({ where: { id }, include: { employee: { select: { id: true, userId: true, managerId: true } } } });
  // The same answer whether it doesn't exist or isn't theirs - nothing to guess ids with.
  const reach = doc ? reachOf(user, doc.employee) : null;
  if (!doc || !reach || !(await maySeePay(user, doc.employee, reach))) return NextResponse.json({ error: "Ikke fundet." }, { status: 404 });
  await prisma.hrAccessLog.create({ data: { viewerId: user.id, employeeId: doc.employee.id, what: `dokument:${doc.kind}` } }).catch(() => null);
  const filename = doc.name.replace(/[^\w .æøåÆØÅ-]/g, "").slice(0, 120) || "dokument.pdf";
  return new NextResponse(new Uint8Array(doc.data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    },
  });
}
