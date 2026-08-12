// Writes the OpenAPI document to apps/api/openapi.json.
//
// The file is committed so that `pnpm --filter @repo/web generate` (and CI, and
// a fresh clone) can regenerate the web client without a running API. Re-run
// `pnpm --filter @repo/api openapi:emit` whenever a route or schema changes.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { app, openAPIConfig } from "../src/app.js";

const OUT = fileURLToPath(new URL("../openapi.json", import.meta.url));

const document = app.getOpenAPI31Document(openAPIConfig);

await writeFile(OUT, `${JSON.stringify(document, null, 2)}\n`);

console.log(
  `Wrote ${Object.keys(document.paths ?? {}).length} paths to apps/api/openapi.json`,
);
