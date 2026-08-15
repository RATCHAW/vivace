---
name: pull-request
description: Open, describe, update and hand off pull requests in this repo — the checks that must pass first, the title and description house style, pushing from a Conductor worktree, and syncing a branch with main. Use when opening a PR, pushing a branch for review, writing or revising a PR title or description, or whenever the user mentions "PR", "pull request", "open a PR", "update the PR".
---

# Pull requests

## Before opening

`pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build`, from the
root. That is the list `.github/workflows/ci.yml` runs, in that order. The husky
`pre-commit` hook is a strict subset of it — staged files only, no tests, no build,
and `--no-verify` exists — so run the full list yourself rather than trusting the hook
to have caught anything.

Two more when they apply:

- **`pnpm generate` if a route or a schema changed.** `apps/api/openapi.json` and
  `apps/web/src/api/generated/` are committed artifacts, and a test fails when they
  drift from the routes.
- **`pnpm --filter @repo/video run bundle:check` if `packages/video` changed.** CI runs
  it, and webpack — not tsc — is what finds a bad import in the Lambda entry.

**One migration per pull request.** `scripts/check-new-migrations.sh` runs as its own
fast CI job and fails on a second new file in `apps/api/drizzle/`, or on any edit to one
that already exists. Two in a branch means squashing: delete the generated files, revert
`meta/_journal.json` and `meta/*_snapshot.json` to `origin/main`, then `pnpm db:generate`
once.

Never open a pull request from `main` — branch first if you are on it.

## Title

Conventional Commits, and with more than one commit on the branch the PR title becomes
the squash commit subject (`squash_merge_commit_title` is `COMMIT_OR_PR_TITLE`). So the
title is what lands on `main` and what `git log` shows a year from now — write it as the
commit message it becomes. Commitlint checks commits, never the PR title; nothing
mechanical will catch a bad one.

- `type(scope): what changed, in the imperative`. There is deliberately no scope
  allow-list — name the area a reader would name (`web`, `api`, `landing`, `video`, `ci`,
  `docker`, `deps`, `observability`).
- The hard limit is commitlint's 100 characters. The ones on `main` sit between 48 and 72.
- **Describe the outcome, not the mechanism.** "recover a tab left open across a deploy",
  not "add a vite:preloadError handler".
- Lowercase after the colon, no trailing period.

## Description

Short, and mostly bullets. One or two sentences saying what the PR introduces and why,
then a bullet per thing it changes. The older descriptions on this repo are three or four
dense paragraphs — accurate, and nobody read them past the first one. A reviewer should
have the whole shape of the change without scrolling.

1. **Lead with what it introduces**, in a sentence or two. What is different after this
   merges, and the concrete symptom it fixes when there is one — the error string, the
   event name, the file and line. If the lead needs a paragraph to set up, the title is
   wrong.
2. **Then one bullet per change**, outcome first and mechanism second, naming the file
   that now owns the behaviour: "coach answers carry their trace id back to the browser
   (`messageMetadata` in the chat route)". Keep each to a line or two. Three to six
   bullets is the normal size; ten means the PR should have been two.
3. **A bullet for what is deliberately not covered**, when there is something — an option
   left out, a surface that stays English, a follow-up. Saying it stops a reviewer looking
   for it. Bounding the blast radius counts too: "no API or schema changes" earns its
   bullet, because it tells a reviewer what *not* to read.
4. **Close on one line of verification.** Which checks ran, how many tests, and what was
   exercised by hand — a Docker build, a stub of a third-party API, the local nginx stack.

