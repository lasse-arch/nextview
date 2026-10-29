import { NextResponse } from "next/server";

/** /web → its front page (the pages link to each other relative to /web/). */
export function GET(request: Request) {
  return NextResponse.redirect(new URL("/web/index.html", request.url));
}
