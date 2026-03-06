<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="logo-dark.svg">
    <img src="logo-light.svg" alt="SAVR Logo" width="200"/>
  </picture>
  <br>
  SAVR
</h1>

> Keep draft releases ready so your team can publish manually from the GitHub Releases UI.

SAVR is a focused GitHub Action for repositories already using Conventional Commits. On every push, it updates a single draft release with the next semantic version and fresh release notes so the release is already waiting in GitHub when your team is ready to publish.

## Why SAVR?

SAVR exists for teams that do **not** want one of these two release workflows:

- Fully automated publishing on every qualifying merge
- A manual `workflow_dispatch` release job that someone has to remember to trigger

Instead, SAVR keeps the next release ready at all times:

1. Push commits to your release branch
2. SAVR updates the draft release and release notes automatically
3. A maintainer reviews and publishes from the GitHub Releases page when ready

### What Makes It Different

- **Always-ready draft releases**: your next release already exists in GitHub instead of being generated only at publish time
- **Manual publishing in GitHub UI**: publish from the Releases page without a separate release workflow
- **Conventional Commits in, semantic version out**: `feat`, `fix`, and breaking changes drive the next suggested version
- **Focused scope**: SAVR does not try to own package publishing, changelog files, or every release concern in your pipeline

### Use SAVR If

- You want release notes and the next version prepared continuously
- You want a human to decide when the release actually goes out
- You prefer publishing from GitHub's native Releases UI
- You already use Conventional Commits or can adopt them easily

### Skip SAVR If

- You want fully automated publishing to npm, containers, or app stores
- You need changelog file management as a first-class feature
- You do not want to use Conventional Commits
- You are happy with a manually triggered release workflow already

### Quick Comparison

| Workflow                      | Best fit                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| Fully automated release tools | You want CI to publish releases for you with minimal human review                             |
| Manual release workflows      | You are comfortable triggering a release job each time someone wants to cut a release         |
| **SAVR**                      | You want the release prepared continuously and published manually from the GitHub Releases UI |

## Features

- 📝 **Always-ready draft releases**: Automatically updates the latest draft release on every push
- 🔍 **Visible release scope**: Team members can see what is in the next release before it ships
- 🎯 **GitHub UI publishing**: Publish when you're ready from the Releases page
- 🚫 **No manual release trigger**: No separate `workflow_dispatch` job for someone to remember
- 🔄 **Conventional Commits**: Leverages your existing commit messages to generate meaningful release notes
- 🏷️ **Semantic Versioning**: Automatically suggests the next version based on commit types
- 🧪 **Dry-run Mode**: Test changes without affecting your repository

## Quick Start

```yaml
name: Draft Release
on:
  push:
    branches:
      - main

permissions:
  contents: write

concurrency:
  # Serialize SAVR runs per workflow+ref so newer pushes supersede older draft runs.
  group: draft-release-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0

      - name: Create Release Draft
        uses: 21stdigital/savr-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          # Optional configuration:
          # tag-prefix: 'v'
          # dry-run: false
          # release-notes-template: |
          #   ## Release {{version}}
          #   {{#if features}}
          #   ### Features
          #   {{#each features}}
          #   - {{this.subject}}
          #   {{/each}}
          #   {{/if}}
```

> [!TIP]
> Keep `concurrency` enabled to reduce overlapping draft-release runs on the same ref.
> The example above matches the bundled workflow: newer pushes cancel older in-flight draft updates so the latest commit wins.
> Cleanup is still best-effort, so a successful release create/update does not fail just because deleting older SAVR-managed drafts hit a race or transient GitHub error.

After the workflow is in place, your release process becomes:

1. Merge or push Conventional Commit messages to `main`
2. Open the GitHub Releases page to review the up-to-date draft
3. Publish the release manually when your team is ready

## Inputs

| Input                    | Description                                                                                                            | Required | Default          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- | -------- | ---------------- |
| `github-token`           | GitHub token for API authentication. Use `GITHUB_TOKEN` with `contents: write` permission, or a PAT with `repo` scope. | Yes      | -                |
| `tag-prefix`             | Prefix for version tags. Must be <= 20 chars and use only letters, numbers, `.`, `-`, `_`, `/`                         | No       | `v`              |
| `release-branch`         | The branch to monitor for new commits                                                                                  | No       | `main`           |
| `dry-run`                | Simulate the process without creating releases                                                                         | No       | `false`          |
| `release-notes-template` | Template for release notes formatting                                                                                  | No       | Default template |
| `initial-version`        | The initial version to start from                                                                                      | No       | `1.0.0`          |

