import type { NextConfig } from "next";

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
        // iframe on our own tour pages - still never on other sites.
        source: "/matterport/:path*",
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
