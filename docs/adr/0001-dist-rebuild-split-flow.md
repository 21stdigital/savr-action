# Rebuild dist/ via a split unprivileged-build / privileged-commit flow

To auto-commit a rebuilt `dist/` onto PRs without ever exposing the write-capable `GITHUB_TOKEN` to PR-controlled code, the build runs in the unprivileged `pull_request` workflow (`test.yml`, no write token) and uploads `dist/` as an artifact; a separate `commit-dist.yml` triggered by `workflow_run` — which runs from the default branch and therefore never executes PR code — downloads that artifact and commits it. This replaces the previous single `pull_request_target` job that ran `pnpm install` / `pnpm build` (PR-controlled scripts and source) while holding `contents: write`.

## Status

accepted

## Considered options

- **Single `pull_request_target` job (previous state).** Simplest, but executes the PR's `build` script and source with the write token — the textbook `pull_request_target` anti-pattern. Rejected: a compromised collaborator account or a poisoned Dependabot bump could reach the token.
- **Drop auto-commit; fail the check instead.** Most secure (no write token at all), but every Dependabot bump and dist-affecting PR would fail until someone manually runs `pnpm build`. Rejected: sparing exactly that friction — especially for Dependabot — is the workflow's whole purpose.
- **Split flow via `workflow_run` + artifact (chosen).** The privileged half never runs PR code, and the convenience is kept.

## Consequences

- `workflow_run` uses the workflow definition from the **default branch only**, so changes to `commit-dist.yml` cannot be exercised end-to-end from a PR — they take effect only after merge to `main`.
- The privileged job must re-assert the same-repo guard (`workflow_run` also fires for fork builds) and must still re-dispatch `test.yml` / `validate-pr.yml`, because commits authored by `GITHUB_TOKEN` do not trigger further workflows.
- Defense-in-depth already in place reduces residual risk on the unprivileged side: third-party actions pinned to commit SHAs, pnpm 11 `allowBuilds` blocking untrusted install scripts, and `--frozen-lockfile`.
