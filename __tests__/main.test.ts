import { getBooleanInput, getInput, setOutput } from '@actions/core'
import { getOctokit } from '@actions/github'
import type { Mock } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { categorizeCommits, determineVersionBump } from '../src/commits/index.js'
import { createOrUpdateRelease, getCommits, getTags } from '../src/github/index.js'
import { run } from '../src/main.js'
import { compileReleaseNotes } from '../src/templates/index.js'
import { getLatestVersion, incrementVersion } from '../src/version/index.js'

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
vi.mock('../src/github/index.js')
vi.mock('../src/commits/index.js')
vi.mock('../src/version/index.js')
vi.mock('../src/templates/index.js')

describe('main', () => {
  const mockOctokit = {
    rest: {
      git: {
        getRef: vi.fn()
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
  })

  describe('run', () => {
    it('should create initial release when no tags exist', async () => {
      ;(getTags as Mock).mockResolvedValue([])
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

      expect(createOrUpdateRelease).toHaveBeenCalledWith(
        { owner: 'owner', repo: 'repo', octokit: mockOctokit },
        'v0.1.0',
        '0.1.0',
        'Release notes'
      )
      expect(setOutput).toHaveBeenCalledWith('release-url', 'https://github.com/owner/repo/releases/tag/v0.1.0')
      expect(setOutput).toHaveBeenCalledWith('release-id', '123')
      expect(setOutput).toHaveBeenCalledWith('version', 'v0.1.0')
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

      expect(createOrUpdateRelease).toHaveBeenCalledWith(
        { owner: 'owner', repo: 'repo', octokit: mockOctokit },
        'v1.1.0',
        '1.1.0',
        'Release notes'
      )
      expect(setOutput).toHaveBeenCalledWith('release-url', 'https://github.com/owner/repo/releases/tag/v1.1.0')
      expect(setOutput).toHaveBeenCalledWith('release-id', '123')
      expect(setOutput).toHaveBeenCalledWith('version', 'v1.1.0')
    })

    it('should handle dry run mode', async () => {
      ;(getBooleanInput as Mock).mockReturnValue(true)
      ;(getTags as Mock).mockResolvedValue([])
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
      expect(setOutput).not.toHaveBeenCalled()
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
      expect(setOutput).not.toHaveBeenCalled()
    })
  })
})
