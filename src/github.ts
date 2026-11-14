import { debug, info, warning } from '@actions/core'
import { getOctokit } from '@actions/github'

import { Commit, parseCommit } from './commits.js'
import type { DraftContent, ReleaseStore, StoredDraft, WrittenDraft } from './drafts.js'
import { Tag } from './version.js'

export const SAVR_MARKER = '<!-- savr-managed-release -->'

const MAX_GITHUB_API_RETRIES = 3
const INITIAL_RETRY_DELAY_MS = 500
const MAX_RETRY_DELAY_MS = 10_000
const MAX_RATE_LIMIT_DELAY_MS = 120_000

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504])
const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EAI_AGAIN',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT'
])

export interface GitHubContext {
  owner: string
  repo: string
  octokit: ReturnType<typeof getOctokit>
}

type RetryableGitHubError = Error & {
  status?: number
  code?: string
  response?: {
    headers?: Record<string, string | number | undefined>
  }
}

const getHeaderValue = (
  headers: Record<string, string | number | undefined> | undefined,
  key: string
): string | undefined => (headers?.[key] != null ? String(headers[key]) : undefined)

const applyJitter = (delayMs: number): number => {
  if (delayMs <= 0) {
    return 0
  }

  // Full jitter distributes retries across the full delay window.
  return Math.round(Math.random() * delayMs)
}

const getRetryDelayMs = (attempt: number, err: RetryableGitHubError): number => {
  const headers = err.response?.headers
  const retryAfter = getHeaderValue(headers, 'retry-after')
  if (retryAfter != null) {
    const retryAfterSeconds = Number.parseFloat(retryAfter)
    if (!Number.isNaN(retryAfterSeconds) && retryAfterSeconds >= 0) {
      return Math.min(applyJitter(Math.round(retryAfterSeconds * 1000)), MAX_RATE_LIMIT_DELAY_MS)
    }

    const retryAfterDateMs = Date.parse(retryAfter)
    if (!Number.isNaN(retryAfterDateMs)) {
      return Math.min(applyJitter(Math.max(0, retryAfterDateMs - Date.now())), MAX_RATE_LIMIT_DELAY_MS)
    }
  }

  if (err.status === 429) {
    const rateLimitReset = getHeaderValue(headers, 'x-ratelimit-reset')
    if (rateLimitReset != null) {
      const resetSeconds = Number.parseInt(rateLimitReset, 10)
      if (!Number.isNaN(resetSeconds) && resetSeconds >= 0) {
        return Math.min(applyJitter(Math.max(0, resetSeconds * 1000 - Date.now())), MAX_RATE_LIMIT_DELAY_MS)
      }
    }
  }

  const exponentialDelay = INITIAL_RETRY_DELAY_MS * 2 ** (attempt - 1)
  return Math.min(applyJitter(exponentialDelay), MAX_RETRY_DELAY_MS)
}

const isRetryableError = (err: RetryableGitHubError): boolean => {
  if (err.status != null && RETRYABLE_STATUS_CODES.has(err.status)) {
    return true
  }

  // GitHub secondary rate limits can return 403 with Retry-After.
  if (err.status === 403) {
    const retryAfter = getHeaderValue(err.response?.headers, 'retry-after')
    if (retryAfter != null) {
      const retryAfterSeconds = Number.parseFloat(retryAfter)
      if (!Number.isNaN(retryAfterSeconds) && retryAfterSeconds >= 0) {
        return true
      }

      const retryAfterDateMs = Date.parse(retryAfter)
      if (!Number.isNaN(retryAfterDateMs)) {
        return true
      }
    }
  }

  if (err.code != null && RETRYABLE_NETWORK_CODES.has(err.code)) {
    return true
  }

  return false
}

export const withGitHubApiRetry = async <T>(operation: string, request: () => Promise<T>): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await request()
    } catch (rawErr) {
      const err = rawErr as RetryableGitHubError

      if (!isRetryableError(err) || attempt >= MAX_GITHUB_API_RETRIES) {
        throw rawErr
      }

      const retryAttempt = attempt + 1
      const delayMs = getRetryDelayMs(retryAttempt, err)
      warning(
        `GitHub API request failed during ${operation} with ${
          err.status != null ? `status ${String(err.status)}` : (err.code ?? 'unknown error')
        }; retrying in ${String(delayMs)}ms (${String(retryAttempt)}/${String(MAX_GITHUB_API_RETRIES)})`
      )

      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
}

export const getGitRef = async (
  context: GitHubContext,
  ref: string
): Promise<{ object: { sha: string; type?: string } }> => {
  const { data } = await withGitHubApiRetry(`git.getRef(${ref})`, () =>
    context.octokit.rest.git.getRef({
      owner: context.owner,
      repo: context.repo,
      ref
    })
  )

  return data
}

export const getAnnotatedTag = async (
  context: GitHubContext,
  tagSha: string
): Promise<{ object: { sha: string; type: string } }> => {
  const { data } = await withGitHubApiRetry(`git.getTag(${tagSha})`, () =>
    context.octokit.rest.git.getTag({
      owner: context.owner,
      repo: context.repo,
      tag_sha: tagSha
    })
  )

  return data
}

