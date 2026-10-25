import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ALLOWED_TYPES } from "@/lib/tour-files";

/**
 * Uploads straight from the editor to Vercel Blob (big files like videos can't
 * go through a server function). Only admins get an upload token; the editor
 * then records the file with registerTourFile.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const user = await getCurrentUser();
        if (user?.role !== "ADMIN") throw new Error("Kun admin kan uploade.");
        return { allowedContentTypes: ALLOWED_TYPES, maximumSizeInBytes: 200 * 1024 * 1024, addRandomSuffix: true };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
