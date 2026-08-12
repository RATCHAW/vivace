import { defineConfig } from "@hey-api/openapi-ts";

// Generates the typed client and TanStack Query options from the API's own
// OpenAPI document. Regenerate with `pnpm generate` at the repo root, which
// re-emits apps/api/openapi.json first so the two can't drift.
export default defineConfig({
  input: "../api/openapi.json",
  output: {
    path: "./src/api/generated",
    // Generated code is committed; keep it byte-stable rather than reformatted.
    postProcess: [],
  },
  plugins: [
    // The document's server is "/" — same-origin, which is what the Vite dev
    // proxy and nginx both give us. No base URL to configure.
    "@hey-api/client-fetch",
    "@hey-api/typescript",
    "@hey-api/sdk",
    { name: "@tanstack/react-query", queryOptions: true },
  ],
});
