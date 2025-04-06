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
  })
})
