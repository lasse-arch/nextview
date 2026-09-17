import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { searchCvrByName } from "@/lib/cvr";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q") || "";
  const results = await searchCvrByName(q);
  return NextResponse.json(results);
}
