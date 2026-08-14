// One flat config for the whole monorepo. ESLint 9+ resolves `files` patterns
// against the repo root, so a single process can lint five workspaces with five
// different environments — and every plugin is a root devDependency, which is
// what keeps the workspaces from each growing their own lint toolchain.
//
// Formatting is not ESLint's job here: `eslint-config-prettier` is last in the
// list and switches off every stylistic rule, so the two tools can never
// disagree about a line break. Run both — `pnpm lint` and `pnpm format`.
import js from "@eslint/js";
import next from "@next/eslint-plugin-next";
import prettier from "eslint-config-prettier/flat";
import reactHooks from "eslint-plugin-react-hooks";
import turbo from "eslint-plugin-turbo";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/",
      "**/.next/",
      "**/.turbo/",
      "**/next-env.d.ts",
      // Generated clients. CLAUDE.md's rule is that they are never hand-edited,
      // so a lint error in one is unfixable by definition.
      "apps/web/src/api/generated/",
      "packages/strava-api/src/generated/",
      // Vendored agent skills. Third-party sample code, pinned by content hash
      // in skills-lock.json — every finding in it is someone else's to fix, and
      // touching a byte invalidates the lock.
      ".agents/",
      ".claude/",
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommended,

  // Type-aware rules cost a TypeScript program, so they are scoped to the
  // directories a workspace tsconfig actually claims (`src` and `scripts`) —
  // pointing the project service at vite.config.ts or this file would error.
  //
  // These three are the reason to bother: an unawaited promise in a Hono
  // handler or a Remotion render is a silent, order-dependent bug, and no
  // syntactic rule can see it.
  {
    files: ["{apps,packages}/*/{src,scripts}/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          // `onClick={async () => …}` is how React is written; react-router 7's
          // `navigate` and the AI SDK's `stop`/`regenerate` return promises
          // every call site is expected to ignore; and React's own handler
          // types (`FormEventHandler`) are `=> void`, so an async submit
          // handler trips the variable check too. Those three positions flag
          // the framework's API shape, not a bug.
          //
          // The rest stay on, and they are the ones that catch real mistakes:
          // a promise used as a condition (always truthy), spread, passed as an
          // argument to something that will not await it, or returned from a
          // void-typed override.
          checksVoidReturn: {
            attributes: false,
            properties: false,
            variables: false,
          },
        },
      ],
    },
  },

  // An underscore is the escape hatch for a binding that has to exist but is
  // not read — a positional parameter, a destructured key being dropped.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },

  { languageOptions: { globals: globals.node } },
  {
    files: ["apps/{web,landing}/src/**"],
    languageOptions: { globals: globals.browser },
  },

  // `no-undeclared-env-vars` only makes sense where turbo's `env` list actually
  // governs the output: the two front ends, whose VITE_*/NEXT_PUBLIC_* reads are
  // inlined into a cached build. apps/api reads its environment at runtime in a
  // long-lived container, and vite.config.ts's API_URL only steers the dev
  // proxy (`dev` is `cache: false`) — declaring those would be cargo cult.
  {
    files: ["apps/{web,landing}/src/**/*.{ts,tsx}"],
    ...turbo.configs["flat/recommended"],
  },

  // Hooks rules apply wherever components live, and packages/video is full of
  // them even though it never runs in a browser.
  {
    files: ["{apps,packages}/*/src/**/*.{ts,tsx}"],
    // `configs["recommended-latest"]` is still the eslintrc shape in v7 (a
    // `plugins` array); the flat namespace is the one ESLint 10 accepts.
    ...reactHooks.configs.flat.recommended,
  },
  {
    files: ["apps/landing/src/**/*.{ts,tsx}"],
    ...next.configs["core-web-vitals"],
    rules: {
      ...next.configs["core-web-vitals"].rules,
      // A Pages Router rule. apps/landing is App Router only, so the rule can
      // never find a `pages/` directory and reports that fact once per run.
      "@next/next/no-html-link-for-pages": "off",
    },
  },

  // CLAUDE.md: logging is structured and never `console.log` — pino in the API,
  // the batching `@/lib/logger` in the browser. There were zero violations when
  // this was switched on; the rule is here to keep it that way. Scripts and
  // tests are exempt: stdout is their whole interface.
  {
    files: ["{apps,packages}/*/src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: { "no-console": "error" },
  },

  prettier,
);
