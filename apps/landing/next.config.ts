import type { NextConfig } from "next";

// Vercel traces the build itself and reads `.next/next-server.js.nft.json`,
// which `output: "standalone"` does not leave there — the build dies on ENOENT.
// Standalone exists for the Docker image in docker-compose, so it belongs to
// the self-hosted path alone.
//
// `VERCEL` is declared in turbo.json's `env`: strict mode is the default and
// would otherwise filter it out before this file could read it.
const selfHosted = !process.env.VERCEL;

const nextConfig: NextConfig = {
  ...(selfHosted
    ? {
        // The Docker image copies `.next/standalone` and runs `server.js` — no
        // node_modules layer, same shape as the api/web images.
        output: "standalone" as const,
        // The monorepo root, not apps/landing: standalone tracing has to reach
        // the pnpm store at the top of the workspace.
        outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
      }
    : {}),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
