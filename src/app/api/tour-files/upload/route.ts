import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getTeamUser } from "@/lib/auth";
import { teamCan } from "@/lib/team-roles";
import { ALLOWED_TYPES } from "@/lib/tour-files";

/**
 * Uploads straight from the editor to Vercel Blob (big files like videos can't
 * go through a server function). Only those on tours get an upload token; the editor
 * then records the file with registerTourFile (which checks the tour is theirs).
 */
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const user = await getTeamUser();
        if (!user || !teamCan(user, "tours")) throw new Error("Du har ikke adgang til at uploade.");
        return { allowedContentTypes: ALLOWED_TYPES, maximumSizeInBytes: 200 * 1024 * 1024, addRandomSuffix: true };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
