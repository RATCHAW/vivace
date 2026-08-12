import { defineConfig } from "@hey-api/openapi-ts";

// Strava's own Swagger 2.0 spec, bundled offline by scripts/bundle-spec.mjs.
// openapi-ts upconverts it to OpenAPI 3.1 on the way in.
export default defineConfig({
  input: "./openapi/strava-swagger.json",
  output: {
    path: "./src/generated",
    // Generated code is committed; keep it byte-stable rather than reformatted.
    postProcess: [],
  },
  plugins: [
    {
      name: "@hey-api/client-fetch",
      // The spec's host/basePath — every SDK call is relative to it.
      baseUrl: "https://www.strava.com/api/v3",
    },
    "@hey-api/typescript",
    "@hey-api/sdk",
  ],
});