export const getTags = async (context: GitHubContext): Promise<Tag[]> => {
  debug(`Fetching tags for repository ${context.owner}/${context.repo}`)

  const allTags: Tag[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    debug(`Fetching tags page ${String(page)}`)
    const { data: tags } = await withGitHubApiRetry('repos.listTags', () =>
      context.octokit.rest.repos.listTags({
        owner: context.owner,
        repo: context.repo,
        per_page: 100,
        page
      })
    )

    debug(`Found ${String(tags.length)} tags on page ${String(page)}`)
    allTags.push(
      ...tags.map(tag => ({
        name: tag.name,
        version: tag.name
      }))
    )

    hasMore = tags.length === 100
    if (hasMore) {
      page++
    }
  }

  info(`Found ${String(allTags.length)} total tags`)
  return allTags
}

export const getCommits = async (context: GitHubContext, head: string, sinceTag?: string): Promise<Commit[]> => {
  debug(`Getting commits between ${sinceTag ?? 'start'} and ${head}`)

  const commits: Commit[] = []
  let page = 1
  let hasMore = true
  let foundSinceTag = false

  while (hasMore) {
    debug(`Fetching commits page ${String(page)}`)
    const { data: pageCommits } = await withGitHubApiRetry('repos.listCommits', () =>
      context.octokit.rest.repos.listCommits({
        owner: context.owner,
        repo: context.repo,
        sha: head,
        per_page: 100,
        page
      })
    )

    debug(`Found ${String(pageCommits.length)} commits on page ${String(page)}`)
    // If we have a sinceTag, stop when we reach it
    if (sinceTag && pageCommits.some(commit => commit.sha === sinceTag)) {
      info(`Reached target tag ${sinceTag}, stopping commit fetch`)
      foundSinceTag = true
      // Only include commits up to but not including the tag's commit
      const commitsUpToTag = pageCommits.slice(
        0,
        pageCommits.findIndex(commit => commit.sha === sinceTag)
      )
      commits.push(...commitsUpToTag.map(commit => parseCommit(commit.commit.message)))
      hasMore = false
    } else {
      commits.push(...pageCommits.map(commit => parseCommit(commit.commit.message)))
      hasMore = pageCommits.length === 100
      if (hasMore) {
        page++
      }
    }
  }

  if (sinceTag && !foundSinceTag) {
    throw new Error(`Unable to find target tag commit ${sinceTag} in history for head ${head}`)
  }

  info(`Total commits retrieved: ${String(commits.length)}`)
  return commits
}

const RELEASES_PER_PAGE = 100

const listReleasesPage = async (context: GitHubContext, page: number) => {
  debug(`Fetching releases page ${String(page)}`)
  const { data } = await withGitHubApiRetry('repos.listReleases', () =>
    context.octokit.rest.repos.listReleases({
      owner: context.owner,
      repo: context.repo,
      per_page: RELEASES_PER_PAGE,
      page
    })
  )
  return data
}

const isSavrManaged = (release: { body?: string | null }): boolean => release.body?.includes(SAVR_MARKER) ?? false

const draftParams = (context: GitHubContext, content: DraftContent) => ({
  owner: context.owner,
  repo: context.repo,
  tag_name: content.tagName,
  name: content.name,
  body: `${content.notes}\n${SAVR_MARKER}`,
  draft: true,
  target_commitish: content.targetCommitish
})

const writtenDraft = (release: { id: number; html_url: string; tag_name: string }): WrittenDraft => ({
  id: release.id,
  url: release.html_url,
  tagName: release.tag_name
})

// The Octokit adapter at the release store seam. It owns how GitHub marks a
// SAVR-managed draft, paging, retries and GitHub's status codes.
export const createReleaseStore = (context: GitHubContext): ReleaseStore => ({
  listDrafts: async () => {
    const drafts: StoredDraft[] = []
    for (let page = 1; ; page++) {
      const pageReleases = await listReleasesPage(context, page)
      for (const release of pageReleases) {
        if (release.draft) {
          drafts.push({ id: release.id, tagName: release.tag_name, savrManaged: isSavrManaged(release) })
        }
      }
      if (pageReleases.length < RELEASES_PER_PAGE) {
        return drafts
      }
    }
  },
  createDraft: async content => {
    const { data } = await withGitHubApiRetry('repos.createRelease', () =>
      context.octokit.rest.repos.createRelease(draftParams(context, content))
    )
    return writtenDraft(data)
  },
  updateDraft: async (id, content) => {
    const { data } = await withGitHubApiRetry('repos.updateRelease', () =>
      context.octokit.rest.repos.updateRelease({ ...draftParams(context, content), release_id: id })
    )
    return writtenDraft(data)
  },
  deleteDraft: async id => {
    try {
      await withGitHubApiRetry('repos.deleteRelease', () =>
        context.octokit.rest.repos.deleteRelease({ owner: context.owner, repo: context.repo, release_id: id })
      )
    } catch (err) {
      // Another workflow run got there first.
      if ((err as { status?: number }).status !== 404) {
        throw err
      }
      debug(`Draft release ${String(id)} was already deleted`)
    }
  }
})
