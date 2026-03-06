import { getBooleanInput, getInput, setOutput } from '@actions/core'
import { getOctokit } from '@actions/github'
import type { Mock } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { categorizeCommits, determineVersionBump } from '../src/commits.js'
import { createOrUpdateRelease, getCommits, getTags } from '../src/github.js'
import { run } from '../src/main.js'
import { compileReleaseNotes } from '../src/templates.js'
import { getLatestVersion, incrementVersion } from '../src/version.js'

vi.mock('@actions/core')
vi.mock('@actions/github', () => ({
  context: {
    repo: {
      owner: 'owner',
      repo: 'repo'
    }
  },
  getOctokit: vi.fn()
}))
vi.mock('../src/github.js')
vi.mock('../src/commits.js')
vi.mock('../src/version.js')
vi.mock('../src/templates.js')

describe('main', () => {
  const mockOctokit = {
    rest: {
      git: {
        getRef: vi.fn(),
        getTag: vi.fn()
      }
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(getInput as Mock).mockImplementation((name: string) => {
      switch (name) {
        case 'github-token':
          return 'token'
        case 'tag-prefix':
          return 'v'
        case 'release-branch':
          return 'main'
        case 'release-notes-template':
          return ''
        case 'initial-version':
          return '0.1.0'
        default:
          return ''
      }
    })
    ;(getBooleanInput as Mock).mockReturnValue(false)
    ;(getOctokit as Mock).mockReturnValue(mockOctokit)
    ;(getLatestVersion as Mock).mockReturnValue(undefined)
    ;(determineVersionBump as Mock).mockReturnValue(null)
  })

  describe('run', () => {
    it('should create initial release when no tags exist', async () => {
      ;(getTags as Mock).mockResolvedValue([])
      mockOctokit.rest.git.getRef.mockResolvedValue({ data: { object: { sha: 'head-sha' } } })
      ;(getCommits as Mock).mockResolvedValue([
        { type: 'feat', subject: 'new feature', message: 'feat: new feature', breaking: false }
      ])
      ;(categorizeCommits as Mock).mockReturnValue({
        features: [{ type: 'feat', subject: 'new feature', message: 'feat: new feature', breaking: false }],
        fixes: [],
        breaking: []
      })
      ;(compileReleaseNotes as Mock).mockReturnValue('Release notes')
      ;(createOrUpdateRelease as Mock).mockResolvedValue({
        url: 'https://github.com/owner/repo/releases/tag/v0.1.0',
        id: 123,
        tagName: 'v0.1.0'
      })

      await run()

      expect(mockOctokit.rest.git.getRef).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', ref: 'heads/main' })
      expect(getCommits).toHaveBeenCalledWith(
        { owner: 'owner', repo: 'repo', octokit: mockOctokit },
        'head-sha',
        undefined
      )
      expect(createOrUpdateRelease).toHaveBeenCalledWith(
        { owner: 'owner', repo: 'repo', octokit: mockOctokit },
        'v0.1.0',
        '0.1.0',
        'Release notes'
      )
      expect(setOutput).toHaveBeenCalledWith('release-url', 'https://github.com/owner/repo/releases/tag/v0.1.0')
      expect(setOutput).toHaveBeenCalledWith('release-id', '123')
      expect(setOutput).toHaveBeenCalledWith('version', '0.1.0')
      expect(setOutput).toHaveBeenCalledWith('tag', 'v0.1.0')
      expect(setOutput).toHaveBeenCalledWith('skipped', 'false')
    })

    it('should update release when tags exist', async () => {
      ;(getTags as Mock).mockResolvedValue([{ name: 'v1.0.0', version: '1.0.0' }])
      ;(getLatestVersion as Mock).mockReturnValue({ name: 'v1.0.0', version: '1.0.0' })
      mockOctokit.rest.git.getRef.mockImplementation(({ ref }: { ref: string }) => {
        if (ref === 'tags/v1.0.0') {
          return Promise.resolve({ data: { object: { sha: 'tag-sha' } } })
        }
        return Promise.resolve({ data: { object: { sha: 'head-sha' } } })
      })
      ;(getCommits as Mock).mockResolvedValue([
        { type: 'feat', subject: 'new feature', message: 'feat: new feature', breaking: false }
      ])
      ;(categorizeCommits as Mock).mockReturnValue({
        features: [{ type: 'feat', subject: 'new feature', message: 'feat: new feature', breaking: false }],
        fixes: [],
        breaking: []
      })
      ;(determineVersionBump as Mock).mockReturnValue('minor')
      ;(incrementVersion as Mock).mockReturnValue('1.1.0')
      ;(compileReleaseNotes as Mock).mockReturnValue('Release notes')
      ;(createOrUpdateRelease as Mock).mockResolvedValue({
        url: 'https://github.com/owner/repo/releases/tag/v1.1.0',
        id: 123,
        tagName: 'v1.1.0'
      })

      await run()

      expect(mockOctokit.rest.git.getTag).not.toHaveBeenCalled()
      expect(createOrUpdateRelease).toHaveBeenCalledWith(
        { owner: 'owner', repo: 'repo', octokit: mockOctokit },
        'v1.1.0',
        '1.1.0',
        'Release notes',
        'head-sha'
      )
      expect(setOutput).toHaveBeenCalledWith('release-url', 'https://github.com/owner/repo/releases/tag/v1.1.0')
      expect(setOutput).toHaveBeenCalledWith('release-id', '123')
      expect(setOutput).toHaveBeenCalledWith('version', '1.1.0')
      expect(setOutput).toHaveBeenCalledWith('tag', 'v1.1.0')
      expect(setOutput).toHaveBeenCalledWith('skipped', 'false')
    })

    it('should handle dry run mode', async () => {
      ;(getBooleanInput as Mock).mockReturnValue(true)
      ;(getTags as Mock).mockResolvedValue([])
      mockOctokit.rest.git.getRef.mockResolvedValue({ data: { object: { sha: 'head-sha' } } })
      ;(getCommits as Mock).mockResolvedValue([
        { type: 'feat', subject: 'new feature', message: 'feat: new feature', breaking: false }
      ])
      ;(categorizeCommits as Mock).mockReturnValue({
        features: [{ type: 'feat', subject: 'new feature', message: 'feat: new feature', breaking: false }],
        fixes: [],
        breaking: []
      })
      ;(compileReleaseNotes as Mock).mockReturnValue('Release notes')

      await run()

      expect(createOrUpdateRelease).not.toHaveBeenCalled()
      expect(setOutput).toHaveBeenCalledWith('skipped', 'true')
      expect(setOutput).toHaveBeenCalledWith('release-url', '')
      expect(setOutput).toHaveBeenCalledWith('release-id', '')
      expect(setOutput).toHaveBeenCalledWith('version', '0.1.0')
      expect(setOutput).toHaveBeenCalledWith('tag', 'v0.1.0')
    })

    it('should skip release when HEAD and tag point to same commit', async () => {
      ;(getTags as Mock).mockResolvedValue([{ name: 'v1.0.0', version: '1.0.0' }])
      ;(getLatestVersion as Mock).mockReturnValue({ name: 'v1.0.0', version: '1.0.0' })
      // Mock both refs returning the same SHA
      mockOctokit.rest.git.getRef.mockResolvedValue({
        data: { object: { sha: 'same-sha-123' } }
      })

      await run()

      // Should not process commits or create release
      expect(getCommits).not.toHaveBeenCalled()
      expect(createOrUpdateRelease).not.toHaveBeenCalled()
      expect(setOutput).toHaveBeenCalledWith('skipped', 'true')
      expect(setOutput).toHaveBeenCalledWith('release-url', '')
      expect(setOutput).toHaveBeenCalledWith('release-id', '')
      expect(setOutput).toHaveBeenCalledWith('version', '1.0.0')
      expect(setOutput).toHaveBeenCalledWith('tag', 'v1.0.0')
    })

    it('should dereference annotated tags to commit SHA for commit lookup', async () => {
      ;(getTags as Mock).mockResolvedValue([{ name: 'v1.0.0', version: '1.0.0' }])
      ;(getLatestVersion as Mock).mockReturnValue({ name: 'v1.0.0', version: '1.0.0' })
      mockOctokit.rest.git.getRef.mockImplementation(({ ref }: { ref: string }) => {
        if (ref === 'tags/v1.0.0') {
          return Promise.resolve({ data: { object: { sha: 'tag-object-sha', type: 'tag' } } })
        }
        return Promise.resolve({ data: { object: { sha: 'head-sha', type: 'commit' } } })
      })
      mockOctokit.rest.git.getTag.mockResolvedValue({
        data: {
          object: {
            sha: 'tag-commit-sha',
            type: 'commit'
          }
        }
      })
      ;(getCommits as Mock).mockResolvedValue([
        { type: 'feat', subject: 'new feature', message: 'feat: new feature', breaking: false }
      ])
      ;(categorizeCommits as Mock).mockReturnValue({
        features: [{ type: 'feat', subject: 'new feature', message: 'feat: new feature', breaking: false }],
        fixes: [],
        breaking: []
      })
      ;(determineVersionBump as Mock).mockReturnValue('minor')
      ;(incrementVersion as Mock).mockReturnValue('1.1.0')
      ;(compileReleaseNotes as Mock).mockReturnValue('Release notes')
      ;(createOrUpdateRelease as Mock).mockResolvedValue({
        url: 'https://github.com/owner/repo/releases/tag/v1.1.0',
        id: 123,
        tagName: 'v1.1.0'
      })

      await run()

      expect(mockOctokit.rest.git.getTag).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        tag_sha: 'tag-object-sha'
      })
      expect(getCommits).toHaveBeenCalledWith(
        { owner: 'owner', repo: 'repo', octokit: mockOctokit },
        'head-sha',
        'tag-commit-sha'
      )
      expect(createOrUpdateRelease).toHaveBeenCalledWith(
        { owner: 'owner', repo: 'repo', octokit: mockOctokit },
        'v1.1.0',
        '1.1.0',
        'Release notes',
        'head-sha'
      )
    })

    it('should skip release when HEAD matches dereferenced annotated tag commit', async () => {
      ;(getTags as Mock).mockResolvedValue([{ name: 'v1.0.0', version: '1.0.0' }])
      ;(getLatestVersion as Mock).mockReturnValue({ name: 'v1.0.0', version: '1.0.0' })
      mockOctokit.rest.git.getRef.mockImplementation(({ ref }: { ref: string }) => {
        if (ref === 'tags/v1.0.0') {
          return Promise.resolve({ data: { object: { sha: 'tag-object-sha', type: 'tag' } } })
        }
        return Promise.resolve({ data: { object: { sha: 'tag-commit-sha', type: 'commit' } } })
      })
      mockOctokit.rest.git.getTag.mockResolvedValue({
        data: {
          object: {
            sha: 'tag-commit-sha',
            type: 'commit'
          }
        }
      })

      await run()

      expect(mockOctokit.rest.git.getTag).toHaveBeenCalledTimes(1)
      expect(getCommits).not.toHaveBeenCalled()
      expect(createOrUpdateRelease).not.toHaveBeenCalled()
      expect(setOutput).toHaveBeenCalledWith('skipped', 'true')
      expect(setOutput).toHaveBeenCalledWith('release-url', '')
      expect(setOutput).toHaveBeenCalledWith('release-id', '')
      expect(setOutput).toHaveBeenCalledWith('version', '1.0.0')
      expect(setOutput).toHaveBeenCalledWith('tag', 'v1.0.0')
    })

    it('should skip release when no version bump is needed', async () => {
      ;(getTags as Mock).mockResolvedValue([{ name: 'v1.0.0', version: '1.0.0' }])
      ;(getLatestVersion as Mock).mockReturnValue({ name: 'v1.0.0', version: '1.0.0' })
      mockOctokit.rest.git.getRef.mockImplementation(({ ref }: { ref: string }) => {
        if (ref === 'tags/v1.0.0') {
          return Promise.resolve({ data: { object: { sha: 'tag-sha' } } })
        }
        return Promise.resolve({ data: { object: { sha: 'head-sha' } } })
      })
      ;(getCommits as Mock).mockResolvedValue([
        { type: 'chore', subject: 'deps update', message: 'chore: deps update', breaking: false }
      ])
      ;(categorizeCommits as Mock).mockReturnValue({
        features: [],
        fixes: [],
        breaking: []
      })
      ;(determineVersionBump as Mock).mockReturnValue(null)

      await run()

      expect(createOrUpdateRelease).not.toHaveBeenCalled()
      expect(setOutput).toHaveBeenCalledWith('skipped', 'true')
      expect(setOutput).toHaveBeenCalledWith('release-url', '')
      expect(setOutput).toHaveBeenCalledWith('release-id', '')
      expect(setOutput).toHaveBeenCalledWith('version', '1.0.0')
      expect(setOutput).toHaveBeenCalledWith('tag', 'v1.0.0')
    })

    it('should throw for invalid initial-version', async () => {
      ;(getInput as Mock).mockImplementation((name: string) => {
        switch (name) {
          case 'github-token':
            return 'token'
          case 'tag-prefix':
            return 'v'
          case 'release-branch':
            return 'main'
          case 'release-notes-template':
            return ''
          case 'initial-version':
            return 'not-valid'
          default:
            return ''
        }
      })

      await expect(run()).rejects.toThrow('Invalid initial version')
    })

    it('should throw when tag-prefix exceeds 20 characters', async () => {
      ;(getInput as Mock).mockImplementation((name: string) => {
        switch (name) {
          case 'github-token':
            return 'token'
          case 'tag-prefix':
            return 'a-very-long-prefix-that-exceeds'
          case 'release-branch':
            return 'main'
          case 'release-notes-template':
            return ''
          case 'initial-version':
            return '0.1.0'
          default:
            return ''
        }
      })

      await expect(run()).rejects.toThrow('tag-prefix must be at most 20 characters')
    })

    it('should throw when tag-prefix contains invalid characters', async () => {
      ;(getInput as Mock).mockImplementation((name: string) => {
        switch (name) {
          case 'github-token':
            return 'token'
          case 'tag-prefix':
            return 'v@#!'
          case 'release-branch':
            return 'main'
          case 'release-notes-template':
            return ''
          case 'initial-version':
            return '0.1.0'
          default:
            return ''
        }
      })

      await expect(run()).rejects.toThrow('tag-prefix contains invalid characters')
    })

    it('should throw when release-branch is empty', async () => {
      ;(getInput as Mock).mockImplementation((name: string) => {
        switch (name) {
          case 'github-token':
            return 'token'
          case 'tag-prefix':
            return 'v'
          case 'release-branch':
            return '   '
          case 'release-notes-template':
            return ''
          case 'initial-version':
            return '0.1.0'
          default:
            return ''
        }
      })

      await expect(run()).rejects.toThrow('release-branch must not be empty')
    })
  })
})
