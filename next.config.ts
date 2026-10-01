import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The contract PDF renderer reads public/logo.png via fs at request time
  // (see contract-html-template.ts) - without this it can be left out of
  // the deployed serverless function bundle and contract generation fails
  // in production, the same issue the old .docx template had.
  outputFileTracingIncludes: {
    "/*": ["./public/logo.png", "./node_modules/@sparticuz/chromium/bin/**/*"],
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
