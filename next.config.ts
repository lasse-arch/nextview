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
    // Visitkort photo uploads are compressed client-side but base64 still
    // inflates size ~33% - the default 1MB limit was too tight for that.
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
