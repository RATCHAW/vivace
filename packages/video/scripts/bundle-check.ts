// Builds the Lambda site bundle locally, without AWS.
//
// `deploySite` is the only thing that normally compiles this entry, so a broken
// import, a missing dependency or a CSS loader that can't handle a new asset
// would otherwise surface halfway through a deploy. Run it after adding a
// template: pnpm --filter @repo/video bundle:check
//
// It also reports how much of the bundle is in the entry chunk versus lazily
// loaded, which is the number that matters on Lambda — the entry is downloaded
// on every cold start, a template's chunk only when that template renders.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { VIDEO_TEMPLATES } from "../src/registry";

const outDir = await bundle({
  entryPoint: fileURLToPath(new URL("../src/lambda-entry.ts", import.meta.url)),
  onProgress: (percent) => {
    if (percent % 25 === 0) process.stdout.write(`bundling ${percent}%\n`);
  },
});

const kb = (bytes: number) => `${Math.round(bytes / 1024)}kB`;
const chunks = readdirSync(outDir)
  .filter((name) => name.endsWith(".js"))
  .map((name) => ({ name, size: statSync(join(outDir, name)).size }));

const entry = chunks.find((chunk) => chunk.name === "bundle.js");
const lazy = chunks.filter((chunk) => chunk !== entry);

console.log(`\nBundled ${VIDEO_TEMPLATES.length} template(s) to ${outDir}`);
console.log(`  entry (every cold start): ${kb(entry?.size ?? 0)}`);
console.log(
  `  lazy (${lazy.length} chunks, only what a render asks for): ` +
    kb(lazy.reduce((total, chunk) => total + chunk.size, 0)),
);
