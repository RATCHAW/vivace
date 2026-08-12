// Deploys the Remotion Lambda render infrastructure:
//
//   1. the render function (one per Remotion version — redeploy after upgrades)
//   2. the site bundle of src/remotion/index.ts to S3 (redeploy after changing
//      the composition)
//
// Needs AWS credentials in the environment (REMOTION_AWS_ACCESS_KEY_ID and
// REMOTION_AWS_SECRET_ACCESS_KEY) — set up per
// https://www.remotion.dev/docs/lambda/setup. Prints the env vars the API
// needs; run with: pnpm --filter @repo/web remotion:deploy
import { existsSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { deployFunction, deploySite, getOrCreateBucket } from "@remotion/lambda";
import type { AwsRegion } from "@remotion/lambda/client";

// The AWS credentials live in apps/api/.env with the rest of the secrets —
// load them from there so this script needs no --env-file or exports.
const apiEnvPath = fileURLToPath(new URL("../../api/.env", import.meta.url));
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

const { functionName, alreadyExisted } = await deployFunction({
  region,
  createCloudWatchLogGroup: true,
  // Mapbox WebGL frames are memory-hungry; 2GB is Remotion's recommended floor.
  memorySizeInMb: 2048,
  timeoutInSeconds: 240,
});
console.log(
  `${alreadyExisted ? "Reusing" : "Deployed"} Lambda function ${functionName} (${region})`,
);

const { bucketName } = await getOrCreateBucket({ region });

const { serveUrl } = await deploySite({
  region,
  bucketName,
  siteName: "run-video",
  entryPoint: fileURLToPath(new URL("../src/remotion/index.ts", import.meta.url)),
  options: {
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...config.resolve,
        alias: {
          ...(config.resolve?.alias as Record<string, string> | undefined),
          // Mirror the "@" alias from vite.config.ts / tsconfig paths.
          "@": fileURLToPath(new URL("../src", import.meta.url)),
        },
      },
    }),
  },
});
console.log(`Deployed site to ${serveUrl}`);

console.log(`
Add to apps/api/.env:

REMOTION_AWS_REGION=${region}
REMOTION_FUNCTION_NAME=${functionName}
REMOTION_SERVE_URL=${serveUrl}
`);
