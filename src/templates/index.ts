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
  const compiledTemplate = Handlebars.compile(template || DEFAULT_TEMPLATE)
  return compiledTemplate(data)
}
