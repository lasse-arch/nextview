import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { lookupCvrNumber } from "@/lib/cvr";

export async function GET(request: NextRequest) {
  await requireUser();

  const nr = request.nextUrl.searchParams.get("nr") || "";
  const result = await lookupCvrNumber(nr);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result.data);
}
