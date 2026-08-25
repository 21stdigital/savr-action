# Build dist/ locally on commit; keep commit-dist.yml as the safety net

`dist/` is rebuilt by a `lint-staged` task whenever `src/**/*.ts`, `pnpm-lock.yaml` or `package.json` is staged, and committed alongside the change. The split rebuild flow from ADR 0001 stays exactly as it is, but becomes the fallback for commits that cannot run hooks rather than the normal path.

## Status

accepted

## Context

ADR 0001 made CI the sole author of `dist/`, so contributors would not have to remember `pnpm build`. That works, but it puts the bundle's arrival _after_ the checks that gate the merge, and nothing gates on it. PR #288 merged four seconds before `commit-dist.yml` pushed; the push failed against the deleted branch, and `main` kept a `dist/` bundling a vulnerable `undici` while every check showed green and the Dependabot board showed zero alerts. #289 had to rebuild it by hand.

The race is not a one-off. It threatens any PR merged promptly after its checks pass — which is the normal case, and increasingly so with auto-merge.

## Considered options

- **Make `commit-dist.yml` a required status check.** Closes the race properly by blocking the merge until the bundle lands. Rejected for now: `workflow_run` jobs report no status against the PR head, so the workflow would first need a `createCommitStatus` step, and that status would have to be posted on _every_ path — including the early exit when `dist/` is already current and the `if`-gated skip for `workflow_dispatch` runs. Miss one and every PR hangs unmergeable. That is substantial new mechanism inside the privileged workflow, added to remove a race that the option below removes for free.
- **Leave it; rebuild by hand when it happens.** What #289 did. Rejected: it depends on someone noticing, and the failure is silent — green checks, quiet alert board, stale bundle shipping to consumers.
- **Build locally on commit (chosen).** When `dist/` is already correct at push time, the Test run finds nothing to upload, `commit-dist.yml` has nothing to push, and the race has no window to occur. No new mechanism in the privileged half.

## Consequences

- ADR 0001's security argument is untouched. The privileged workflow still never executes PR-controlled code; it simply has nothing to do in the common case.
- Fork and Dependabot PRs cannot run local hooks, so `commit-dist.yml` still carries them. It is now exercised rarely, which is worth knowing: a regression in it will surface later than it used to.
- Commits touching `src/`, the lockfile or `package.json` pay an `ncc` build (~2.5s).
- `dist/` diffs now appear in the authoring commit rather than a follow-up, making review noisier but the history honest about what shipped.
