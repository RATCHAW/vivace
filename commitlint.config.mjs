// Conventional Commits, checked by `.husky/commit-msg`. No scope enum on
// purpose: the scope is the area a reader would name (`auth`, `landing`,
// `i18n`, `video`), and an allow-list would reject the first commit that
// touches a part of the repo nobody has touched yet.
export default {
  extends: ["@commitlint/config-conventional"],
};