`tag-prefix` validation is strict and fails the action when invalid:

- Maximum length: `20` characters
- Allowed characters: letters (`a-z`, `A-Z`), numbers (`0-9`), dot (`.`), hyphen (`-`), underscore (`_`), slash (`/`)

## Outputs

| Output        | Description                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------- |
| `version`     | The calculated version number (e.g., `1.2.3`)                                                |
| `tag`         | The full tag name including prefix (e.g., `v1.2.3`)                                          |
| `release-url` | The URL of the created/updated draft release                                                 |
| `release-id`  | The ID of the created/updated draft release                                                  |
| `skipped`     | Whether release creation was skipped (true when dry-run, no version bump, or no new commits) |
| `dry-run`     | Whether the action ran in dry-run mode                                                       |

> **Note:** `version`, `tag`, `release-url`, and `release-id` are set on all paths. On skip and dry-run paths, `release-url` and `release-id` will be empty strings. Use `skipped` and `dry-run` to distinguish outcomes:
>
> | Scenario              | `skipped` | `dry-run` |
> | --------------------- | --------- | --------- |
> | Release created       | `false`   | `false`   |
> | Dry-run               | `true`    | `true`    |
> | HEAD == tag / no bump | `true`    | `false`   |

## How It Works

- On every push, SAVR calculates the next semantic version based on commits since the last tag
- It creates or updates a single draft release with the generated release notes
- **Important:** When a new draft release is created, SAVR attempts to delete previous SAVR-managed draft releases so only the latest draft is kept. Manually created draft releases are not affected.
- Cleanup is best-effort: if deleting an older SAVR-managed draft races with another workflow run or GitHub returns a transient error, the current release update still succeeds and the action logs a warning instead of failing.

## Version Bump Rules

The action follows these rules to determine version bumps:

- **Major** (`1.0.0`): Breaking changes (`feat!` or `BREAKING CHANGE` in footer)
- **Minor** (`0.1.0`): New features (`feat`)
- **Patch** (`0.0.1`): Bug fixes (`fix`)
- **None**: Other changes (no version bump)

## Release Notes

Release notes are automatically generated and include:

- Features
- Bug fixes
- Breaking changes

The default template (from `action.yml`) uses the built-in `groupByScope` Handlebars helper:

```yaml
release-notes-template: |
  {{#if features}}
  ### ✨ Features
  {{#each (groupByScope features)}}
  #### {{this.scope}}
  {{#each this.commits}}
  - {{this.subject}}
  {{/each}}

  {{/each}}
  {{/if}}

  {{#if fixes}}
  ### 🐛 Fixes
  {{#each (groupByScope fixes)}}
  #### {{this.scope}}
  {{#each this.commits}}
  - {{this.subject}}
  {{/each}}

  {{/each}}
  {{/if}}

  {{#if breaking}}
  ### 💥 Breaking Changes
  {{#each (groupByScope breaking)}}
  #### {{this.scope}}
  {{#each this.commits}}
  - {{this.subject}}
  {{/each}}

  {{/each}}
  {{/if}}
```

### Custom Templates

You can provide your own Handlebars template via the `release-notes-template` input. The following data is available:

| Variable   | Type       | Description                   |
| ---------- | ---------- | ----------------------------- |
| `version`  | `string`   | The new version string        |
| `features` | `Commit[]` | Feature commits (`feat` type) |
| `fixes`    | `Commit[]` | Fix commits (`fix` type)      |
| `breaking` | `Commit[]` | Breaking change commits       |

Each `Commit` object has:

| Property   | Type                  | Description                                 |
| ---------- | --------------------- | ------------------------------------------- |
| `subject`  | `string`              | The commit subject line                     |
| `scope`    | `string \| undefined` | The commit scope (e.g., `feat(scope): ...`) |
| `type`     | `string`              | The commit type (`feat`, `fix`, etc.)       |
| `message`  | `string`              | The full original commit message            |
| `breaking` | `boolean`             | Whether this is a breaking change           |

The `groupByScope` helper groups an array of commits by their scope, returning objects with `{ scope, commits }`. Scopes without a value are grouped under "General".

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
