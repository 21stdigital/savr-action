import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { compileReleaseNotes } from '../src/templates.js'

const normalizeTrailingWhitespace = (value: string): string => {
  return value
    .split('\n')
    .map(line => line.replace(/[ \t]+$/u, ''))
    .join('\n')
    .trimEnd()
}

const extractDefaultTemplateFromActionYml = (): string => {
  const actionYmlPath = fileURLToPath(new URL('../action.yml', import.meta.url))
  const actionYml = readFileSync(actionYmlPath, 'utf8')
  const lines = actionYml.split('\n')

  const releaseNotesTemplateIndex = lines.findIndex(line => /^\s{2}release-notes-template:\s*$/u.test(line))
  if (releaseNotesTemplateIndex === -1) {
    throw new Error('Could not find "release-notes-template" input in action.yml')
  }

  const defaultLineIndex = lines.findIndex(
    (line, index) => index > releaseNotesTemplateIndex && /^\s{4}default:\s*\|\s*$/u.test(line)
  )
  if (defaultLineIndex === -1) {
    throw new Error('Could not find block-scalar default template in action.yml')
  }

  const templateLines: string[] = []
  for (const line of lines.slice(defaultLineIndex + 1)) {
    if (line.length === 0) {
      templateLines.push('')
      continue
    }

    if (!line.startsWith('      ')) {
      break
    }

    templateLines.push(line.slice(6))
  }

  return templateLines.join('\n')
}

