# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SAVR (Semantic Automatic Version Releaser) is a GitHub Action that automatically drafts semantic GitHub Releases based on Conventional Commits. It maintains live draft releases that update on every push, allowing teams to see what's coming in the next release at any time.

## Development Commands

### Toolchain

- Node ≥24 required (matches the action runtime `using: node24` in `action.yml`; CI workflows also pin `node-version: 24`)
- Package manager pinned to pnpm 10.7.1 via the `packageManager` field — prefer `pnpm` over `npm`/`yarn` for all scripts

### Building

```bash
pnpm build
```

Compiles the action using `@vercel/ncc` to bundle everything into `dist/index.js`.

### Testing

```bash
pnpm test                              # Run all tests with Vitest
pnpm vitest __tests__/commits.test.ts  # Run specific test file
```

### Local Development

```bash
pnpm local-action  # Test action locally using @github/local-action
```

Requires a `.env` file with GitHub token and repository context variables.

### Code Quality

```bash
pnpm prepare       # Setup Husky git hooks
pnpm eslint .      # Run ESLint (no dedicated lint script)
pnpm prettier --check .  # Check formatting
```

The project uses:

- Husky git hooks in `.husky/`:
  - `pre-commit` → `lint-staged`
  - `commit-msg` → `commitlint --edit`
  - `post-checkout` / `post-merge` / `post-rebase` → `package-changed run "pnpm install"` (auto-reinstalls when `package.json`/`pnpm-lock.yaml` changed across branches — the reason `package-changed` is a devDep)
- commitlint to enforce Conventional Commits
- ESLint (v10) flat config in `eslint.config.js` with strict TypeScript checking, import sorting, and **arrow functions enforced** (`prefer-arrow-functions` plugin)
- Prettier for code formatting

## Architecture

### Entry Point and Workflow

- `src/index.ts` - Entry point that calls `run()` from main.ts
- `src/main.ts` - Orchestrates the entire workflow:
  1. Validates inputs from action.yml
  2. Fetches tags and commits from GitHub
  3. Determines version bump based on commit types
  4. Compiles release notes from Handlebars template
  5. Creates or updates draft release

### Core Modules

#### Commits Module (`src/commits.ts`)

Handles conventional commit parsing and categorization:

- `parseCommit()` - Parses commit messages using regex matching conventional format: `type(!)(scope): subject`
- Supported types: feat, fix, chore, docs, refactor, perf, test, ci, style, revert, build
- `categorizeCommits()` - Groups commits into features, fixes, and breaking changes
- `determineVersionBump()` - Returns 'major', 'minor', 'patch', or undefined based on commit categories

#### Version Module (`src/version.ts`)

Manages semantic versioning:

- `incrementVersion()` - Increments major/minor/patch and handles pre-release/build metadata
- `getLatestVersion()` - Finds latest semver tag from list, filters by prefix, sorts using semver comparison

#### GitHub Module (`src/github.ts`)

Interfaces with GitHub API via Octokit:

- `getTags()` - Fetches repository tags
- `getCommits()` - Paginated commit fetching between two SHAs with early termination at tag
- `createOrUpdateRelease()` - Checks for existing draft release by tag name and updates or creates new
- `getAnnotatedTag()` - Dereferences an annotated tag to its target commit SHA
- `getGitRef()` - Resolves a ref (branch/tag) to its SHA
- `deleteRelease()` - Deletes a release by ID (used for SAVR-marker draft cleanup)

#### Templates Module (`src/templates.ts`)

Uses Handlebars for release note generation:

- `compileReleaseNotes()` - Compiles template with version and categorized commits
- One default template with conditional rendering and emoji headers, kept in sync across two locations: `action.yml` (used when user provides no override) and `src/templates.ts` as a hardcoded `DEFAULT_TEMPLATE` fallback (used when the input is empty/whitespace). Both are identical
- Registers `groupByScope` helper that groups commits by scope, converting scope names to title case and sorting "General" (no scope) last

#### Utils Module (`src/utils.ts`)

- `sanitizeLogOutput()` - Escapes `::` sequences in strings to prevent GitHub Actions workflow command injection in logs

### Configuration Files

#### action.yml

Defines GitHub Action interface with inputs (github-token, tag-prefix, release-branch, dry-run, release-notes-template, initial-version) and outputs (skipped, dry-run, version, tag, release-url, release-id). Runs on Node 24.

#### TypeScript Configuration

- Uses path aliases: `@/` maps to `src/`
- Module system: NodeNext (ESM with .js extensions in imports)
- Multiple tsconfig files: base config, main config, and eslint-specific config

## Important Implementation Details

### Commit Message Parsing

Breaking changes are detected by:

1. `!` after commit type (e.g., `feat!: breaking change`)
2. `BREAKING CHANGE:` in commit message footer

### Release Logic

- If no tags exist, creates initial release at `initial-version` (default: 1.0.0)
- Compares HEAD SHA with latest tag commit SHA (dereferencing annotated tags first) to find new commits
- Only creates/updates release if version bump is needed (skips if only chore/docs commits)
- Always creates draft releases (never published automatically)
- Reuses existing draft release for same tag name
- Automatically deletes other SAVR-managed draft releases (identified by `SAVR_MARKER`) when creating/updating; non-SAVR draft releases are preserved

### This Repo Releases Itself

`.github/workflows/release-draft.yml` runs SAVR on every push to `main` via `uses: ./`, so the action dogfoods its own draft-release flow. Maintainers publish new versions manually from the GitHub Releases UI.

### Bundled `dist/` and CI Auto-Rebuild

- `dist/index.js` is committed — GitHub Actions execute the bundled output directly, so it must ship with every version
- `.github/workflows/dist-rebuild.yml` runs on `pull_request_target` and auto-commits a rebuilt `dist/` back to the PR when `src/` changed but `dist/` wasn't refreshed
- Contributors do **not** need to run `pnpm build` before opening a PR; the workflow reconciles it. Local rebuilds are only needed when testing the action outside of CI

### Dry-run Mode

When enabled, logs all actions without making API calls to create/update releases.

## GitHub Issues

- **All issues must conform to the issue templates** in `.github/ISSUE_TEMPLATE/`. Available templates: Bug Report (label: `bug`), Feature Request (label: `enhancement`), Improvement (label: `improvement`), Documentation (label: `documentation`). Fill in all required sections for the chosen template.
- `blank_issues_enabled: false` — freeform issues are not allowed.
- When creating issues via `gh issue create`, structure the body with the same section headers and content as the corresponding template form fields.
- When findings are identified during code reviews, create GitHub issues for them immediately.
- For test-related findings, use the Improvement template with area set to the relevant module.

## Test Structure

Tests located in `__tests__/`:

- `commits.test.ts` - Commit parsing and categorization
- `version.test.ts` - Version incrementing and tag filtering
- `templates.test.ts` - Handlebars template compilation
- `github.test.ts` - GitHub API interactions
- `utils.test.ts` - Utility function tests
- `main.test.ts` - End-to-end workflow testing
