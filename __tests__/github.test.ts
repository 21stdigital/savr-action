import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createOrUpdateRelease, deleteRelease, type GitHubContext } from '../src/github/index.js'

describe('github', () => {
  const mockOctokit = {
    rest: {
      repos: {
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
        body: 'Release notes',
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
            html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.0.0'
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
        body: 'Updated release notes',
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
            html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.0.1'
          },
          {
            id: 2,
            tag_name: 'v1.0.0',
            draft: false,
            html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.0.0'
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
        body: 'Release notes',
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
            html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.0.1'
          },
          {
            id: 2,
            tag_name: 'v1.0.2',
            draft: true,
            html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.0.2'
          },
          {
            id: 3,
            tag_name: 'v1.0.0',
            draft: false,
            html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.0.0'
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
            html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.0.1'
          },
          {
            id: 2,
            tag_name: 'v1.1.0',
            draft: true,
            html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.1.0'
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
  })
})
