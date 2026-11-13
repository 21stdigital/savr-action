# Gate merges on a current dist/

The required `Test` check fails while a PR's committed `dist/` differs from the build. It still uploads the rebuilt `dist/` first, so for same-repo PRs `commit-dist.yml` (ADR 0001) pushes the rebuild, re-dispatches `Test`, and the PR turns green on the new commit. A merge, auto-merge included, can therefore no longer land before the bundle does.

## Status

accepted

## Context

ADR 0004 removed the race for commits that run local hooks, but Dependabot PRs cannot run them. Patch and minor bumps are auto-merged the moment `Test` is green, which happened before `commit-dist.yml` had pushed. The branch was deleted on merge, the push failed, and `main` kept a stale bundle: #288 (repaired by #289) and #321 (repaired by #325). See #326.

## Considered options

- **Fall back to `main`**: when the head branch is gone, `commit-dist.yml` opens a PR against `main`. Rejected: it adds machinery to the privileged half, the PR would itself need its checks dispatched, and `main` would still be stale until it merges.
- **Exclude runtime dependencies from auto-merge**: rejected. The auto-merge rule is the org-wide shared workflow, and a prompt human merge loses the same race (#288 lost it by four seconds).
- **Gate the merge (chosen)**: it reuses the existing re-dispatch, so it needs no app token. A pushed commit from `GITHUB_TOKEN` gets a `Test` status that satisfies the ruleset; #247 auto-merged that way. Unlike the option ADR 0004 rejected, the privileged workflow does not have to post a status on every path, because `Test` already reports on every path. Unlike ADR 0001's rejected "fail the check", the auto-commit stays.

## Consequences

- A same-repo PR without hooks (typically Dependabot) shows a red `Test` that heals itself within a minute or two. The failure message says no action is needed.
- Fork PRs stay red until the contributor (or a maintainer, if edits are allowed) runs `pnpm build`. `commit-dist.yml` never pushes to forks (ADR 0001).
- The gate also applies to re-dispatched runs. A `dist/` that still differs after the rebuild points to a non-deterministic build and stays red.
- `check-dist.yml` stays as the backstop for paths the gate cannot see: ruleset bypasses and direct pushes to `main`.
