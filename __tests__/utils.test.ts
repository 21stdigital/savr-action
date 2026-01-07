import { describe, expect, it } from 'vitest'

import { sanitizeLogOutput } from '../src/utils/index.js'

describe('utils', () => {
  describe('sanitizeLogOutput', () => {
    it('should escape workflow command patterns', () => {
      const input = '::set-output name=foo::bar'
      const output = sanitizeLogOutput(input)

      // Should not contain unescaped ::
      expect(output).not.toBe(input)
      expect(output).toContain('\u200B') // Zero-width space
    })

    it('should escape ::error:: commands', () => {
      const input = '::error::This is a fake error'
      const output = sanitizeLogOutput(input)

      expect(output).not.toContain('::error::')
      expect(output).toContain(':\u200B:error:\u200B:')
    })

    it('should escape ::warning:: commands', () => {
      const input = '::warning::This is a fake warning'
      const output = sanitizeLogOutput(input)

      expect(output).not.toContain('::warning::')
    })

    it('should escape ::notice:: commands', () => {
      const input = '::notice::This is a fake notice'
      const output = sanitizeLogOutput(input)

      expect(output).not.toContain('::notice::')
    })

    it('should escape ::add-mask:: commands', () => {
      const input = '::add-mask::secret-value'
      const output = sanitizeLogOutput(input)

      expect(output).not.toContain('::add-mask::')
    })

    it('should escape ::group:: and ::endgroup:: commands', () => {
      const input = '::group::My Group\nsome content\n::endgroup::'
      const output = sanitizeLogOutput(input)

      expect(output).not.toContain('::group::')
      expect(output).not.toContain('::endgroup::')
    })

    it('should handle commit messages with workflow commands', () => {
      const input = 'feat: ::set-output name=version::1.0.0'
      const output = sanitizeLogOutput(input)

      expect(output).not.toContain('::set-output')
      expect(output).toContain('feat:')
    })

    it('should handle multiple :: occurrences', () => {
      const input = '::error::first::second::third'
      const output = sanitizeLogOutput(input)

      // All :: should be escaped
      expect(output.match(/::/g)).toBeNull()
    })

    it('should preserve single colons', () => {
      const input = 'feat: add new feature'
      const output = sanitizeLogOutput(input)

      // Single colons should be preserved
      expect(output).toBe('feat: add new feature')
    })

    it('should handle empty strings', () => {
      const input = ''
      const output = sanitizeLogOutput(input)

      expect(output).toBe('')
    })

    it('should handle strings without any colons', () => {
      const input = 'Just a normal message without colons'
      const output = sanitizeLogOutput(input)

      expect(output).toBe(input)
    })

    it('should handle release notes with potential command injection', () => {
      const releaseNotes = `
### Features
- feat: ::notice::Check out this feature
- feat(api): add new endpoint

### Fixes
- fix: ::error::This looks like an error
`
      const output = sanitizeLogOutput(releaseNotes)

      expect(output).not.toContain('::notice::')
      expect(output).not.toContain('::error::')
      expect(output).toContain('Features')
      expect(output).toContain('Fixes')
    })

    it('should handle multiline content with workflow commands', () => {
      const input = `Line 1
::error::Fake error on line 2
Line 3
::warning::Fake warning on line 4`
      const output = sanitizeLogOutput(input)

      expect(output).not.toContain('::error::')
      expect(output).not.toContain('::warning::')
      expect(output).toContain('Line 1')
      expect(output).toContain('Line 3')
    })

    it('should escape debug command attempts', () => {
      const input = '::debug::This is a debug message injection'
      const output = sanitizeLogOutput(input)

      expect(output).not.toContain('::debug::')
    })
  })
})
