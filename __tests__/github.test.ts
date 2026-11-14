import { warning } from '@actions/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createReleaseStore,
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

    Object.values(mockOctokit.rest.repos).forEach(mockFn => {
      mockFn.mockReset()
    })
  })

  describe('createReleaseStore', () => {
    const release = (id: number, tagName: string, overrides: Record<string, unknown> = {}) => ({
      id,
      tag_name: tagName,
      draft: true,
      html_url: `https://github.com/test-owner/test-repo/releases/tag/${tagName}`,
      body: `Release notes\n${SAVR_MARKER}`,
      ...overrides
    })

    describe('listDrafts', () => {
      it('returns the drafts from every page, newest first, telling Draft Releases from hand-made drafts by the marker', async () => {
        const fullPage = Array.from({ length: 100 }, (_, index) =>
          release(1000 - index, `v0.0.${String(index)}`, { draft: false })
        )
        fullPage[0] = release(1000, 'v2.0.0')
        mockOctokit.rest.repos.listReleases
          .mockResolvedValueOnce({ data: fullPage })
          .mockResolvedValueOnce({ data: [release(5, 'v1.0.0', { body: 'Written by hand' }), release(4, 'v0.9.0')] })

        const drafts = await createReleaseStore(githubContext).listDrafts()

        expect(drafts).toEqual([
          { id: 1000, tagName: 'v2.0.0', savrManaged: true },
          { id: 5, tagName: 'v1.0.0', savrManaged: false },
          { id: 4, tagName: 'v0.9.0', savrManaged: true }
        ])
        expect(mockOctokit.rest.repos.listReleases).toHaveBeenCalledTimes(2)
      })

      it('retries a page that fails with a transient 5xx error', async () => {
        const serviceUnavailable = Object.assign(new Error('Service Unavailable'), {
          status: 503,
          response: { headers: { 'retry-after': '0' } }
        })
        mockOctokit.rest.repos.listReleases
          .mockRejectedValueOnce(serviceUnavailable)
          .mockResolvedValueOnce({ data: [release(4, 'v0.9.0')] })

        const drafts = await createReleaseStore(githubContext).listDrafts()

        expect(drafts).toEqual([{ id: 4, tagName: 'v0.9.0', savrManaged: true }])
      })
    })

    const content = { tagName: 'v1.1.0', name: '1.1.0', notes: 'Release notes', targetCommitish: 'head-sha' }
    const params = {
      owner: 'test-owner',
      repo: 'test-repo',
      tag_name: 'v1.1.0',
      name: '1.1.0',
      body: `Release notes\n${SAVR_MARKER}`,
      draft: true,
      target_commitish: 'head-sha'
    }

    describe('createDraft', () => {
      it('creates a draft that carries the SAVR marker', async () => {
        mockOctokit.rest.repos.createRelease.mockResolvedValue({ data: release(9, 'v1.1.0') })

        const written = await createReleaseStore(githubContext).createDraft(content)

        expect(mockOctokit.rest.repos.createRelease).toHaveBeenCalledWith(params)
        expect(written).toEqual({
          id: 9,
          url: 'https://github.com/test-owner/test-repo/releases/tag/v1.1.0',
          tagName: 'v1.1.0'
        })
      })
    })

    describe('updateDraft', () => {
      it('rewrites the draft, adding the SAVR marker', async () => {
        mockOctokit.rest.repos.updateRelease.mockResolvedValue({ data: release(7, 'v1.1.0') })

        const written = await createReleaseStore(githubContext).updateDraft(7, content)

        expect(mockOctokit.rest.repos.updateRelease).toHaveBeenCalledWith({ ...params, release_id: 7 })
        expect(written.id).toBe(7)
      })
    })

    describe('deleteDraft', () => {
      it('deletes the release', async () => {
        mockOctokit.rest.repos.deleteRelease.mockResolvedValue({ data: {} })

        await createReleaseStore(githubContext).deleteDraft(3)

        expect(mockOctokit.rest.repos.deleteRelease).toHaveBeenCalledWith({
          owner: 'test-owner',
          repo: 'test-repo',
          release_id: 3
        })
      })

      it('treats a draft another workflow run already deleted as deleted', async () => {
        mockOctokit.rest.repos.deleteRelease.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }))

        await expect(createReleaseStore(githubContext).deleteDraft(3)).resolves.toBeUndefined()
      })

      it('passes on any other failure', async () => {
        mockOctokit.rest.repos.deleteRelease.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }))

        await expect(createReleaseStore(githubContext).deleteDraft(3)).rejects.toThrow('Forbidden')
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
