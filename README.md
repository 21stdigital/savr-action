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

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0

      - name: Create Release Draft
        uses: 21stdigital/savr-action@v1.0.1
        with:
          github-token: ${{ secrets.PAT_TOKEN }} # Personal Access Token with repo scope
          # Optional configuration:
          # tag-prefix: 'v'
          # dry-run: false
          # release-notes-template: |
          #   ## Release {{version}}
          #   {{#each commits}}
          #   - {{this.message}} ({{this.type}})
          #   {{/each}}
```

## Inputs

| Input                    | Description                                                                                                                                                 | Required | Default          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------- |
| `github-token`           | Personal Access Token (PAT) with `repo` scope for GitHub API authentication. The default `GITHUB_TOKEN` has insufficient permissions for creating releases. | Yes      | -                |
| `tag-prefix`             | The prefix for version tags                                                                                                                                 | No       | `v`              |
| `release-branch`         | The branch to use for the release                                                                                                                           | No       | `main`           |
| `dry-run`                | Simulate the process without creating releases                                                                                                              | No       | `false`          |
| `release-notes-template` | Template for release notes formatting                                                                                                                       | No       | Default template |
| `initial-version`        | The initial version to start from                                                                                                                           | No       | `1.0.0`          |

## Outputs

| Output        | Description                                  |
| ------------- | -------------------------------------------- |
| `version`     | The calculated version for the release       |
| `release-url` | The URL of the created/updated draft release |
| `release-id`  | The ID of the created/updated draft release  |

## Version Bump Rules

The action follows these rules to determine version bumps:

- **Major** (`1.0.0`): Breaking changes (`feat!` or `BREAKING CHANGE` in footer)
- **Minor** (`0.1.0`): New features (`feat`)
- **Patch** (`0.0.1`): Bug fixes (`fix`)
- **None**: Other changes (no version bump)

## Release Notes

Release notes are automatically generated and include:

- ✨ Features
- 🐛 Bug fixes
- 💥 Breaking changes
- Contributors list

The default template format is:

```handlebars
{{#if features}}
  ### ✨ Features
  {{#each features}}
    -
    {{this.message}}
  {{/each}}
{{/if}}

{{#if fixes}}
  ### 🐛 Fixes
  {{#each fixes}}
    -
    {{this.message}}
  {{/each}}
{{/if}}

{{#if breaking}}
  ### 💥 Breaking Changes
  {{#each breaking}}
    -
    {{this.message}}
  {{/each}}
{{/if}}
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
