import path from "node:path";

// There is no linter or formatter in this repository, so the pre-commit gate is
// the check that already defines "done" — `typecheck` — narrowed to the
// workspaces the commit actually touches. Turbo caches the result, so a second
// commit against the same package costs nothing.
//
// lint-staged stashes unstaged work first, which is what makes this honest: tsc
// sees the tree that is about to be committed, not the one on disk.
const WORKSPACES = [
  ["apps/api", "@repo/api"],
  ["apps/landing", "@repo/landing"],
  ["apps/web", "@repo/web"],
  ["packages/strava-api", "@repo/strava-api"],
  ["packages/video", "@repo/video"],
];

const typecheckAffected = (files) => {
  const staged = files.map((file) => path.relative(process.cwd(), file));

  const filters = WORKSPACES.filter(([dir]) =>
    staged.some((file) => file.startsWith(`${dir}/`)),
  ).map(([, name]) => `--filter=${name}`);

  // A staged `.ts` outside every workspace (a root config, a script) has no
  // project to typecheck — returning nothing lets the commit through.
  return filters.length ? [`turbo run typecheck ${filters.join(" ")}`] : [];
};

export default {
  "**/*.{ts,tsx}": typecheckAffected,
};
