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
  })
})
