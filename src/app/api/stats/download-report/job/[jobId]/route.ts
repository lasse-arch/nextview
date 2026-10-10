import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { after } from "next/server";
import { downloadQueueIsRunning, kickDownloadJobQueue } from "@/lib/report-download-service";

/** Polled by the browser every few seconds while a download job is PENDING -
 * see download-report-client.ts. Once READY, the client switches to
 * fetching this same route's sibling (?file=1) to get the actual bytes. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;
  const job = await prisma.reportDownloadJob.findUnique({
    where: { id: jobId },
    select: { status: true, errorMessage: true, fileName: true },
  });
  if (!job) return NextResponse.json({ error: "Jobbet findes ikke (eller er allerede hentet)." }, { status: 404 });

  // The queue chains itself from step to step; if that chain ever breaks
  // (a lost request between steps), the browser's polling restarts it.
  if (job.status === "PENDING") {
    after(async () => {
      if (!(await downloadQueueIsRunning())) await kickDownloadJobQueue();
    });
  }

  const wantsFile = request.nextUrl.searchParams.get("file") === "1";
  if (!wantsFile || job.status !== "READY") {
    return NextResponse.json({ status: job.status, errorMessage: job.errorMessage, fileName: job.fileName });
  }

  const full = await prisma.reportDownloadJob.findUnique({ where: { id: jobId }, select: { pdfData: true, fileName: true } });
  if (!full?.pdfData) return NextResponse.json({ error: "PDF'en er ikke tilgængelig." }, { status: 404 });

  // The file is only ever meant to be picked up once, shortly after
  // generation - delete it right away rather than letting finished jobs'
  // PDF bytes pile up in the table.
  await prisma.reportDownloadJob.delete({ where: { id: jobId } }).catch(() => {});

  const fileName = full.fileName ?? "besøgsrapport.pdf";
  return new NextResponse(new Blob([new Uint8Array(full.pdfData)], { type: "application/pdf" }), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="report.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
