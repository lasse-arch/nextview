import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q") || "";
  if (q.trim().length < 3) return NextResponse.json([]);

  try {
    const url = `https://api.dataforsyningen.dk/autocomplete?type=adresse&per_side=6&q=${encodeURIComponent(q)}`;
    const res = await fetch(url);
    if (!res.ok) return NextResponse.json([]);

    const data = (await res.json()) as { tekst: string; data?: { x: number; y: number } }[];
    const suggestions = data.map((d) => ({
      text: d.tekst,
      lat: d.data?.y ?? null,
      lon: d.data?.x ?? null,
    }));

    return NextResponse.json(suggestions);
  } catch {
    return NextResponse.json([]);
  }
}
