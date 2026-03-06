import { beforeEach, describe, expect, it, vi } from 'vitest'
import { warning } from '@actions/core'

import {
  createOrUpdateRelease,
  deleteRelease,
  getCommits,
  getTags,
  type GitHubContext,
  SAVR_MARKER,
  withGitHubApiRetry
} from '../src/github.js'

vi.mock('@actions/core', () => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn()
}))

describe('github', () => {
  const mockOctokit = {
    rest: {
      repos: {
        listTags: vi.fn(),
        listCommits: vi.fn(),
        listReleases: vi.fn(),
        createRelease: vi.fn(),
        updateRelease: vi.fn(),
        deleteRelease: vi.fn()
      }
    }
  }

  const githubContext: GitHubContext = {
    owner: 'test-owner',
    repo: 'test-repo',
    octokit: mockOctokit as unknown as ReturnType<typeof import('@actions/github').getOctokit>
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('deleteRelease', () => {
    it('should delete a release by ID', async () => {
      mockOctokit.rest.repos.deleteRelease.mockResolvedValue({ data: {} })

      await deleteRelease(githubContext, 123)

      expect(mockOctokit.rest.repos.deleteRelease).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        release_id: 123
      })
    })
  })

  describe('createOrUpdateRelease', () => {
    it('retries listReleases on transient 5xx errors', async () => {
      const serviceUnavailable = Object.assign(new Error('Service Unavailable'), {
        status: 503,
        response: { headers: { 'retry-after': '0' } }
      })
      mockOctokit.rest.repos.listReleases.mockRejectedValueOnce(serviceUnavailable).mockResolvedValueOnce({ data: [] })
      mockOctokit.rest.repos.createRelease.mockResolvedValue({
        data: {
          id: 1,
          html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.0.0',
          tag_name: 'v1.0.0'
        }
      })

      const result = await createOrUpdateRelease(githubContext, 'v1.0.0', '1.0.0', 'Release notes')

      expect(mockOctokit.rest.repos.listReleases).toHaveBeenCalledTimes(2)
      expect(result.tagName).toBe('v1.0.0')
    })

    it('should create a new draft release when none exists', async () => {
      mockOctokit.rest.repos.listReleases.mockResolvedValue({ data: [] })
      mockOctokit.rest.repos.createRelease.mockResolvedValue({
        data: {
          id: 1,
          html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.0.0',
          tag_name: 'v1.0.0'
        }
      })

      const result = await createOrUpdateRelease(githubContext, 'v1.0.0', '1.0.0', 'Release notes')

      expect(mockOctokit.rest.repos.createRelease).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        tag_name: 'v1.0.0',
        name: '1.0.0',
        body: `Release notes\n${SAVR_MARKER}`,
        draft: true
      })
      expect(result).toEqual({
        id: 1,
        url: 'https://github.com/test-owner/test-repo/releases/tag/v1.0.0',
        tagName: 'v1.0.0'
      })
    })

    it('should update an existing draft release with the same tag', async () => {
      mockOctokit.rest.repos.listReleases.mockResolvedValue({
        data: [
          {
            id: 1,
            tag_name: 'v1.0.0',
            draft: true,
            html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.0.0',
            body: `Release notes\n${SAVR_MARKER}`
          }
        ]
      })
      mockOctokit.rest.repos.updateRelease.mockResolvedValue({
        data: {
          id: 1,
          html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.0.0',
          tag_name: 'v1.0.0'
        }
      })

      const result = await createOrUpdateRelease(githubContext, 'v1.0.0', '1.0.0', 'Updated release notes')

      expect(mockOctokit.rest.repos.updateRelease).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        tag_name: 'v1.0.0',
        name: '1.0.0',
        body: `Updated release notes\n${SAVR_MARKER}`,
        draft: true,
        release_id: 1
      })
      expect(mockOctokit.rest.repos.deleteRelease).not.toHaveBeenCalled()
      expect(result.id).toBe(1)
    })

    it('should delete old draft releases when creating a new version', async () => {
      mockOctokit.rest.repos.listReleases.mockResolvedValue({
        data: [
          {
            id: 1,
            tag_name: 'v1.0.1',
            draft: true,
            html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.0.1',
            body: `Release notes\n${SAVR_MARKER}`
          },
          {
            id: 2,
            tag_name: 'v1.0.0',
            draft: false,
            html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.0.0',
            body: 'Release notes'
          }
        ]
      })
      mockOctokit.rest.repos.createRelease.mockResolvedValue({
        data: {
          id: 3,
          html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.1.0',
          tag_name: 'v1.1.0'
        }
      })
      mockOctokit.rest.repos.deleteRelease.mockResolvedValue({ data: {} })

      const result = await createOrUpdateRelease(githubContext, 'v1.1.0', '1.1.0', 'Release notes')

      expect(mockOctokit.rest.repos.createRelease).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        tag_name: 'v1.1.0',
        name: '1.1.0',
        body: `Release notes\n${SAVR_MARKER}`,
        draft: true
      })
      // Should delete the old draft (v1.0.1) but not the published release (v1.0.0)
      expect(mockOctokit.rest.repos.deleteRelease).toHaveBeenCalledTimes(1)
      expect(mockOctokit.rest.repos.deleteRelease).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        release_id: 1
      })
      expect(result.id).toBe(3)
    })

    it('should delete multiple old draft releases when creating a new version', async () => {
      mockOctokit.rest.repos.listReleases.mockResolvedValue({
        data: [
          {
            id: 1,
            tag_name: 'v1.0.1',
            draft: true,
            html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.0.1',
            body: `Release notes\n${SAVR_MARKER}`
          },
          {
            id: 2,
            tag_name: 'v1.0.2',
            draft: true,
            html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.0.2',
            body: `Release notes\n${SAVR_MARKER}`
          },
          {
            id: 3,
            tag_name: 'v1.0.0',
            draft: false,
            html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.0.0',
            body: 'Release notes'
          }
        ]
      })
      mockOctokit.rest.repos.createRelease.mockResolvedValue({
        data: {
          id: 4,
          html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.1.0',
          tag_name: 'v1.1.0'
        }
      })
      mockOctokit.rest.repos.deleteRelease.mockResolvedValue({ data: {} })

      await createOrUpdateRelease(githubContext, 'v1.1.0', '1.1.0', 'Release notes')

      // Should delete both old drafts (v1.0.1 and v1.0.2)
      expect(mockOctokit.rest.repos.deleteRelease).toHaveBeenCalledTimes(2)
      expect(mockOctokit.rest.repos.deleteRelease).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        release_id: 1
      })
      expect(mockOctokit.rest.repos.deleteRelease).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        release_id: 2
      })
    })

    it('should not delete the current draft when updating it', async () => {
      mockOctokit.rest.repos.listReleases.mockResolvedValue({
        data: [
          {
            id: 1,
            tag_name: 'v1.0.1',
            draft: true,
            html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.0.1',
            body: `Release notes\n${SAVR_MARKER}`
          },
          {
            id: 2,
            tag_name: 'v1.1.0',
            draft: true,
            html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.1.0',
            body: `Updated release notes\n${SAVR_MARKER}`
          }
        ]
      })
      mockOctokit.rest.repos.updateRelease.mockResolvedValue({
        data: {
          id: 2,
          html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.1.0',
          tag_name: 'v1.1.0'
        }
      })
      mockOctokit.rest.repos.deleteRelease.mockResolvedValue({ data: {} })

      await createOrUpdateRelease(githubContext, 'v1.1.0', '1.1.0', 'Updated release notes')

      // Should delete only the old draft (v1.0.1), not the current one being updated (v1.1.0)
      expect(mockOctokit.rest.repos.deleteRelease).toHaveBeenCalledTimes(1)
      expect(mockOctokit.rest.repos.deleteRelease).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        release_id: 1
      })
    })

    it('should set target_commitish when provided for release creation', async () => {
      mockOctokit.rest.repos.listReleases.mockResolvedValue({ data: [] })
      mockOctokit.rest.repos.createRelease.mockResolvedValue({
        data: {
          id: 1,
          html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.0.0',
          tag_name: 'v1.0.0'
        }
      })

      await createOrUpdateRelease(githubContext, 'v1.0.0', '1.0.0', 'Release notes', 'release-branch-sha')

      expect(mockOctokit.rest.repos.createRelease).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        tag_name: 'v1.0.0',
        name: '1.0.0',
        body: `Release notes\n${SAVR_MARKER}`,
        draft: true,
        target_commitish: 'release-branch-sha'
      })
    })

    it('should set target_commitish when provided for release update', async () => {
      mockOctokit.rest.repos.listReleases.mockResolvedValue({
        data: [
          {
            id: 1,
            tag_name: 'v1.0.0',
            draft: true,
            html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.0.0',
            body: `Release notes\n${SAVR_MARKER}`
          }
        ]
      })
      mockOctokit.rest.repos.updateRelease.mockResolvedValue({
        data: {
          id: 1,
          html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.0.0',
          tag_name: 'v1.0.0'
        }
      })

      await createOrUpdateRelease(githubContext, 'v1.0.0', '1.0.0', 'Updated release notes', 'release-branch-sha')

      expect(mockOctokit.rest.repos.updateRelease).toHaveBeenCalledWith(
        expect.objectContaining({ target_commitish: 'release-branch-sha', release_id: 1 })
      )
    })

    it('should paginate releases when finding existing drafts', async () => {
      const pageOneReleases = Array.from({ length: 100 }, (_, index) => {
        const releaseNumber = String(index + 1)

        return {
          id: index + 1,
          tag_name: `v0.${releaseNumber}.0`,
          draft: false,
          html_url: `https://github.com/test-owner/test-repo/releases/tag/v0.${releaseNumber}.0`
        }
      })

      mockOctokit.rest.repos.listReleases.mockResolvedValueOnce({ data: pageOneReleases }).mockResolvedValueOnce({
        data: [
          {
            id: 101,
            tag_name: 'v1.9.9',
            draft: true,
            html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.9.9',
            body: `Release notes\n${SAVR_MARKER}`
          }
        ]
      })
      mockOctokit.rest.repos.createRelease.mockResolvedValue({
        data: {
          id: 102,
          html_url: 'https://github.com/test-owner/test-repo/releases/tag/v2.0.0',
          tag_name: 'v2.0.0'
        }
      })
      mockOctokit.rest.repos.deleteRelease.mockResolvedValue({ data: {} })

      await createOrUpdateRelease(githubContext, 'v2.0.0', '2.0.0', 'Release notes')

      expect(mockOctokit.rest.repos.listReleases).toHaveBeenCalledTimes(2)
      expect(mockOctokit.rest.repos.listReleases).toHaveBeenNthCalledWith(1, {
        owner: 'test-owner',
        repo: 'test-repo',
        per_page: 100,
        page: 1
      })
      expect(mockOctokit.rest.repos.listReleases).toHaveBeenNthCalledWith(2, {
        owner: 'test-owner',
        repo: 'test-repo',
        per_page: 100,
        page: 2
      })
      expect(mockOctokit.rest.repos.deleteRelease).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        release_id: 101
      })
    })

    it('should continue pagination for cleanup even when current draft is found on page one', async () => {
      const pageOneReleases = [
        {
          id: 1,
          tag_name: 'v2.0.0',
          draft: true,
          html_url: 'https://github.com/test-owner/test-repo/releases/tag/v2.0.0',
          body: `Existing release notes\n${SAVR_MARKER}`
        },
        ...Array.from({ length: 99 }, (_, index) => {
          const releaseNumber = String(index + 1)
          return {
            id: index + 2,
            tag_name: `v0.${releaseNumber}.0`,
            draft: false,
            html_url: `https://github.com/test-owner/test-repo/releases/tag/v0.${releaseNumber}.0`
          }
        })
      ]

      mockOctokit.rest.repos.listReleases.mockResolvedValueOnce({ data: pageOneReleases }).mockResolvedValueOnce({
        data: [
          {
            id: 101,
            tag_name: 'v1.9.9',
            draft: true,
            html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.9.9',
            body: `Release notes\n${SAVR_MARKER}`
          }
        ]
      })
      mockOctokit.rest.repos.updateRelease.mockResolvedValue({
        data: {
          id: 1,
          html_url: 'https://github.com/test-owner/test-repo/releases/tag/v2.0.0',
          tag_name: 'v2.0.0'
        }
      })
      mockOctokit.rest.repos.deleteRelease.mockResolvedValue({ data: {} })

      await createOrUpdateRelease(githubContext, 'v2.0.0', '2.0.0', 'Release notes')

      expect(mockOctokit.rest.repos.listReleases).toHaveBeenCalledTimes(2)
      expect(mockOctokit.rest.repos.updateRelease).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'test-owner',
          repo: 'test-repo',
          release_id: 1,
          tag_name: 'v2.0.0',
          name: '2.0.0',
          body: `Release notes\n${SAVR_MARKER}`,
          draft: true
        })
      )
      expect(mockOctokit.rest.repos.deleteRelease).toHaveBeenCalledTimes(1)
      expect(mockOctokit.rest.repos.deleteRelease).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        release_id: 101
      })
    })

    it('should keep the first matching draft when duplicate tag drafts appear across pages', async () => {
      const pageOneReleases = [
        {
          id: 10,
          tag_name: 'v2.0.0',
          draft: true,
          html_url: 'https://github.com/test-owner/test-repo/releases/tag/v2.0.0',
          body: `Newest duplicate draft\n${SAVR_MARKER}`
        },
        ...Array.from({ length: 99 }, (_, index) => {
          const releaseNumber = String(index + 1)
          return {
            id: index + 11,
            tag_name: `v0.${releaseNumber}.0`,
            draft: false,
            html_url: `https://github.com/test-owner/test-repo/releases/tag/v0.${releaseNumber}.0`
          }
        })
      ]

      mockOctokit.rest.repos.listReleases.mockResolvedValueOnce({ data: pageOneReleases }).mockResolvedValueOnce({
        data: [
          {
            id: 110,
            tag_name: 'v2.0.0',
            draft: true,
            html_url: 'https://github.com/test-owner/test-repo/releases/tag/v2.0.0',
            body: `Older duplicate draft\n${SAVR_MARKER}`
          },
          {
            id: 111,
            tag_name: 'v1.9.9',
            draft: true,
            html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.9.9',
            body: `Release notes\n${SAVR_MARKER}`
          }
        ]
      })
      mockOctokit.rest.repos.updateRelease.mockResolvedValue({
        data: {
          id: 10,
          html_url: 'https://github.com/test-owner/test-repo/releases/tag/v2.0.0',
          tag_name: 'v2.0.0'
        }
      })
      mockOctokit.rest.repos.deleteRelease.mockResolvedValue({ data: {} })

      await createOrUpdateRelease(githubContext, 'v2.0.0', '2.0.0', 'Release notes')

      expect(mockOctokit.rest.repos.listReleases).toHaveBeenCalledTimes(2)
      expect(mockOctokit.rest.repos.updateRelease).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'test-owner',
          repo: 'test-repo',
          release_id: 10
        })
      )
      expect(mockOctokit.rest.repos.updateRelease).not.toHaveBeenCalledWith(
        expect.objectContaining({
          release_id: 110
        })
      )
      expect(mockOctokit.rest.repos.deleteRelease).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        release_id: 111
      })
    })

    it('should stop pagination after scanning one full page beyond the found draft', async () => {
      const pageOneReleases = [
        {
          id: 1,
          tag_name: 'v2.0.0',
          draft: true,
          html_url: 'https://github.com/test-owner/test-repo/releases/tag/v2.0.0',
          body: `Existing release notes\n${SAVR_MARKER}`
        },
        ...Array.from({ length: 99 }, (_, index) => {
          const releaseNumber = String(index + 1)
          return {
            id: index + 2,
            tag_name: `v0.${releaseNumber}.0`,
            draft: false,
            html_url: `https://github.com/test-owner/test-repo/releases/tag/v0.${releaseNumber}.0`
          }
        })
      ]

      const pageTwoReleases = Array.from({ length: 100 }, (_, index) => {
        const releaseNumber = String(index + 101)
        return {
          id: index + 101,
          tag_name: `v0.${releaseNumber}.0`,
          draft: false,
          html_url: `https://github.com/test-owner/test-repo/releases/tag/v0.${releaseNumber}.0`
        }
      })

      mockOctokit.rest.repos.listReleases.mockResolvedValueOnce({ data: pageOneReleases }).mockResolvedValueOnce({
        data: pageTwoReleases
      })
      mockOctokit.rest.repos.updateRelease.mockResolvedValue({
        data: {
          id: 1,
          html_url: 'https://github.com/test-owner/test-repo/releases/tag/v2.0.0',
          tag_name: 'v2.0.0'
        }
      })

      await createOrUpdateRelease(githubContext, 'v2.0.0', '2.0.0', 'Release notes')

      expect(mockOctokit.rest.repos.listReleases).toHaveBeenCalledTimes(2)
      expect(mockOctokit.rest.repos.listReleases).toHaveBeenNthCalledWith(1, {
        owner: 'test-owner',
        repo: 'test-repo',
        per_page: 100,
        page: 1
      })
      expect(mockOctokit.rest.repos.listReleases).toHaveBeenNthCalledWith(2, {
        owner: 'test-owner',
        repo: 'test-repo',
        per_page: 100,
        page: 2
      })
      expect(mockOctokit.rest.repos.updateRelease).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'test-owner',
          repo: 'test-repo',
          release_id: 1
        })
      )
      expect(mockOctokit.rest.repos.deleteRelease).not.toHaveBeenCalled()
    })

    it('should not delete non-SAVR draft releases during cleanup', async () => {
      mockOctokit.rest.repos.listReleases.mockResolvedValue({
        data: [
          {
            id: 1,
            tag_name: 'v1.0.1',
            draft: true,
            html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.0.1',
            body: 'Manually created draft release'
          },
          {
            id: 2,
            tag_name: 'v0.9.0',
            draft: true,
            html_url: 'https://github.com/test-owner/test-repo/releases/tag/v0.9.0',
            body: `Release notes\n${SAVR_MARKER}`
          }
        ]
      })
      mockOctokit.rest.repos.createRelease.mockResolvedValue({
        data: {
          id: 3,
          html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.1.0',
          tag_name: 'v1.1.0'
        }
      })
      mockOctokit.rest.repos.deleteRelease.mockResolvedValue({ data: {} })

      await createOrUpdateRelease(githubContext, 'v1.1.0', '1.1.0', 'Release notes')

      // Should only delete the SAVR-managed draft (v0.9.0), not the manually created one (v1.0.1)
      expect(mockOctokit.rest.repos.deleteRelease).toHaveBeenCalledTimes(1)
      expect(mockOctokit.rest.repos.deleteRelease).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        release_id: 2
      })
    })

    it('should ignore 404 errors when deleting old drafts concurrently', async () => {
      mockOctokit.rest.repos.listReleases.mockResolvedValue({
        data: [
          {
            id: 1,
            tag_name: 'v1.0.1',
            draft: true,
            html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.0.1',
            body: `Release notes\n${SAVR_MARKER}`
          }
        ]
      })
      mockOctokit.rest.repos.createRelease.mockResolvedValue({
        data: {
          id: 2,
          html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.1.0',
          tag_name: 'v1.1.0'
        }
      })
      const notFoundError = Object.assign(new Error('Not Found'), { status: 404 })
      mockOctokit.rest.repos.deleteRelease.mockRejectedValue(notFoundError)

      await expect(createOrUpdateRelease(githubContext, 'v1.1.0', '1.1.0', 'Release notes')).resolves.toEqual({
        id: 2,
        url: 'https://github.com/test-owner/test-repo/releases/tag/v1.1.0',
        tagName: 'v1.1.0'
      })
      expect(mockOctokit.rest.repos.deleteRelease).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        release_id: 1
      })
    })
  })

  describe('getCommits', () => {
    it('retries commit fetches on rate limit responses', async () => {
      const rateLimitError = Object.assign(new Error('Too Many Requests'), {
        status: 429,
        response: { headers: { 'retry-after': '0' } }
      })

      mockOctokit.rest.repos.listCommits.mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce({
        data: [
          { sha: 'head-1', commit: { message: 'feat: first change' } },
          { sha: 'tag-sha', commit: { message: 'chore: tagged release' } }
        ]
      })

      const commits = await getCommits(githubContext, 'head-1', 'tag-sha')

      expect(mockOctokit.rest.repos.listCommits).toHaveBeenCalledTimes(2)
      expect(commits).toHaveLength(1)
      expect(commits[0]).toMatchObject({ type: 'feat', subject: 'first change' })
    })

    it('should include commits up to but excluding sinceTag commit', async () => {
      mockOctokit.rest.repos.listCommits.mockResolvedValue({
        data: [
          { sha: 'head-1', commit: { message: 'feat: first change' } },
          { sha: 'head-2', commit: { message: 'fix: second change' } },
          { sha: 'tag-sha', commit: { message: 'chore: tagged release' } }
        ]
      })

      const commits = await getCommits(githubContext, 'head-1', 'tag-sha')

      expect(commits).toHaveLength(2)
      expect(commits[0]).toMatchObject({ type: 'feat', subject: 'first change' })
      expect(commits[1]).toMatchObject({ type: 'fix', subject: 'second change' })
    })

    it('should throw when sinceTag commit is not reachable from head history', async () => {
      mockOctokit.rest.repos.listCommits.mockResolvedValue({
        data: [
          { sha: 'head-1', commit: { message: 'feat: first change' } },
          { sha: 'head-2', commit: { message: 'fix: second change' } }
        ]
      })

      await expect(getCommits(githubContext, 'head-1', 'missing-tag-sha')).rejects.toThrow(
        'Unable to find target tag commit missing-tag-sha in history for head head-1'
      )
    })

    it('uses bounded retries and rethrows after retry limit is reached', async () => {
      const transientFailure = Object.assign(new Error('Gateway Timeout'), {
        status: 504,
        response: { headers: { 'retry-after': '0' } }
      })
      mockOctokit.rest.repos.listCommits.mockRejectedValue(transientFailure)

      await expect(getCommits(githubContext, 'head-1')).rejects.toThrow('Gateway Timeout')
      expect(mockOctokit.rest.repos.listCommits).toHaveBeenCalledTimes(4)
    })
  })

  describe('withGitHubApiRetry', () => {
    it.each([401, 403])('does not retry status %i without retry-after header', async status => {
      const request = vi.fn<() => Promise<string>>().mockRejectedValueOnce(
        Object.assign(new Error(`HTTP ${String(status)}`), {
          status
        })
      )

      await expect(withGitHubApiRetry('test.nonRetryable', request)).rejects.toThrow(`HTTP ${String(status)}`)
      expect(request).toHaveBeenCalledTimes(1)
    })

    it('retries status 403 when retry-after header is present', async () => {
      const request = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(
          Object.assign(new Error('secondary rate limit'), {
            status: 403,
            response: { headers: { 'retry-after': '0' } }
          })
        )
        .mockResolvedValueOnce('ok')

      await expect(withGitHubApiRetry('test.secondaryRateLimit', request)).resolves.toBe('ok')
      expect(request).toHaveBeenCalledTimes(2)
      expect(warning).toHaveBeenCalledWith(expect.stringContaining('status 403'))
    })

    it('uses HTTP-date retry-after delays and emits operation/status warning', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout')
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(1)

      const request = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(
          Object.assign(new Error('rate limited'), {
            status: 429,
            response: { headers: { 'retry-after': 'Thu, 01 Jan 2026 00:00:02 GMT' } }
          })
        )
        .mockResolvedValueOnce('ok')

      const promise = withGitHubApiRetry('repos.listTags', request)
      await vi.advanceTimersByTimeAsync(2000)
      await expect(promise).resolves.toBe('ok')

      expect(request).toHaveBeenCalledTimes(2)
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000)
      expect(warning).toHaveBeenCalledWith(expect.stringContaining('repos.listTags'))
      expect(warning).toHaveBeenCalledWith(expect.stringContaining('status 429'))

      randomSpy.mockRestore()
      setTimeoutSpy.mockRestore()
      vi.useRealTimers()
    })

    it('uses x-ratelimit-reset delays for rate-limit responses', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout')
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(1)

      const request = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(
          Object.assign(new Error('rate limited'), {
            status: 429,
            response: {
              headers: { 'x-ratelimit-reset': String(Math.floor(Date.parse('2026-01-01T00:01:30.000Z') / 1000)) }
            }
          })
        )
        .mockResolvedValueOnce('ok')

      const promise = withGitHubApiRetry('repos.listCommits', request)
      await vi.advanceTimersByTimeAsync(90_000)
      await expect(promise).resolves.toBe('ok')

      expect(request).toHaveBeenCalledTimes(2)
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 90_000)
      expect(Number(setTimeoutSpy.mock.calls[0]?.[1])).toBeGreaterThan(10_000)

      randomSpy.mockRestore()
      setTimeoutSpy.mockRestore()
      vi.useRealTimers()
    })

    it('retries network failures with retryable error codes', async () => {
      vi.useFakeTimers()
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout')
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(1)

      const request = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(
          Object.assign(new Error('network failed'), {
            code: 'ECONNRESET'
          })
        )
        .mockResolvedValueOnce('ok')

      const promise = withGitHubApiRetry('test.network', request)
      await vi.advanceTimersByTimeAsync(500)
      await expect(promise).resolves.toBe('ok')
      expect(request).toHaveBeenCalledTimes(2)
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 500)

      randomSpy.mockRestore()
      setTimeoutSpy.mockRestore()
      vi.useRealTimers()
    })
  })

  describe('getTags', () => {
    it('should aggregate tags across two pages', async () => {
      const firstPageTags = Array.from({ length: 100 }, (_, index) => ({ name: `v1.0.${String(index + 1)}` }))
      const secondPageTags = [{ name: 'v1.1.0' }, { name: 'v1.1.1' }]

      mockOctokit.rest.repos.listTags.mockResolvedValueOnce({ data: firstPageTags }).mockResolvedValueOnce({
        data: secondPageTags
      })

      const tags = await getTags(githubContext)

      expect(mockOctokit.rest.repos.listTags).toHaveBeenCalledTimes(2)
      expect(mockOctokit.rest.repos.listTags).toHaveBeenNthCalledWith(1, {
        owner: 'test-owner',
        repo: 'test-repo',
        per_page: 100,
        page: 1
      })
      expect(mockOctokit.rest.repos.listTags).toHaveBeenNthCalledWith(2, {
        owner: 'test-owner',
        repo: 'test-repo',
        per_page: 100,
        page: 2
      })
      expect(tags).toHaveLength(102)
      expect(tags[0]).toEqual({ name: 'v1.0.1', version: 'v1.0.1' })
      expect(tags[101]).toEqual({ name: 'v1.1.1', version: 'v1.1.1' })
    })

    it('should handle an empty second page after a full first page', async () => {
      const firstPageTags = Array.from({ length: 100 }, (_, index) => ({ name: `v2.0.${String(index + 1)}` }))

      mockOctokit.rest.repos.listTags.mockResolvedValueOnce({ data: firstPageTags }).mockResolvedValueOnce({ data: [] })

      const tags = await getTags(githubContext)

      expect(mockOctokit.rest.repos.listTags).toHaveBeenCalledTimes(2)
      expect(mockOctokit.rest.repos.listTags).toHaveBeenNthCalledWith(1, {
        owner: 'test-owner',
        repo: 'test-repo',
        per_page: 100,
        page: 1
      })
      expect(mockOctokit.rest.repos.listTags).toHaveBeenNthCalledWith(2, {
        owner: 'test-owner',
        repo: 'test-repo',
        per_page: 100,
        page: 2
      })
      expect(tags).toHaveLength(100)
      expect(tags[99]).toEqual({ name: 'v2.0.100', version: 'v2.0.100' })
    })

    it('should stop after one page when exactly 100 tags exist', async () => {
      const firstPageTags = Array.from({ length: 100 }, (_, index) => ({ name: `v3.0.${String(index + 1)}` }))

      mockOctokit.rest.repos.listTags.mockResolvedValueOnce({ data: firstPageTags }).mockResolvedValueOnce({ data: [] })

      const tags = await getTags(githubContext)

      expect(mockOctokit.rest.repos.listTags).toHaveBeenCalledTimes(2)
      expect(mockOctokit.rest.repos.listTags).toHaveBeenNthCalledWith(1, {
        owner: 'test-owner',
        repo: 'test-repo',
        per_page: 100,
        page: 1
      })
      expect(mockOctokit.rest.repos.listTags).toHaveBeenNthCalledWith(2, {
        owner: 'test-owner',
        repo: 'test-repo',
        per_page: 100,
        page: 2
      })
      expect(tags).toHaveLength(100)
      expect(tags[0]).toEqual({ name: 'v3.0.1', version: 'v3.0.1' })
      expect(tags[99]).toEqual({ name: 'v3.0.100', version: 'v3.0.100' })
    })

    it('should fetch 101 tags across two pages', async () => {
      const firstPageTags = Array.from({ length: 100 }, (_, index) => ({ name: `v4.0.${String(index + 1)}` }))
      const secondPageTags = [{ name: 'v4.0.101' }]

      mockOctokit.rest.repos.listTags.mockResolvedValueOnce({ data: firstPageTags }).mockResolvedValueOnce({
        data: secondPageTags
      })

      const tags = await getTags(githubContext)

      expect(mockOctokit.rest.repos.listTags).toHaveBeenCalledTimes(2)
      expect(mockOctokit.rest.repos.listTags).toHaveBeenNthCalledWith(1, {
        owner: 'test-owner',
        repo: 'test-repo',
        per_page: 100,
        page: 1
      })
      expect(mockOctokit.rest.repos.listTags).toHaveBeenNthCalledWith(2, {
        owner: 'test-owner',
        repo: 'test-repo',
        per_page: 100,
        page: 2
      })
      expect(tags).toHaveLength(101)
      expect(tags[100]).toEqual({ name: 'v4.0.101', version: 'v4.0.101' })
    })
  })
})
