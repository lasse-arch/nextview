import type { NextConfig } from "next";

const TOUR_HOST = process.env.NEXT_PUBLIC_TOUR_ORIGIN?.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
const SITE_HOST = process.env.NEXT_PUBLIC_SITE_ORIGIN?.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");

const nextConfig: NextConfig = {
  // ssh2 (Betalingsservice SFTP) loads optional native/crypto modules at
  // runtime - kept out of the bundle and required from node_modules instead.
  serverExternalPackages: ["ssh2", "ssh2-sftp-client"],
  // The contract PDF renderer reads public/logo.png via fs at request time
  // (see contract-html-template.ts) - without this it can be left out of
  // the deployed serverless function bundle and contract generation fails
  // in production, the same issue the old .docx template had.
  outputFileTracingIncludes: {
    "/*": ["./public/logo.png", "./node_modules/@sparticuz/chromium/bin/**/*"],
    // The tour editor's Claude reads the tour setup's documented types (see tour-ai.ts).
    "/tour-lab/**": ["./src/app/*/tour-lab/tours/types.ts", "./src/app/*/tour-lab/tours/PLAYBOOK.md"],
  },
  // Basic hardening on every response: no framing of Arpo by other sites
  // (clickjacking), no MIME sniffing, no full URLs leaked to other sites,
  // and browsers stick to HTTPS.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          // Internal tool: kept out of Google and other search engines -
          // also covers PDFs, images and API responses, which have no <meta>.
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, noimageindex" },
        ],
      },
      {
        // Matterport's viewer (the self-hosted SDK Bundle) is shown in an
        // iframe in our tours - and those sit in an iframe on customers' sites,
        // so it may be framed anywhere (a static viewer; frame-ancestors
        // replaces X-Frame-Options in browsers that know it).
        source: "/matterport/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
      {
        // Published tours are made to be embedded on customers' websites.
        source: "/t/:slug",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
      // The website (public/site) may be found on Google - Arpo itself never.
      ...(SITE_HOST
        ? [SITE_HOST, `www.${SITE_HOST}`].map((host) => ({
            source: "/:path*",
            has: [{ type: "host" as const, value: host }],
            headers: [{ key: "X-Robots-Tag", value: "index, follow" }],
          }))
        : []),
      // The same tours on the short tour address (lib/public-urls.ts).
      ...(TOUR_HOST ? [{ source: "/:slug", has: [{ type: "host" as const, value: TOUR_HOST }], headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }] }] : []),
      {
        // The tour editor previews the tour in an iframe on its own page.
        source: "/tour-lab/:slug",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
    ];
  },
  experimental: {
    // Deal-email attachments are allowed up to 25MB combined (Gmail's own
    // limit, enforced in sendTemplatedEmailAction) - the body limit has to
    // cover that on top of visitkort photo uploads (base64-inflated ~33%),
    // or the framework silently rejects the request before our own code
    // ever sees it.
    serverActions: {
      bodySizeLimit: "30mb",
    },
  },
};

export default nextConfig;
