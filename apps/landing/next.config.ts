import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Docker image copies `.next/standalone` and runs `server.js` — no
  // node_modules layer, same shape as the api/web images.
  output: "standalone",
  // The monorepo root, not apps/landing: standalone tracing has to reach the
  // pnpm store at the top of the workspace.
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
};

export default nextConfig;
