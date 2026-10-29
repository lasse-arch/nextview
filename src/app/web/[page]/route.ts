import { betaPage } from "@/lib/beta-site";

/** A page of the new site (/web/priser.html …) - only for the team, see beta-site.ts. */
export async function GET(request: Request, { params }: { params: Promise<{ page: string }> }) {
  return betaPage((await params).page, request);
}
