import { debug, error, info } from '@actions/core'
import Handlebars from 'handlebars'

import { CategorizedCommits, Commit } from '../commits/index.js'

export interface ReleaseNotesData extends CategorizedCommits {
  version: string
}

interface GroupedCommits {
  scope: string
  commits: Commit[]
}

// Convert scope to title case (e.g., "main-navigation" -> "Main Navigation")
const toTitleCase = (scope: string): string => {
  return scope
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

// Register Handlebars helper to group commits by scope
Handlebars.registerHelper('groupByScope', (commits: Commit[]): GroupedCommits[] => {
  const grouped = new Map<string, Commit[]>()

  // Group commits by scope
  for (const commit of commits) {
    const scope = toTitleCase(commit.scope ?? 'General')
    if (!grouped.has(scope)) {
      grouped.set(scope, [])
    }
    const scopeCommits = grouped.get(scope)
    if (scopeCommits) {
      scopeCommits.push(commit)
    }
  }

  // Convert to array and sort: General last, others alphabetically
  const result: GroupedCommits[] = []
  const sortedScopes = Array.from(grouped.keys()).sort((a, b) => {
    if (a === 'General') return 1
    if (b === 'General') return -1
    return a.localeCompare(b)
  })

  for (const scope of sortedScopes) {
    const commits = grouped.get(scope)
    if (commits) {
      result.push({ scope, commits })
    }
  }

  return result
})

const DEFAULT_TEMPLATE = `
### Features
{{#each (groupByScope features)}}
#### {{this.scope}}
{{#each this.commits}}
- {{this.subject}}
{{/each}}

{{/each}}
### Fixes
{{#each (groupByScope fixes)}}
#### {{this.scope}}
{{#each this.commits}}
- {{this.subject}}
{{/each}}

{{/each}}
### Breaking Changes
{{#each (groupByScope breaking)}}
#### {{this.scope}}
{{#each this.commits}}
- {{this.subject}}
{{/each}}

{{/each}}
`

export const compileReleaseNotes = (template: string, data: ReleaseNotesData): string => {
  debug(`Compiling release notes for version ${data.version}`)
  debug(`Template statistics:
    - Features: ${String(data.features.length)}
    - Fixes: ${String(data.fixes.length)}
    - Breaking changes: ${String(data.breaking.length)}`)

  try {
    const compiledTemplate = Handlebars.compile(template || DEFAULT_TEMPLATE)
    const releaseNotes = compiledTemplate(data)

    info('Release notes compiled successfully')
    return releaseNotes
  } catch (err) {
    error(`Failed to compile release notes: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  }
}
