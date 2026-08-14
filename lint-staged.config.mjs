import path from "node:path";

// The pre-commit gate, in the order a fix should happen: format the staged
// files, lint them, then typecheck the workspaces they belong to.
//
// lint-staged stashes unstaged work first, which is what makes this honest —
// every command sees the tree that is about to be committed, not the one on
// disk — and it re-stages whatever `--write`/`--fix` changed.
const WORKSPACES = [
  ["apps/api", "@repo/api"],
  ["apps/landing", "@repo/landing"],
  ["apps/web", "@repo/web"],
  ["packages/strava-api", "@repo/strava-api"],
  ["packages/video", "@repo/video"],
];

// `turbo run typecheck` is per package, not per file, so the staged paths are
// mapped back to the workspaces that own them and only those are checked.
// Turbo caches the result, so a second commit against the same package is free.
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
  // Everything Prettier understands and has not been told to ignore. Without
  // `--ignore-unknown` a staged `.env.example` or Dockerfile would fail the
  // hook rather than be skipped.
  "*": "prettier --write --ignore-unknown",

  // `--max-warnings=0` because a warning nobody has to fix is one nobody does.
  // `--no-warn-ignored` keeps a staged file that eslint.config.mjs ignores
  // (a generated client, a vendored skill) from failing the run.
  "**/*.{ts,tsx,mjs,js}": ["eslint --fix --max-warnings=0 --no-warn-ignored"],

  "**/*.{ts,tsx}": typecheckAffected,
};
