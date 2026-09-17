import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { lookupCvrNumber } from "@/lib/cvr";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nr = request.nextUrl.searchParams.get("nr") || "";
  const result = await lookupCvrNumber(nr);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result.data);
}
