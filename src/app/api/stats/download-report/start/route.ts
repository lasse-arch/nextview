import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { requireUser } from "@/lib/auth";
import { requestReportDownload, kickDownloadJobQueue } from "@/lib/report-download-service";

/**
 * Starts a background PDF-generation job instead of generating it inline -
 * returns almost instantly with a jobId the client then polls (see
 * /api/stats/download-report/job/[jobId]), rather than the browser blocking
 * on the full Matterport/explore.nextview360.dk scrape (which can easily
 * take a minute or more, worse for a multi-deal "download all").
 */
export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const dealIds: string[] = Array.isArray(body?.dealIds) ? body.dealIds.filter((id: unknown) => typeof id === "string") : [];
  const combined = body?.combined === true;
  if (dealIds.length === 0) {
    return NextResponse.json({ error: "Ingen kunder valgt." }, { status: 400 });
  }

  const { jobId } = await requestReportDownload(dealIds, combined, user.id);
  after(() => kickDownloadJobQueue());

  return NextResponse.json({ jobId });
}
