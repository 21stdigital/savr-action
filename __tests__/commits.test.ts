import { describe, expect, it } from 'vitest'

import { categorizeCommits, determineVersionBump, parseCommit } from '../src/commits/index.js'

describe('commits', () => {
  describe('parseCommit', () => {
    it('should parse conventional commit messages', () => {
      const commit = parseCommit('feat: add new feature')
      expect(commit).toEqual({
        type: 'feat',
        subject: 'add new feature',
        message: 'feat: add new feature',
        breaking: false
      })
    })

    it('should parse commit messages with scope', () => {
      const commit = parseCommit('fix(api): fix endpoint')
      expect(commit).toEqual({
        type: 'fix',
        scope: 'api',
        subject: 'fix endpoint',
        message: 'fix(api): fix endpoint',
        breaking: false
      })
    })

    it('should detect breaking changes', () => {
      const commit = parseCommit('feat!: breaking change')
      expect(commit).toEqual({
        type: 'feat',
        subject: 'breaking change',
        message: 'feat!: breaking change',
        breaking: true
      })
    })

    it('should handle non-conventional commit messages', () => {
      const commit = parseCommit('random commit message')
      expect(commit).toEqual({
        type: 'chore',
        subject: 'random commit message',
        message: 'random commit message',
        breaking: false
      })
    })

    it('should handle commit messages with body', () => {
      const commit = parseCommit('feat: add new feature\n\nThis is a detailed description of the feature.')
      expect(commit).toEqual({
        type: 'feat',
        subject: 'add new feature',
        message: 'feat: add new feature',
        breaking: false
      })
    })

    it('should handle commit messages with multiple scopes', () => {
      const commit = parseCommit('feat(api,ui): add new feature')
      expect(commit).toEqual({
        type: 'feat',
        scope: 'api,ui',
        subject: 'add new feature',
        message: 'feat(api,ui): add new feature',
        breaking: false
      })
    })

    it('should handle commit messages with breaking change in body', () => {
      const commit = parseCommit('feat: add new feature\n\nBREAKING CHANGE: This is a breaking change')
      expect(commit).toEqual({
        type: 'feat',
        subject: 'add new feature',
        message: 'feat: add new feature',
        breaking: true
      })
    })

    it('should ignore conventional commit patterns in body text', () => {
      const commit = parseCommit(
        'feat: support multiple languages\n\n* feat: enhance authentication flow\n* fix: update locale type'
      )
      expect(commit).toEqual({
        type: 'feat',
        subject: 'support multiple languages',
        message: 'feat: support multiple languages',
        breaking: false
      })
    })
  })

  describe('categorizeCommits', () => {
    it('should categorize commits by type', () => {
      const commits = [
        parseCommit('feat: new feature'),
        parseCommit('fix: bug fix'),
        parseCommit('feat!: breaking change')
      ]

      const categorized = categorizeCommits(commits)
      expect(categorized.features).toHaveLength(2)
      expect(categorized.fixes).toHaveLength(1)
      expect(categorized.breaking).toHaveLength(1)
    })

    it('should handle empty commit list', () => {
      const categorized = categorizeCommits([])
      expect(categorized.features).toHaveLength(0)
      expect(categorized.fixes).toHaveLength(0)
      expect(categorized.breaking).toHaveLength(0)
    })

    it('should handle commits with multiple breaking changes', () => {
      const commits = [parseCommit('feat!: breaking change 1'), parseCommit('fix!: breaking change 2')]

      const categorized = categorizeCommits(commits)
      expect(categorized.breaking).toHaveLength(2)
    })

    it('should handle commits with mixed types', () => {
      const commits = [
        parseCommit('feat: new feature'),
        parseCommit('fix: bug fix'),
        parseCommit('chore: update dependencies'),
        parseCommit('docs: update readme'),
        parseCommit('style: format code'),
        parseCommit('refactor: improve code structure'),
        parseCommit('test: add tests'),
        parseCommit('perf: improve performance')
      ]

      const categorized = categorizeCommits(commits)
      expect(categorized.features).toHaveLength(1)
      expect(categorized.fixes).toHaveLength(1)
      expect(categorized.breaking).toHaveLength(0)
    })
  })

  describe('determineVersionBump', () => {
    it('should return major for breaking changes', () => {
      const categorized = {
        features: [],
        fixes: [],
        breaking: [{ type: 'feat', subject: 'breaking change', message: 'feat!: breaking change', breaking: true }]
      }
      expect(determineVersionBump(categorized)).toBe('major')
    })

    it('should return minor for features', () => {
      const categorized = {
        features: [{ type: 'feat', subject: 'new feature', message: 'feat: new feature', breaking: false }],
        fixes: [],
        breaking: []
      }
      expect(determineVersionBump(categorized)).toBe('minor')
    })

    it('should return patch for fixes', () => {
      const categorized = {
        features: [],
        fixes: [{ type: 'fix', subject: 'bug fix', message: 'fix: bug fix', breaking: false }],
        breaking: []
      }
      expect(determineVersionBump(categorized)).toBe('patch')
    })

    it('should return null when no changes', () => {
      const categorized = {
        features: [],
        fixes: [],
        breaking: []
      }
      expect(determineVersionBump(categorized)).toBeUndefined()
    })

    it('should prioritize major over minor and patch', () => {
      const categorized = {
        features: [{ type: 'feat', subject: 'new feature', message: 'feat: new feature', breaking: false }],
        fixes: [{ type: 'fix', subject: 'bug fix', message: 'fix: bug fix', breaking: false }],
        breaking: [{ type: 'feat', subject: 'breaking change', message: 'feat!: breaking change', breaking: true }]
      }
      expect(determineVersionBump(categorized)).toBe('major')
    })

    it('should prioritize minor over patch', () => {
      const categorized = {
        features: [{ type: 'feat', subject: 'new feature', message: 'feat: new feature', breaking: false }],
        fixes: [{ type: 'fix', subject: 'bug fix', message: 'fix: bug fix', breaking: false }],
        breaking: []
      }
      expect(determineVersionBump(categorized)).toBe('minor')
    })
  })
})
