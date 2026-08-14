// Prettier's defaults, on purpose. Before this file existed the repository was
// already 80 columns, semicolons, double quotes, two-space indent and trailing
// commas everywhere except the vendored shadcn components — which is Prettier's
// default output exactly. Writing the defaults down rather than inheriting them
// silently is the only change: it makes the settings greppable, and it means an
// editor with a different global config formats this repo the same way CI does.
/** @type {import("prettier").Config} */
export default {
  // Matches the prose width the source comments are already hand-wrapped to.
  printWidth: 80,
};
