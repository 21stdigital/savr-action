<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="logo-dark.svg">
    <img src="logo-light.svg" alt="SAVR Logo" width="200"/>
  </picture>
  <br>
  SAVR - Semantic Automatic Version Releaser
</h1>

> A focused GitHub Action for automated release notes and draft releases, built for teams using conventional commits.

SAVR is a lightweight GitHub Action that does two things really well:

1. Automatically generates and updates draft releases with comprehensive release notes on every push
2. Makes it easy to publish releases manually through GitHub's UI when you're ready

## Why SAVR?

While there are many semantic versioning tools available, SAVR was created to solve specific pain points that other tools don't address:

### 🎯 Focused on What Matters

Most semantic release tools try to do everything: automatically publish releases, manage changelogs, update package versions, and more. SAVR focuses on two core needs:

- Keeping your team informed about upcoming changes through live draft releases
- Making manual releases convenient through GitHub's UI

### 🔄 Live Release Notes

Unlike tools that only generate release notes when publishing, SAVR maintains an up-to-date draft release on every push. This means:

- Your team can see what's coming in the next release at any time
- No more surprises when releases are published
- Better visibility into project progress

### 🎮 Manual Release Control

Many tools force automated releases, which can be risky. SAVR:

- Lets you control exactly when to publish releases
- Works seamlessly with GitHub's release UI
- Maintains the flexibility to review and adjust before publishing

### 💡 Built for Conventional Commits

If you're already using conventional commits, SAVR:

- Leverages your existing commit messages
- Requires no additional configuration
- Keeps your workflow simple and familiar

## Features

- 📝 **Live Draft Releases**: Automatically updates draft releases with the latest changes on every push
- 🔍 **Transparent Changes**: Team members can easily see what features and fixes will be in the next release
- 🎯 **Manual Release Control**: Publish releases when you're ready through GitHub's UI
- 🔄 **Conventional Commits**: Leverages your existing commit messages to generate meaningful release notes
- 🏷️ **Semantic Versioning**: Automatically suggests the next version based on commit types
- 🧪 **Dry-run Mode**: Test changes without affecting your repository

## Usage

```yaml
name: Draft Release
on:
  push:
    branches:
      - main

permissions:
  contents: write

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
- **Important:** When a new draft release is created, all previous SAVR-managed draft releases are automatically deleted. Only the latest draft release is kept. Manually created draft releases are not affected

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
