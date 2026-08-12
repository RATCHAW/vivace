// Downloads Strava's official Swagger 2.0 spec and bundles it into one
// self-contained document at openapi/strava-swagger.json.
//
// Why bundling is needed: Strava publishes the root document at
// developers.strava.com/swagger/swagger.json, but every schema lives in a
// sibling file referenced by absolute URL —
//   { "$ref": "https://developers.strava.com/swagger/athlete.json#/DetailedAthlete" }
// — and those files reference each other the same way. Codegen tools want a
// single document with local refs, so we walk the graph, hoist every remote
// definition into `definitions`, and rewrite the refs to `#/definitions/<Name>`.
//
// The bundled output is committed so `pnpm generate` is offline and
// deterministic. Re-run this script (`pnpm --filter @repo/strava-api spec:pull`)
// to pick up upstream API changes; the diff is the changelog.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT_URL = "https://developers.strava.com/swagger/swagger.json";
const REMOTE_PREFIX = "https://developers.strava.com/swagger/";
const OUT = fileURLToPath(new URL("../openapi/strava-swagger.json", import.meta.url));

/** @type {Map<string, Promise<Record<string, unknown>>>} url -> parsed document */
const documents = new Map();

function fetchDocument(url) {
  let pending = documents.get(url);
  if (!pending) {
    pending = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
      return res.json();
    });
    documents.set(url, pending);
  }
  return pending;
}

/**
 * `https://…/athlete.json#/DetailedAthlete` -> `{ url, name }`.
 *
 * A few schemas also reference a sibling in their *own* file with a bare
 * `#/TimedZoneDistribution`, so the document a ref was found in is the fallback.
 */
function parseRef(ref, ownerUrl) {
  const [url, pointer] = ref.split("#");
  const name = pointer?.replace(/^\//, "");
  if (!name || name.includes("/")) {
    throw new Error(`Unsupported ref shape: ${ref}`);
  }
  return { url: url || ownerUrl, name };
}

/** Definitions hoisted out of the remote files, keyed by their schema name. */
const definitions = {};
/** Names already queued so the ref graph's cycles terminate. */
const resolving = new Set();

/**
 * Rewrites every schema `$ref` in `node` to a local one, queueing each newly
 * seen definition for resolution. Mutates in place — the documents are ours.
 * `ownerUrl` is the document `node` came from, used to resolve bare `#/Name`
 * refs; the root document's own `#/parameters/…` refs are already local.
 */
async function localizeRefs(node, ownerUrl) {
  if (Array.isArray(node)) {
    await Promise.all(node.map((item) => localizeRefs(item, ownerUrl)));
    return;
  }
  if (!node || typeof node !== "object") return;

  const pending = [];
  for (const [key, value] of Object.entries(node)) {
    const isSchemaRef =
      key === "$ref" &&
      typeof value === "string" &&
      (value.startsWith(REMOTE_PREFIX) || (value.startsWith("#/") && ownerUrl !== ROOT_URL));

    if (isSchemaRef) {
      const { url, name } = parseRef(value, ownerUrl);
      node.$ref = `#/definitions/${name}`;
      pending.push(resolveDefinition(url, name));
    } else {
      pending.push(localizeRefs(value, ownerUrl));
    }
  }
  await Promise.all(pending);
}

async function resolveDefinition(url, name) {
  if (resolving.has(name)) return;
  resolving.add(name);

  const document = await fetchDocument(url);
  const schema = document[name];
  if (!schema) throw new Error(`${url} has no definition named "${name}"`);

  definitions[name] = schema;
  await localizeRefs(schema, url);
}

const root = await fetchDocument(ROOT_URL);
await localizeRefs(root, ROOT_URL);

// `definitions` is built by async fan-out, so sort it for a stable diff.
const bundled = {
  ...root,
  definitions: Object.fromEntries(
    Object.keys(definitions)
      .sort()
      .map((name) => [name, definitions[name]]),
  ),
};

await writeFile(OUT, `${JSON.stringify(bundled, null, 2)}\n`);

console.log(
  `Bundled ${Object.keys(root.paths).length} paths and ` +
    `${Object.keys(bundled.definitions).length} definitions from ` +
    `${documents.size} remote files -> openapi/strava-swagger.json`,
);
