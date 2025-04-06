import { describe, expect, it } from 'vitest'

import { compileReleaseNotes } from '../src/templates/index.js'

describe('templates', () => {
  describe('compileReleaseNotes', () => {
    it('should use default template when no template is provided', () => {
      const data = {
        version: '1.0.0',
        features: [{ type: 'feat', subject: 'new feature', message: 'feat: new feature', breaking: false }],
        fixes: [{ type: 'fix', subject: 'bug fix', message: 'fix: bug fix', breaking: false }],
        breaking: [{ type: 'feat', subject: 'breaking change', message: 'feat!: breaking change', breaking: true }]
      }

      const notes = compileReleaseNotes('', data)
      expect(notes).toContain('### Features')
      expect(notes).toContain('### Fixes')
      expect(notes).toContain('### Breaking Changes')
      expect(notes).toContain('feat: new feature')
      expect(notes).toContain('fix: bug fix')
      expect(notes).toContain('feat!: breaking change')
    })

    it('should use custom template when provided', () => {
      const template = `
# Release {{version}}

## New Features
{{#each features}}
- {{this.message}}
{{/each}}

## Bug Fixes
{{#each fixes}}
- {{this.message}}
{{/each}}

## Breaking Changes
{{#each breaking}}
- {{this.message}}
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
      expect(notes).toContain('feat: new feature')
      expect(notes).toContain('fix: bug fix')
      expect(notes).toContain('feat!: breaking change')
    })

    it('should handle empty sections', () => {
      const data = {
        version: '1.0.0',
        features: [],
        fixes: [],
        breaking: []
      }

      const notes = compileReleaseNotes('', data)
      expect(notes).toContain('### Features')
      expect(notes).toContain('### Fixes')
      expect(notes).toContain('### Breaking Changes')
      expect(notes).not.toContain('feat:')
      expect(notes).not.toContain('fix:')
      expect(notes).not.toContain('breaking')
    })

    it('should handle custom template with conditional sections', () => {
      const template = `
# Release {{version}}

{{#if features}}
## New Features
{{#each features}}
- {{this.message}}
{{/each}}
{{/if}}

{{#if fixes}}
## Bug Fixes
{{#each fixes}}
- {{this.message}}
{{/each}}
{{/if}}

{{#if breaking}}
## Breaking Changes
{{#each breaking}}
- {{this.message}}
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
      expect(notes).toContain('feat: new feature')
      expect(notes).not.toContain('fix:')
      expect(notes).toContain('feat!: breaking change')
    })

    it('should handle custom template with commit details', () => {
      const template = `
# Release {{version}}

{{#if features}}
## New Features
{{#each features}}
- {{this.message}}
  - Type: {{this.type}}
  - Subject: {{this.subject}}
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
      expect(notes).toContain('feat: new feature')
      expect(notes).toContain('Type: feat')
      expect(notes).toContain('Subject: new feature')
      expect(notes).toContain('Breaking: false')
    })

    it('should handle malformed template gracefully', () => {
      const template = `
# Release {{version}}

{{#if features}}
## New Features
{{#each features}}
- {{this.message}}
{{/each}}
{{/if}}
`
      const data = {
        version: '1.0.0',
        features: [],
        fixes: [],
        breaking: []
      }

      const notes = compileReleaseNotes(template, data)
      expect(notes).toContain('# Release 1.0.0')
      expect(notes).not.toContain('## New Features')
    })

    it('should handle template with nested properties', () => {
      const template = `
# Release {{version}}

{{#if features}}
## New Features
{{#each features}}
- {{this.message}}
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
      expect(notes).toContain('feat(api): new feature')
      expect(notes).toContain('Scope: api')
      expect(notes).toContain('feat: another feature')
      expect(notes).not.toContain('Scope: undefined')
    })
  })
})
