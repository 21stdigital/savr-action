import { debug, error, info, warning } from '@actions/core'
import Handlebars from 'handlebars'

import { CategorizedCommits, Commit } from './commits.js'

export interface ReleaseNotesData extends CategorizedCommits {
  version: string
}

interface GroupedCommits {
  scope: string
  commits: Commit[]
}

// Register Handlebars helper to group commits by scope
Handlebars.registerHelper('groupByScope', (commits: Commit[]): GroupedCommits[] => {
  const grouped = new Map<string, Commit[]>()

  // Group commits by scope
  for (const commit of commits) {
    const scope = (commit.scope ?? 'General')
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')

    if (!grouped.has(scope)) {
      grouped.set(scope, [])
    }
    grouped.get(scope)?.push(commit)
  }

  // Convert to array and sort: General last, others alphabetically
  return Array.from(grouped.keys())
    .sort((a, b) => {
      if (a === 'General') return 1
      if (b === 'General') return -1
      return a.localeCompare(b)
    })
    .map(scope => ({ scope, commits: grouped.get(scope) ?? [] }))
})

// Keep this fallback template in sync with action.yml -> inputs.release-notes-template.default.
const DEFAULT_TEMPLATE = `{{#if features}}
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
`

export const compileReleaseNotes = (template: string, data: ReleaseNotesData): string => {
  debug(`Compiling release notes for version ${data.version}`)
  debug(`Template statistics:
    - Features: ${String(data.features.length)}
    - Fixes: ${String(data.fixes.length)}
    - Breaking changes: ${String(data.breaking.length)}`)

  const hasCustomTemplate = template && template.trim() !== ''

  if (!hasCustomTemplate) {
    const releaseNotes = Handlebars.compile(DEFAULT_TEMPLATE)(data)
    info('Release notes compiled successfully')
    return releaseNotes
  }

  try {
    const releaseNotes = Handlebars.compile(template)(data)
    info('Release notes compiled successfully')
    return releaseNotes
  } catch (err) {
    warning(
      `Invalid custom release notes template provided: ${err instanceof Error ? err.message : String(err)}. Falling back to default template.`
    )

    try {
      const releaseNotes = Handlebars.compile(DEFAULT_TEMPLATE)(data)
      info('Release notes compiled successfully with fallback default template')
      return releaseNotes
    } catch (fallbackError) {
      error(
        `Failed to compile release notes with fallback template: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`
      )
      throw fallbackError
    }
  }
}
