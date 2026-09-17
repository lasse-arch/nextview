import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The contract .docx template is only read via a dynamically-built fs
  // path (see contract-generator.ts), which Next's file tracer can't
  // discover statically - without this it gets left out of the deployed
  // serverless function bundle and contract generation fails in production.
  outputFileTracingIncludes: {
    "/*": ["./src/contract-templates/**/*"],
  },
};

export default nextConfig;
