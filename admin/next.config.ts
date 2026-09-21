import type { NextConfig } from "next";

// This app lives in a subfolder of the mobile app's repo, which has its own
// package-lock.json. Pin the root so Next doesn't infer the parent folder.
const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
