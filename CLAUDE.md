# CLAUDE.md

SAVR (Semantic Automatic Version Releaser) is a GitHub Action that keeps a live draft GitHub Release, versioned from Conventional Commits, updated on every push. Maintainers publish it by hand.

## Toolchain

- Node follows the action runtime (`runs.using` in `action.yml`), not the latest LTS. `.node-version` is the single source for dev and CI (mise users run `mise trust` once so `mise.toml` can read it). A newer system Node breaks `pnpm install` and so every husky hook: `engineStrict` is on and `@github/local-action` caps `engines.node` at `^24`.
- A runtime bump (#316) moves in lockstep: `.node-version`, `action.yml` `runs.using`, `package.json` `engines.node` + `@types/node`, and the `@types/node` ignore in `.github/dependabot.yml`.
- pnpm only, pinned by `packageManager`. pnpm 11 reads its settings (`overrides`, `allowBuilds`, `engineStrict`, `saveExact`) from `pnpm-workspace.yaml` alone; read its header before touching `overrides`, since a stale pin silently keeps overriding the declared version.

## Commands

- `pnpm check` answers "would CI pass?": build, then `pnpm verify` (the gates, defined once in `package.json`). Add new gates to `verify`, not to `test.yml`. It rebuilds `dist/` in your tree, and it leaves out four CI checks: `pnpm audit` (network-dependent), PR-title commitlint (`validate-pr.yml`), actionlint (`lint-workflows.yml`: the npm builds lack shellcheck, so run a native `actionlint` by hand) and the stale-`dist/` gate. That gate is the one exception to "gates go in `verify`": it compares the committed `dist/` with the build, so locally it would be red on every uncommitted change, and in `test.yml` it must run after the artifact upload (ADR 0005).
- `pnpm typecheck` reads `tsconfig.eslint.json` (`src`, `__tests__`, the config files), not `tsconfig.json`: that one is the build config and leaves out `__tests__` (#331). Narrowing the ESLint config narrows the typecheck too.
- `pnpm local-action` runs the action locally against a `.env`; copy `.env.example`.

## Conventions

- Commit messages are Conventional Commits (commitlint on `commit-msg`), and on `main` their types decide this repo's own next version.
- Write arrow functions; `prefer-arrow-functions` makes function declarations a lint error.
- Write internal imports as relative paths with a `.js` extension (`./commits.js`), as NodeNext ESM requires.
- `package-changed` looks unused but backs the `post-checkout`/`post-merge`/`post-rebase` hooks, which rerun `pnpm install` when the lockfile changed across a branch switch.

## Architecture

`src/main.ts` orchestrates one run: read inputs → fetch tags and commits → pick the bump → render notes → create or update the draft. Each step lives in one module:

- `commits.ts`: Conventional Commit parsing and the bump each category implies
- `version.ts`: semver tags, incrementing, `bump-minor-pre-major`
- `github.ts`: every Octokit call
- `templates.ts`: Handlebars release notes. The default template exists twice (`action.yml` and `DEFAULT_TEMPLATE`); `templates.test.ts` fails if they drift
- `utils.ts`: `sanitizeLogOutput()`, which escapes `::` so logged input cannot inject workflow commands

### Release behaviour

- Breaking changes come from `!` after the type or a `BREAKING CHANGE:` footer.
- No tags yet → the first release is `initial-version` (default 1.0.0).
- New commits are the ones between HEAD and the latest tag's commit; annotated tags are dereferenced first.
- No bump (e.g. only `chore`/`docs`), or HEAD is the latest tag's commit → nothing is created or updated, but SAVR-managed drafts at or below the latest tag (same prefix, valid semver) are deleted, e.g. after a tag pushed by hand (#312).
- Releases are always drafts. The draft for the same tag name is reused; other drafts carrying `SAVR_MARKER` are deleted, and drafts without it are left alone.

### This repo releases itself

`.github/workflows/release-draft.yml` runs SAVR (`uses: ./`) on every push to `main`, so a change to the action is exercised on this repo's own draft release. Dependabot auto-merges use `GITHUB_TOKEN` and start no push runs, so the draft catches up at the next human merge; accepted in #333.

## Bundled `dist/`

`dist/` is committed because Actions run the bundle directly; consumers get whatever is on the tag.

- Normal path: committing anything under `src/**/*.ts`, `pnpm-lock.yaml` or `package.json` triggers a `lint-staged` task that rebuilds and stages `dist/` in the same commit. Why local-first: `docs/adr/0004-build-dist-locally.md`.
- Safety net for same-repo PRs without hooks (Dependabot): `test.yml` uploads a rebuilt `dist/` and `commit-dist.yml` commits it, then re-dispatches `Test`. It never pushes to forks. The unprivileged/privileged split is a security boundary (`docs/adr/0001-dist-rebuild-split-flow.md`). `commit-dist.yml` runs from the default branch, so edits to it take effect only after merge.
- Gate: `Test` fails while a PR's `dist/` differs from the build, so nothing merges ahead of its bundle (`docs/adr/0005-gate-merges-on-current-dist.md`). A red `Test` on a Dependabot PR is expected and heals once the safety net pushes; a fork stays red until someone runs `pnpm build`.
- Backstop: `check-dist.yml` fails when `main`'s `dist/` is stale anyway (ruleset bypass, direct push), on push and on a daily schedule; its error names the fix. The schedule stays because the ruleset does not require PRs to be up to date: two Dependabot PRs can each pass the gate yet merge into a stale `dist/`, and their merges start no push runs (#333).

## GitHub Issues

- Every issue follows a template in `.github/ISSUE_TEMPLATE/` (blank issues are disabled). With `gh issue create`, reproduce the template's section headers and apply its label yourself: Bug Report → `bug`, Feature Request → `enhancement`, Improvement → `improvement`, Documentation → `documentation`.
- File an issue right away for each code-review finding. Test-related findings use Improvement, with the area set to the module.

## Agent skills

- Issue tracker: GitHub Issues on `21stdigital/savr-action` via `gh`; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.
- Triage labels: the default five roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.
- Domain docs: `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
- Review rules lint can't enforce (glossary terms in code, borrowed public names such as `bump-minor-pre-major`): `CODING_STANDARDS.md`.
