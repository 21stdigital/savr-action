import { getBooleanInput, getInput, setOutput } from '@actions/core'
import { getOctokit } from '@actions/github'
import type { Mock } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { categorizeCommits, determineVersionBump } from '../src/commits.js'
import { createOrUpdateRelease, getAnnotatedTag, getCommits, getGitRef, getTags } from '../src/github.js'
import { run } from '../src/main.js'
import { compileReleaseNotes } from '../src/templates.js'
import { getLatestVersion, incrementVersion } from '../src/version.js'

const mockGithubContext = vi.hoisted(() => ({
  ref: 'refs/heads/main',
  repo: {
    owner: 'owner',
    repo: 'repo'
  }
}))

vi.mock('@actions/core')
vi.mock('@actions/github', () => ({
  context: mockGithubContext,
  getOctokit: vi.fn()
}))
vi.mock('../src/github.js')
vi.mock('../src/commits.js')
vi.mock('../src/version.js')
vi.mock('../src/templates.js')

describe('main', () => {
  interface GitRefData {
    object: {
      sha: string
      type?: string
    }
  }

  interface AnnotatedTagData {
    object: {
      sha: string
      type: string
    }
  }

  const baseInputs = {
    'github-token': 'token',
    'tag-prefix': 'v',
    'release-branch': 'main',
    'release-notes-template': '',
    'initial-version': '0.1.0'
  } as const

  const setInputs = (overrides: Record<string, string> = {}) => {
    const inputs: Record<string, string> = { ...baseInputs, ...overrides }
    ;(getInput as Mock).mockImplementation((name: string) => inputs[name])
  }

  const setupInitialReleaseFlow = () => {
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
  }

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
    mockGithubContext.ref = 'refs/heads/main'
    setInputs()
    ;(getBooleanInput as Mock).mockReturnValue(false)
    ;(getOctokit as Mock).mockReturnValue(mockOctokit)
    ;(getLatestVersion as Mock).mockReturnValue(undefined)
    ;(determineVersionBump as Mock).mockReturnValue(null)
    ;(getGitRef as Mock).mockImplementation(async (_context: unknown, ref: string): Promise<GitRefData> => {
      const response = (await mockOctokit.rest.git.getRef({
        owner: 'owner',
        repo: 'repo',
        ref
      })) as { data: GitRefData }
      return response.data
    })
    ;(getAnnotatedTag as Mock).mockImplementation(
      async (_context: unknown, tagSha: string): Promise<AnnotatedTagData> => {
        const response = (await mockOctokit.rest.git.getTag({
          owner: 'owner',
          repo: 'repo',
          tag_sha: tagSha
        })) as { data: AnnotatedTagData }
        return response.data
      }
    )
  })

  describe('run', () => {
    it('should create initial release when no tags exist', async () => {
      setupInitialReleaseFlow()

      await run()

      expect(getGitRef).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', octokit: mockOctokit }, 'heads/main')
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
      expect(setOutput).toHaveBeenCalledWith('dry-run', 'false')
    })

    it('should skip when release-branch does not match triggering branch', async () => {
      mockGithubContext.ref = 'refs/heads/develop'

      await run()

      expect(getTags).not.toHaveBeenCalled()
      expect(mockOctokit.rest.git.getRef).not.toHaveBeenCalled()
      expect(getCommits).not.toHaveBeenCalled()
      expect(createOrUpdateRelease).not.toHaveBeenCalled()
      expect(setOutput).not.toHaveBeenCalled()
    })

    it('should skip when workflow is triggered by non-branch ref', async () => {
      mockGithubContext.ref = 'refs/tags/v1.0.0'

      await run()

      expect(getTags).not.toHaveBeenCalled()
      expect(mockOctokit.rest.git.getRef).not.toHaveBeenCalled()
      expect(getCommits).not.toHaveBeenCalled()
      expect(createOrUpdateRelease).not.toHaveBeenCalled()
      expect(setOutput).not.toHaveBeenCalled()
    })

    it('should normalize branch refs before validation and ref lookup', async () => {
      setInputs({ 'release-branch': 'refs/heads/main' })
      setupInitialReleaseFlow()

      await run()

      expect(mockOctokit.rest.git.getRef).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', ref: 'heads/main' })
      expect(createOrUpdateRelease).toHaveBeenCalledTimes(1)
    })

    it('should support release branches with slashes', async () => {
      setInputs({ 'release-branch': 'release/1.0' })
      mockGithubContext.ref = 'refs/heads/release/1.0'
      setupInitialReleaseFlow()

      await run()

      expect(mockOctokit.rest.git.getRef).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        ref: 'heads/release/1.0'
      })
      expect(createOrUpdateRelease).toHaveBeenCalledTimes(1)
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

      expect(getGitRef).toHaveBeenNthCalledWith(
        1,
        { owner: 'owner', repo: 'repo', octokit: mockOctokit },
        'tags/v1.0.0'
      )
      expect(getGitRef).toHaveBeenNthCalledWith(2, { owner: 'owner', repo: 'repo', octokit: mockOctokit }, 'heads/main')
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
      expect(setOutput).toHaveBeenCalledWith('dry-run', 'false')
    })

    it('should handle dry run mode with no existing tags', async () => {
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
      expect(setOutput).toHaveBeenCalledWith('dry-run', 'true')
    })

    it('should handle dry run mode with existing tags', async () => {
      ;(getBooleanInput as Mock).mockReturnValue(true)
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

      await run()

      expect(createOrUpdateRelease).not.toHaveBeenCalled()
      expect(setOutput).toHaveBeenCalledWith('skipped', 'true')
      expect(setOutput).toHaveBeenCalledWith('release-url', '')
      expect(setOutput).toHaveBeenCalledWith('release-id', '')
      expect(setOutput).toHaveBeenCalledWith('version', '1.1.0')
      expect(setOutput).toHaveBeenCalledWith('tag', 'v1.1.0')
      expect(setOutput).toHaveBeenCalledWith('dry-run', 'true')
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
      expect(setOutput).toHaveBeenCalledWith('dry-run', 'false')
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

      expect(getGitRef).toHaveBeenNthCalledWith(
        1,
        { owner: 'owner', repo: 'repo', octokit: mockOctokit },
        'tags/v1.0.0'
      )
      expect(getGitRef).toHaveBeenNthCalledWith(2, { owner: 'owner', repo: 'repo', octokit: mockOctokit }, 'heads/main')
      expect(getAnnotatedTag).toHaveBeenCalledWith(
        { owner: 'owner', repo: 'repo', octokit: mockOctokit },
        'tag-object-sha'
      )
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
      expect(setOutput).toHaveBeenCalledWith('dry-run', 'false')
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
      expect(setOutput).toHaveBeenCalledWith('dry-run', 'false')
    })

    it('should throw for invalid initial-version', async () => {
      setInputs({ 'initial-version': 'not-valid' })

      await expect(run()).rejects.toThrow('Invalid initial version')
    })

    it('should throw when tag-prefix exceeds 20 characters', async () => {
      setInputs({ 'tag-prefix': 'a-very-long-prefix-that-exceeds' })

      await expect(run()).rejects.toThrow('tag-prefix must be at most 20 characters')
    })

    it('should throw when tag-prefix contains invalid characters', async () => {
      setInputs({ 'tag-prefix': 'v@#!' })

      await expect(run()).rejects.toThrow('tag-prefix contains invalid characters')
    })

    it('should throw when release-branch is empty', async () => {
      setInputs({ 'release-branch': '   ' })

      await expect(run()).rejects.toThrow('release-branch must not be empty')
    })
  })
})