Still not a template: no `## Summary` heading, no checklist, no generated-by footer. A
bullet earns its place by naming something that changed, so drop the ones that only
restate the title, and put the *why* inside the bullet rather than in a paragraph above it
— a reason a reviewer would otherwise have to reverse-engineer (why one reload and not a
retry, why the SDK's own callbacks and not `withTracing`) belongs in the clause after the
dash, not in an essay.

If later commits change the scope, update the title *and* the description before handing
the PR off. A stale description is worse than none, and this one becomes the commit
message.

## What never goes in one

The repository is private today but was hardened for public release (#19), and titles,
descriptions and comments are permanent — editing one removes it from neither the
timeline nor anyone's email notification. Write every one as though it were already
public.

- **No secrets, tokens or connection strings**, including inside a pasted log or stack
  trace. Gitleaks scans the whole git history on every PR; it does not scan the
  description.
- **No athlete data.** Strava ids, names, emails, activity ids, GPS coordinates — and
  nothing shown on screen that came from a real account. `pnpm db:seed` is deterministic
  and exists for this.
- **No infrastructure detail the repository does not already state** — deployment UUIDs,
  Coolify or Tailscale hostnames, dashboard links.

## Showing a change

`apps/web` and `apps/landing` deploy to Vercel through its own git integration, so every
pull request already has preview deployments. Link the preview and name the route —
that is a reviewer clicking through the real thing rather than trusting a still image.

Do not reach for the orphan-commit-plus-`raw.githubusercontent.com` trick that works on a
public repo. GitHub proxies images in Markdown through camo, which fetches unauthenticated
and gets a 404 from a private repository's raw URL, so the body renders a broken image.
The browser uploader is session-only and unreachable with a token. If a visual is genuinely
required, drag it in by hand; otherwise describe it, which is what the landing-page PRs
(#31, #41) do.

## Pushing and opening

SSH push fails from a Conductor worktree; use the gh credential helper over HTTPS.

```bash
git -c credential.helper='!gh auth git-credential' push -u origin RATCHAW/<slug>

gh pr create --base main --title "type(scope): ..." --body "$(cat <<'EOF'
...
EOF
)"
```

- The branch has to exist on the remote before `gh pr create`, or pass `--head <branch>`.
- Ready for review, never a draft, unless the user asks for a draft.
- **CODEOWNERS pulls @RATCHAW into the review** for anything under `/.github/`, plus
  `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `docker-compose.yml`,
  `.gitleaksignore`, `.dockerignore` and every `Dockerfile`.
- **Green CI is a convention, not a gate.** Branch protection is unavailable on this
  plan (`gh api repos/RATCHAW/vivace/rulesets` answers 403), so nothing stops a red merge
  except you. And merging to `main` ships it — `deploy.yml` deploys the API on push, and
  Vercel takes the front ends.
- When checking out someone else's branch, set upstream so plain `git pull`/`git push`
  work: `gh pr checkout <n>`, or `git checkout -B <branch> FETCH_HEAD && git branch
  --set-upstream-to=origin/<branch>`.

## Syncing with main

**Default to a merge commit** — `git fetch origin && git merge origin/main`. It preserves
the pushed commits, so review comments stay anchored and CI results stay valid.

Rebase only when it is required or clearly better, and say why: the branch is unpushed and
unshared, or a merge would tangle a conflict that a rebase resolves cleanly commit by
commit. "Linear history is nicer" is not a reason. After a rebase, push with
`--force-with-lease`, never plain `--force`, and never on `main`.

Two conflicts have fixed recipes:

- **`apps/api/drizzle/`** — revert it to `origin/main` *before* merging, then run
  `pnpm db:generate` once after. Resolving a `_journal.json` or `*_snapshot.json` conflict
  by hand produces a snapshot describing neither branch, and the migration guard fails.
- **`pnpm-lock.yaml`** — run `pnpm install`.

## CI

Two workflows run automatically on every pull request to `main`, and neither costs
anything to run, so there is no on-demand trigger to reach for:

- **`ci.yml`** — the migration guard (seconds, diff-only) and then the full check list
  plus the Remotion bundle check.
- **`security.yml`** — gitleaks over all history, actionlint, zizmor at
  `--min-severity=medium`, and `pnpm audit --audit-level high`. The container scan is
  schedule and dispatch only.

A red `pnpm audit` is usually a transitive advisory nobody in this branch introduced. Say
so in the description rather than silently bumping an unrelated dependency inside a
feature PR.
