import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Standalone output bundles everything needed to run without node_modules.
  // Required for efficient Docker + DigitalOcean deployment.
  output: "standalone",
};

export default nextConfig;
