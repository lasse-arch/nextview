import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { storeTourFile } from "@/lib/tour-files";
import { ringBell } from "@/lib/team-notifications";

/** General feedback (not at a spot) is about one of these. */
const TOPICS = ["menu", "funktioner", "design", "andet"];
const TOPIC_NAMES: Record<string, string> = { menu: "menuen", funktioner: "funktionerne", design: "designet", andet: "andet" };

/*
 * Feedback from a tour's review link (/p/<token>) - open to anyone with the
 * link, so the token is checked on every call and the input is kept small.
 * GET lists what's been said (so reviewers see each other's), POST adds one.
 */

async function tourOf(token: unknown) {
  if (typeof token !== "string" || token.length < 10) return null;
  return prisma.tour.findUnique({ where: { reviewToken: token }, select: { slug: true, name: true } });
}

export async function GET(request: Request) {
  const tour = await tourOf(new URL(request.url).searchParams.get("token"));
  if (!tour) return NextResponse.json({ error: "Linket virker ikke længere." }, { status: 404 });
  const rows = await prisma.tourFeedback.findMany({ where: { tourSlug: tour.slug }, orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json(rows.map((r) => ({ id: r.id, kind: r.kind, text: r.text, author: r.author, href: r.href, room: r.room, topic: r.topic, status: r.status, at: r.createdAt })));
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const tour = await tourOf(body?.token);
  if (!tour || !body) return NextResponse.json({ error: "Linket virker ikke længere." }, { status: 404 });
  const text = String(body.text ?? "").trim().slice(0, 2000);
  if (!text) return NextResponse.json({ error: "Skriv hvad du har set." }, { status: 400 });
  // A flood guard: at most 60 notes an hour per tour.
  const recent = await prisma.tourFeedback.count({ where: { tourSlug: tour.slug, createdAt: { gt: new Date(Date.now() - 3_600_000) } } });
  if (recent >= 60) return NextResponse.json({ error: "Der er sendt meget lige nu - prøv igen om lidt." }, { status: 429 });
  // General feedback (about the menu, the functions …) has no spot and no picture.
  const topic = typeof body.topic === "string" && TOPICS.includes(body.topic) ? body.topic : null;
  let image: string | null = null;
  const data = !topic && typeof body.image === "string" ? /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(body.image) : null;
  if (data && data[1].length < 2_500_000) image = await storeTourFile(tour.slug, `feedback-${Date.now()}.jpg`, "image/jpeg", Buffer.from(data[1], "base64")).catch(() => null);
  const str = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
  const row = await prisma.tourFeedback.create({
    data: {
      tourSlug: tour.slug,
      kind: body.kind === "fejl" ? "fejl" : "forslag",
      text,
      author: str(body.author, 80),
      href: !topic && str(body.href, 500)?.startsWith("https://") ? str(body.href, 500) : null,
      ss: !topic && Number.isInteger(body.ss) ? (body.ss as number) : null,
      room: topic ? null : str(body.room, 120),
      topic,
      image,
      device: str(body.device, 120),
    },
  });
  const where = topic ? `om ${TOPIC_NAMES[topic]}` : row.room ? `ved ${row.room}` : null;
  await ringBell({
    kind: "feedback",
    title: `Feedback på ${tour.name}`,
    text: `${row.author ? `${row.author}: ` : ""}${where ? `(${where}) ` : ""}${text}`,
    href: `/arpo/tour-lab/${tour.slug}/rediger?fane=feedback`,
    tourSlug: tour.slug,
  });
  return NextResponse.json({ ok: true, id: row.id });
}
