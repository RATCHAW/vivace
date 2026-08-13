// Deploys the Remotion Lambda render infrastructure:
//
//   1. one render function per *profile* the catalogue uses. Remotion derives a
//      function's name from its Remotion version, memory and timeout, so two
//      profiles are two functions automatically — which is the point: a template
//      that only lays out type shouldn't be billed at the map template's memory.
//      Redeploy after a Remotion upgrade.
//   2. one site: the bundle of src/lambda-entry.ts, holding every composition,
//      uploaded under a name that carries the commit it was built from. Nothing
//      overwrites a site a shipped video was rendered from, so rolling back is
//      pointing REMOTION_SERVE_URL at the previous one. Redeploy after changing
//      a composition.
//
// Needs AWS credentials in the environment (REMOTION_AWS_ACCESS_KEY_ID and
// REMOTION_AWS_SECRET_ACCESS_KEY) — set up per
// https://www.remotion.dev/docs/lambda/setup. Prints the env vars the API
// needs; run with: pnpm video:deploy
//
// (`pnpm --filter @repo/video deploy` runs pnpm's own `deploy` command, not this
// script — hence the `run` in the root package.json.)
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { deployFunction, deploySite, getOrCreateBucket } from "@remotion/lambda";
import type { AwsRegion } from "@remotion/lambda/client";
import {
  DEFAULT_TEMPLATE_ID,
  functionNameEnvVar,
  getTemplate,
  profilesInUse,
  RENDER_PROFILES,
  VIDEO_TEMPLATES,
} from "../src/registry";

// The AWS credentials live in apps/api/.env with the rest of the secrets —
// load them from there so this script needs no --env-file or exports.
const apiEnvPath = fileURLToPath(new URL("../../../apps/api/.env", import.meta.url));
if (existsSync(apiEnvPath)) process.loadEnvFile(apiEnvPath);

if (
  !process.env.REMOTION_AWS_ACCESS_KEY_ID ||
  !process.env.REMOTION_AWS_SECRET_ACCESS_KEY
) {
  console.error(
    "Missing REMOTION_AWS_ACCESS_KEY_ID / REMOTION_AWS_SECRET_ACCESS_KEY " +
      `(looked in ${apiEnvPath} and the environment).\n` +
      "Create them per https://www.remotion.dev/docs/lambda/setup",
  );
  process.exit(1);
}

const region = (process.env.REMOTION_AWS_REGION ?? "us-east-1") as AwsRegion;

/**
 * The site's name, and with it its URL.
 *
 * Named after the commit so a deploy adds a bundle rather than replacing the one
 * an athlete's finished video was rendered from — and so the `serve_url` stored
 * on every render row says exactly which source built it. A dirty tree gets one
 * shared `-dirty` name: iterating on a composition shouldn't litter S3 with a
 * bundle per save, and those builds are not ones anything should be rolled back
 * to anyway.
 */
function siteName(): string {
  const override = process.env.REMOTION_SITE_NAME;
  if (override) return override;
  try {
    const git = (...args: string[]) =>
      execFileSync("git", args, { encoding: "utf8" }).trim();
    const sha = git("rev-parse", "--short", "HEAD");
    return `vivace-${sha}${git("status", "--porcelain") ? "-dirty" : ""}`;
  } catch {
    // No git, or no commits yet — a shell one-liner shouldn't be fatal here.
    return "vivace-dev";
  }
}

const profiles = profilesInUse();
console.log(
  `Catalogue: ${VIDEO_TEMPLATES.length} template(s) over ${profiles.length} profile(s) — ` +
    VIDEO_TEMPLATES.map((t) => `${t.id} (${t.profile})`).join(", "),
);

/** profile -> the Lambda function that renders it. */
const functions = new Map<string, string>();
for (const profile of profiles) {
  const { memorySizeInMb, timeoutInSeconds } = RENDER_PROFILES[profile];
  const { functionName, alreadyExisted } = await deployFunction({
    region,
    createCloudWatchLogGroup: true,
    memorySizeInMb,
    timeoutInSeconds,
  });
  functions.set(profile, functionName);
  console.log(
    `${alreadyExisted ? "Reusing" : "Deployed"} ${profile} function ${functionName} ` +
      `(${memorySizeInMb}MB, ${timeoutInSeconds}s, ${region})`,
  );
}

const { bucketName } = await getOrCreateBucket({ region });

const { serveUrl } = await deploySite({
  region,
  bucketName,
  siteName: siteName(),
  entryPoint: fileURLToPath(new URL("../src/lambda-entry.ts", import.meta.url)),
});
console.log(`Deployed site to ${serveUrl}`);

// The shared function is the one the default template needs; every other profile
// gets its own variable, which is what `resolveRenderTarget` looks for first.
const defaultProfile = getTemplate(DEFAULT_TEMPLATE_ID).profile;
const overrides = profiles
  .filter((profile) => profile !== defaultProfile)
  .map((profile) => `${functionNameEnvVar(profile)}=${functions.get(profile)}`);

const envLines = [
  `REMOTION_AWS_REGION=${region}`,
  `REMOTION_FUNCTION_NAME=${functions.get(defaultProfile)}`,
  ...overrides,
  `REMOTION_SERVE_URL=${serveUrl}`,
];

console.log(`
Add to apps/api/.env:

${envLines.join("\n")}
`);

// CI pushes these to the running API rather than a human copying them across.
// It reads the block from a file instead of scraping stdout, so adding a
// profile adds a line here and nothing downstream needs editing — which is the
// whole reason the names are derived in registry.ts rather than spelled twice.
const envFile = process.env.REMOTION_DEPLOY_ENV_FILE;
if (envFile) {
  writeFileSync(envFile, `${envLines.join("\n")}\n`);
  console.log(`Wrote ${envLines.length} variables to ${envFile}`);
}