describe('templates', () => {
  describe('compileReleaseNotes', () => {
    it('should keep fallback default template output in parity with action metadata default template', () => {
      const metadataTemplate = extractDefaultTemplateFromActionYml()
      const data = {
        version: '2.1.0',
        features: [
          {
            type: 'feat',
            scope: 'checkout',
            subject: 'add inline promo code support',
            message: 'feat(checkout): add inline promo code support',
            breaking: false
          },
          { type: 'feat', subject: 'add product wishlist', message: 'feat: add product wishlist', breaking: false }
        ],
        fixes: [
          {
            type: 'fix',
            scope: 'api',
            subject: 'fix timeout retries',
            message: 'fix(api): fix timeout retries',
            breaking: false
          }
        ],
        breaking: [
          {
            type: 'feat',
            scope: 'auth',
            subject: 'remove legacy session endpoints',
            message: 'feat(auth)!: remove legacy session endpoints',
            breaking: true
          }
        ]
      }

      const fallbackOutput = compileReleaseNotes('{{#if', data)
      const metadataOutput = compileReleaseNotes(metadataTemplate, data)

      expect(normalizeTrailingWhitespace(fallbackOutput)).toBe(normalizeTrailingWhitespace(metadataOutput))
    })

    it('should use default template when no template is provided', () => {
      const data = {
        version: '1.0.0',
        features: [{ type: 'feat', subject: 'new feature', message: 'feat: new feature', breaking: false }],
        fixes: [{ type: 'fix', subject: 'bug fix', message: 'fix: bug fix', breaking: false }],
        breaking: [{ type: 'feat', subject: 'breaking change', message: 'feat!: breaking change', breaking: true }]
      }

      const notes = compileReleaseNotes('', data)
      expect(notes).toContain('### ✨ Features')
      expect(notes).toContain('### 🐛 Fixes')
      expect(notes).toContain('### 💥 Breaking Changes')
      expect(notes).toContain('#### General')
      expect(notes).toContain('new feature')
      expect(notes).toContain('bug fix')
      expect(notes).toContain('breaking change')
      expect(notes).not.toContain('feat:')
      expect(notes).not.toContain('fix:')
    })

    it('should use custom template when provided', () => {
      const template = `
# Release {{version}}

## New Features
{{#each features}}
- {{this.subject}}
{{/each}}

## Bug Fixes
{{#each fixes}}
- {{this.subject}}
{{/each}}

## Breaking Changes
{{#each breaking}}
- {{this.subject}}
{{/each}}
`
      const data = {
        version: '1.0.0',
        features: [{ type: 'feat', subject: 'new feature', message: 'feat: new feature', breaking: false }],
        fixes: [{ type: 'fix', subject: 'bug fix', message: 'fix: bug fix', breaking: false }],
        breaking: [{ type: 'feat', subject: 'breaking change', message: 'feat!: breaking change', breaking: true }]
      }

      const notes = compileReleaseNotes(template, data)
      expect(notes).toContain('# Release 1.0.0')
      expect(notes).toContain('## New Features')
      expect(notes).toContain('## Bug Fixes')
      expect(notes).toContain('## Breaking Changes')
      expect(notes).toContain('new feature')
      expect(notes).toContain('bug fix')
      expect(notes).toContain('breaking change')
      expect(notes).not.toContain('feat:')
      expect(notes).not.toContain('fix:')
    })

    it('should handle empty sections', () => {
      const data = {
        version: '1.0.0',
        features: [],
        fixes: [],
        breaking: []
      }

      const notes = compileReleaseNotes('', data)
      expect(notes).not.toContain('### ✨ Features')
      expect(notes).not.toContain('### 🐛 Fixes')
      expect(notes).not.toContain('### 💥 Breaking Changes')
    })

    it('should handle custom template with conditional sections', () => {
      const template = `
# Release {{version}}

{{#if features}}
## New Features
{{#each features}}
- {{this.subject}}
{{/each}}
{{/if}}

{{#if fixes}}
## Bug Fixes
{{#each fixes}}
- {{this.subject}}
{{/each}}
{{/if}}

{{#if breaking}}
## Breaking Changes
{{#each breaking}}
- {{this.subject}}
{{/each}}
{{/if}}
`
      const data = {
        version: '1.0.0',
        features: [{ type: 'feat', subject: 'new feature', message: 'feat: new feature', breaking: false }],
        fixes: [],
        breaking: [{ type: 'feat', subject: 'breaking change', message: 'feat!: breaking change', breaking: true }]
      }

      const notes = compileReleaseNotes(template, data)
      expect(notes).toContain('# Release 1.0.0')
      expect(notes).toContain('## New Features')
      expect(notes).not.toContain('## Bug Fixes')
      expect(notes).toContain('## Breaking Changes')
      expect(notes).toContain('new feature')
      expect(notes).not.toContain('fix:')
      expect(notes).toContain('breaking change')
    })

    it('should handle custom template with commit details', () => {
      const template = `
# Release {{version}}

{{#if features}}
## New Features
{{#each features}}
- {{this.subject}}
  - Type: {{this.type}}
  - Breaking: {{this.breaking}}
{{/each}}
{{/if}}
`
      const data = {
        version: '1.0.0',
        features: [{ type: 'feat', subject: 'new feature', message: 'feat: new feature', breaking: false }],
        fixes: [],
        breaking: []
      }

      const notes = compileReleaseNotes(template, data)
      expect(notes).toContain('# Release 1.0.0')
      expect(notes).toContain('## New Features')
      expect(notes).toContain('new feature')
      expect(notes).toContain('Type: feat')
      expect(notes).toContain('Breaking: false')
    })

    it('should expose commit body for custom templates without changing subject/message behavior', () => {
      const template = `
# Release {{version}}
{{#each features}}
- subject={{this.subject}} message={{this.message}} body={{this.body}}
{{/each}}
`
      const data = {
        version: '1.0.0',
        features: [
          {
            type: 'feat',
            subject: 'new feature',
            message: 'feat: new feature',
            body: 'Details for release notes.',
            breaking: false
          }
        ],
        fixes: [],
        breaking: []
      }

      const notes = compileReleaseNotes(template, data)
      expect(notes).toContain('subject=new feature')
      expect(notes).toContain('message=feat: new feature')
      expect(notes).toContain('body=Details for release notes.')
    })

    it('should fall back to default template when custom template is malformed', () => {
      const template = `
# Release {{version}}

{{#if features}}
## New Features
{{#each features}}
- {{this.message}}
{{/each}}
{{/if}
`
      const data = {
        version: '1.0.0',
        features: [],
        fixes: [],
        breaking: []
      }

      const notes = compileReleaseNotes(template, data)
      expect(notes).not.toContain('### ✨ Features')
      expect(notes).not.toContain('### 🐛 Fixes')
      expect(notes).not.toContain('### 💥 Breaking Changes')
      expect(notes).not.toContain('# Release 1.0.0')
    })
    it('should handle template with nested properties', () => {
      const template = `
# Release {{version}}

{{#if features}}
## New Features
{{#each features}}
- {{this.subject}}
  {{#if this.scope}}
  Scope: {{this.scope}}
  {{/if}}
{{/each}}
{{/if}}
`
      const data = {
        version: '1.0.0',
        features: [
          { type: 'feat', scope: 'api', subject: 'new feature', message: 'feat(api): new feature', breaking: false },
          { type: 'feat', subject: 'another feature', message: 'feat: another feature', breaking: false }
        ],
        fixes: [],
        breaking: []
      }

      const notes = compileReleaseNotes(template, data)
      expect(notes).toContain('# Release 1.0.0')
      expect(notes).toContain('## New Features')
      expect(notes).toContain('new feature')
      expect(notes).toContain('Scope: api')
      expect(notes).toContain('another feature')
      expect(notes).not.toContain('Scope: undefined')
    })

    it('should group commits by scope in default template', () => {
      const data = {
        version: '1.0.0',
        features: [
          {
            type: 'feat',
            scope: 'search',
            subject: 'implement sku search api endpoint',
            message: 'feat(search): implement sku search api endpoint',
            breaking: false
          },
          {
            type: 'feat',
            scope: 'cart',
            subject: 'implement cart functionality',
            message: 'feat(cart): implement cart functionality',
            breaking: false
          },
          {
            type: 'feat',
            scope: 'search',
            subject: 'enhance no results display',
            message: 'feat(search): enhance no results display',
            breaking: false
          },
          { type: 'feat', subject: 'image configurator', message: 'feat: image configurator', breaking: false }
        ],
        fixes: [],
        breaking: []
      }

      const notes = compileReleaseNotes('', data)
      expect(notes).toContain('### ✨ Features')
      expect(notes).toContain('#### Cart')
      expect(notes).toContain('#### Search')
      expect(notes).toContain('#### General')
      expect(notes).toContain('implement sku search api endpoint')
      expect(notes).toContain('enhance no results display')
      expect(notes).toContain('implement cart functionality')
      expect(notes).toContain('image configurator')
    })

    it('should sort scopes alphabetically with General last', () => {
      const data = {
        version: '1.0.0',
        features: [
          { type: 'feat', subject: 'no scope feature', message: 'feat: no scope feature', breaking: false },
          {
            type: 'feat',
            scope: 'zebra',
            subject: 'zebra feature',
            message: 'feat(zebra): zebra feature',
            breaking: false
          },
          {
            type: 'feat',
            scope: 'apple',
            subject: 'apple feature',
            message: 'feat(apple): apple feature',
            breaking: false
          },
          {
            type: 'feat',
            scope: 'banana',
            subject: 'banana feature',
            message: 'feat(banana): banana feature',
            breaking: false
          }
        ],
        fixes: [],
        breaking: []
      }

      const notes = compileReleaseNotes('', data)
      const appleIndex = notes.indexOf('#### Apple')
      const bananaIndex = notes.indexOf('#### Banana')
      const zebraIndex = notes.indexOf('#### Zebra')
      const generalIndex = notes.indexOf('#### General')

      expect(appleIndex).toBeGreaterThan(-1)
      expect(bananaIndex).toBeGreaterThan(-1)
      expect(zebraIndex).toBeGreaterThan(-1)
      expect(generalIndex).toBeGreaterThan(-1)

      // Check alphabetical order
      expect(appleIndex).toBeLessThan(bananaIndex)
      expect(bananaIndex).toBeLessThan(zebraIndex)
      // General should be last
      expect(zebraIndex).toBeLessThan(generalIndex)
    })

    it('should use groupByScope helper in custom template', () => {
      const template = `
# Release {{version}}

{{#if features}}
## New Features
{{#each (groupByScope features)}}
### {{this.scope}}
{{#each this.commits}}
- {{this.subject}}
{{/each}}
{{/each}}
{{/if}}
`
      const data = {
        version: '1.0.0',
        features: [
          {
            type: 'feat',
            scope: 'api',
            subject: 'add new endpoint',
            message: 'feat(api): add new endpoint',
            breaking: false
          },
          {
            type: 'feat',
            scope: 'api',
            subject: 'improve error handling',
            message: 'feat(api): improve error handling',
            breaking: false
          },
          {
            type: 'feat',
            scope: 'ui',
            subject: 'update button styles',
            message: 'feat(ui): update button styles',
            breaking: false
          }
        ],
        fixes: [],
        breaking: []
      }

      const notes = compileReleaseNotes(template, data)
      expect(notes).toContain('# Release 1.0.0')
      expect(notes).toContain('## New Features')
      expect(notes).toContain('### Api')
      expect(notes).toContain('### Ui')
      expect(notes).toContain('add new endpoint')
      expect(notes).toContain('improve error handling')
      expect(notes).toContain('update button styles')
    })

    it('should handle scope grouping with fixes and breaking changes', () => {
      const data = {
        version: '2.0.0',
        features: [
          {
            type: 'feat',
            scope: 'auth',
            subject: 'add oauth support',
            message: 'feat(auth): add oauth support',
            breaking: false
          }
        ],
        fixes: [
          {
            type: 'fix',
            scope: 'auth',
            subject: 'fix login redirect',
            message: 'fix(auth): fix login redirect',
            breaking: false
          },
          { type: 'fix', subject: 'fix memory leak', message: 'fix: fix memory leak', breaking: false }
        ],
        breaking: [
          {
            type: 'feat',
            scope: 'api',
            subject: 'remove deprecated endpoints',
            message: 'feat(api)!: remove deprecated endpoints',
            breaking: true
          }
        ]
      }

      const notes = compileReleaseNotes('', data)
      expect(notes).toContain('### ✨ Features')
      expect(notes).toContain('#### Auth')
      expect(notes).toContain('add oauth support')
      expect(notes).toContain('### 🐛 Fixes')
      expect(notes).toContain('fix login redirect')
      expect(notes).toContain('fix memory leak')
      expect(notes).toContain('### 💥 Breaking Changes')
      expect(notes).toContain('#### Api')
      expect(notes).toContain('remove deprecated endpoints')
    })

    it('should use default template when template is only whitespace', () => {
      const data = {
        version: '1.0.0',
        features: [{ type: 'feat', subject: 'new feature', message: 'feat: new feature', breaking: false }],
        fixes: [],
        breaking: []
      }

      const notes = compileReleaseNotes('   \n  \t  ', data)
      // Should use default template, not empty template
      expect(notes).toContain('### ✨ Features')
      expect(notes).toContain('#### General')
      expect(notes).toContain('new feature')
      expect(notes).not.toContain('### 🐛 Fixes')
      expect(notes).not.toContain('### 💥 Breaking Changes')
    })

    it('should handle empty string template by using default', () => {
      const data = {
        version: '1.0.0',
        features: [{ type: 'feat', subject: 'new feature', message: 'feat: new feature', breaking: false }],
        fixes: [],
        breaking: []
      }

      const notes = compileReleaseNotes('', data)
      // Empty string should trigger default template
      expect(notes).toContain('### ✨ Features')
      expect(notes).toContain('new feature')
    })
  })
})
