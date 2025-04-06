import { debug, error, info } from '@actions/core'
import Handlebars from 'handlebars'

import { CategorizedCommits } from '../commits/index.js'

export interface ReleaseNotesData extends CategorizedCommits {
  version: string
}

const DEFAULT_TEMPLATE = `
### Features
{{#each features}}
- {{this.message}}
{{/each}}

### Fixes
{{#each fixes}}
- {{this.message}}
{{/each}}

### Breaking Changes
{{#each breaking}}
- {{this.message}}
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
