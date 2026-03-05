# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SAVR (Semantic Automatic Version Releaser) is a GitHub Action that automatically drafts semantic GitHub Releases based on Conventional Commits. It maintains live draft releases that update on every push, allowing teams to see what's coming in the next release at any time.

## Development Commands

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

- Husky for git hooks (commit-msg validation, pre-commit linting)
- lint-staged for pre-commit formatting
- commitlint to enforce Conventional Commits
- ESLint (v10) with strict TypeScript checking, import sorting, and **arrow functions enforced** (`prefer-arrow-functions` plugin)
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

#### Commits Module (`src/commits/index.ts`)

Handles conventional commit parsing and categorization:

- `parseCommit()` - Parses commit messages using regex matching conventional format: `type(!)(scope): subject`
- Supported types: feat, fix, chore, docs, refactor, perf, test, ci, style, revert, build
- `categorizeCommits()` - Groups commits into features, fixes, and breaking changes
- `determineVersionBump()` - Returns 'major', 'minor', 'patch', or undefined based on commit categories

#### Version Module (`src/version/index.ts`)

Manages semantic versioning:

- `incrementVersion()` - Increments major/minor/patch and handles pre-release/build metadata
- `getLatestVersion()` - Finds latest semver tag from list, filters by prefix, sorts using semver comparison

#### GitHub Module (`src/github/index.ts`)

Interfaces with GitHub API via Octokit:

- `getTags()` - Fetches repository tags
- `getCommits()` - Paginated commit fetching between two SHAs with early termination at tag
- `createOrUpdateRelease()` - Checks for existing draft release by tag name and updates or creates new

#### Templates Module (`src/templates/index.ts`)

Uses Handlebars for release note generation:

- `compileReleaseNotes()` - Compiles template with version and categorized commits
- Two default templates exist: `action.yml` defines one with conditional rendering and emoji headers (used when user provides no override), and `src/templates/index.ts` has a hardcoded `DEFAULT_TEMPLATE` fallback (no conditionals, no emoji) used when the input is empty/whitespace
- Registers `groupByScope` helper that groups commits by scope, converting scope names to title case and sorting "General" (no scope) last

#### Utils Module (`src/utils/index.ts`)

- `sanitizeLogOutput()` - Escapes `::` sequences in strings to prevent GitHub Actions workflow command injection in logs

### Configuration Files

#### action.yml

Defines GitHub Action interface with inputs (github-token, tag-prefix, release-branch, dry-run, release-notes-template, initial-version) and outputs (version, tag, release-url, release-id). Runs on Node 24.

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
- Automatically deletes all other draft releases when creating/updating (keeps only the current one)

### Dry-run Mode

When enabled, logs all actions without making API calls to create/update releases.

## Test Structure

Tests located in `__tests__/`:

- `commits.test.ts` - Commit parsing and categorization
- `version.test.ts` - Version incrementing and tag filtering
- `templates.test.ts` - Handlebars template compilation
- `github.test.ts` - GitHub API interactions
- `utils.test.ts` - Utility function tests
- `main.test.ts` - End-to-end workflow testing
