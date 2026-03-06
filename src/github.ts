import { debug, error, info, warning } from '@actions/core'
import { getOctokit } from '@actions/github'

import { Commit, parseCommit } from './commits.js'
import { Tag } from './version.js'

export const SAVR_MARKER = '<!-- savr-managed-release -->'

const MAX_GITHUB_API_RETRIES = 3
const INITIAL_RETRY_DELAY_MS = 500
const MAX_RETRY_DELAY_MS = 10_000
const MAX_RATE_LIMIT_DELAY_MS = 120_000
const MAX_JITTER_MS = 250

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

export interface GitHubRelease {
  id: number
  url: string
  tagName: string
}

type RetryableGitHubError = Error & {
  status?: number
  code?: string
  response?: {
    headers?: Record<string, string | number | undefined>
  }
}

const sleep = async (ms: number): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, ms))
}

const getHeaderValue = (
  headers: Record<string, string | number | undefined> | undefined,
  key: string
): string | undefined => {
  if (headers == null) {
    return undefined
  }

  const directValue = headers[key]
  if (directValue != null) {
    return String(directValue)
  }

  const lowerKey = key.toLowerCase()
  const matchedEntry = Object.entries(headers).find(([headerKey]) => headerKey.toLowerCase() === lowerKey)
  if (matchedEntry == null) {
    return undefined
  }

  return matchedEntry[1] != null ? String(matchedEntry[1]) : undefined
}

const getRetryAfterDelayMs = (
  headers: Record<string, string | number | undefined> | undefined,
  nowMs = Date.now()
): number | undefined => {
  const retryAfter = getHeaderValue(headers, 'retry-after')
  if (retryAfter == null) {
    return undefined
  }

  const retryAfterSeconds = Number.parseFloat(retryAfter)
  if (!Number.isNaN(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.round(retryAfterSeconds * 1000)
  }

  const retryAfterDateMs = Date.parse(retryAfter)
  if (!Number.isNaN(retryAfterDateMs)) {
    return Math.max(0, retryAfterDateMs - nowMs)
  }

  return undefined
}

const getRateLimitResetDelayMs = (
  headers: Record<string, string | number | undefined> | undefined,
  nowMs = Date.now()
): number | undefined => {
  const rateLimitReset = getHeaderValue(headers, 'x-ratelimit-reset')
  if (rateLimitReset == null) {
    return undefined
  }

  const resetSeconds = Number.parseInt(rateLimitReset, 10)
  if (Number.isNaN(resetSeconds) || resetSeconds < 0) {
    return undefined
  }

  return Math.max(0, resetSeconds * 1000 - nowMs)
}

const applyJitter = (delayMs: number): number => {
  if (delayMs <= 0) {
    return 0
  }

  const jitterMs = Math.round(Math.random() * Math.min(MAX_JITTER_MS, Math.ceil(delayMs * 0.2)))
  return delayMs + jitterMs
}

const getRetryDelayMs = (attempt: number, err: RetryableGitHubError): number => {
  const headers = err.response?.headers
  const retryAfterDelayMs = getRetryAfterDelayMs(headers)
  if (retryAfterDelayMs != null) {
    return Math.min(applyJitter(retryAfterDelayMs), MAX_RATE_LIMIT_DELAY_MS)
  }

  if (err.status === 429) {
    const rateLimitResetDelayMs = getRateLimitResetDelayMs(headers)
    if (rateLimitResetDelayMs != null) {
      return Math.min(applyJitter(rateLimitResetDelayMs), MAX_RATE_LIMIT_DELAY_MS)
    }
  }

  const exponentialDelay = INITIAL_RETRY_DELAY_MS * 2 ** (attempt - 1)
  return Math.min(applyJitter(exponentialDelay), MAX_RETRY_DELAY_MS)
}

const isRetryableError = (err: RetryableGitHubError): boolean => {
  if (err.status != null && RETRYABLE_STATUS_CODES.has(err.status)) {
    return true
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
          err.status != null ? `status ${String(err.status)}` : err.code ?? 'unknown error'
        }; retrying in ${String(delayMs)}ms (${String(retryAttempt)}/${String(MAX_GITHUB_API_RETRIES)})`
      )

      await sleep(delayMs)
    }
  }
}

export const getTags = async (context: GitHubContext): Promise<Tag[]> => {
  debug(`Fetching tags for repository ${context.owner}/${context.repo}`)

  const allTags: Tag[] = []
  let page = 1
  let hasMore = true

  try {
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
  } catch (err) {
    error(`Failed to fetch tags: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  }
}

export const getCommits = async (context: GitHubContext, head: string, sinceTag?: string): Promise<Commit[]> => {
  debug(`Getting commits between ${sinceTag ?? 'start'} and ${head}`)

  const commits: Commit[] = []
  let page = 1
  let hasMore = true
  let foundSinceTag = false

  try {
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
  } catch (err) {
    error(`Failed to fetch commits: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  }
}

export const deleteRelease = async (context: GitHubContext, releaseId: number): Promise<void> => {
  debug(`Deleting release with ID ${String(releaseId)}`)

  try {
    await withGitHubApiRetry('repos.deleteRelease', () =>
      context.octokit.rest.repos.deleteRelease({
        owner: context.owner,
        repo: context.repo,
        release_id: releaseId
      })
    )
    info(`Release with ID ${String(releaseId)} deleted successfully`)
  } catch (err) {
    error(`Failed to delete release: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  }
}

interface ReleaseDraftSummary {
  id: number
  tag_name: string
  body?: string | null
}

const listDraftReleasesForCreateOrUpdate = async (
  context: GitHubContext,
  tagName: string
): Promise<{ existingDraft?: ReleaseDraftSummary; staleDrafts: ReleaseDraftSummary[] }> => {
  let existingDraft: ReleaseDraftSummary | undefined
  const staleDrafts: ReleaseDraftSummary[] = []
  let page = 1
  let hasMore = true
  let foundExistingDraftOnPreviousPage = false

  while (hasMore) {
    debug(`Fetching releases page ${String(page)}`)
    const { data: pageReleases } = await withGitHubApiRetry('repos.listReleases', () =>
      context.octokit.rest.repos.listReleases({
        owner: context.owner,
        repo: context.repo,
        per_page: 100,
        page
      })
    )

    for (const release of pageReleases) {
      if (!release.draft) {
        continue
      }

      const draftRelease: ReleaseDraftSummary = {
        id: release.id,
        tag_name: release.tag_name,
        body: release.body
      }

      if (release.tag_name === tagName) {
        // Keep the first match because GitHub returns releases newest-first.
        // This preserves pre-refactor behavior (`Array.find`) when duplicate
        // draft tags exist due to race conditions.
        existingDraft ??= draftRelease
        continue
      }

      if (release.body?.includes(SAVR_MARKER)) {
        staleDrafts.push(draftRelease)
      }
    }

    const isFullPage = pageReleases.length === 100

    // Safe early-stop heuristic:
    // GitHub release pages are ordered newest-first. Once we have found the
    // current tag's draft, scanning one additional full page captures nearby
    // stale SAVR drafts while avoiding deep pagination through old published
    // releases in large repositories. Older stale drafts are cleanup-only and
    // can be handled by subsequent runs.
    if (foundExistingDraftOnPreviousPage && isFullPage) {
      break
    }

    if (existingDraft) {
      foundExistingDraftOnPreviousPage = true
    }

    hasMore = isFullPage
    if (hasMore) {
      page++
    }
  }

  return {
    existingDraft,
    staleDrafts
  }
}

export const createOrUpdateRelease = async (
  context: GitHubContext,
  tagName: string,
  releaseName: string,
  releaseNotes: string,
  targetCommitish?: string,
  draft = true
): Promise<GitHubRelease> => {
  debug(`Checking for existing draft release with tag ${tagName}`)

  try {
    const { existingDraft, staleDrafts } = await listDraftReleasesForCreateOrUpdate(context, tagName)

    const releaseParams = {
      owner: context.owner,
      repo: context.repo,
      tag_name: tagName,
      name: releaseName,
      body: `${releaseNotes}\n${SAVR_MARKER}`,
      draft,
      ...(targetCommitish ? { target_commitish: targetCommitish } : {})
    }

    let release
    if (existingDraft) {
      info(`Updating existing draft release with ID ${String(existingDraft.id)}`)
      const { data } = await withGitHubApiRetry('repos.updateRelease', () =>
        context.octokit.rest.repos.updateRelease({
          ...releaseParams,
          release_id: existingDraft.id
        })
      )
      release = data
    } else {
      info('Creating new draft release')
      const { data } = await withGitHubApiRetry('repos.createRelease', () =>
        context.octokit.rest.repos.createRelease(releaseParams)
      )
      release = data
    }

    // Clean up other draft releases (keep only the current one)
    const otherDrafts = staleDrafts.filter(({ id }) => id !== release.id)

    if (otherDrafts.length > 0) {
      info(`Found ${String(otherDrafts.length)} old draft release(s) to delete`)
      for (const oldDraft of otherDrafts) {
        info(`Deleting old draft release: ${oldDraft.tag_name} (ID: ${String(oldDraft.id)})`)

        try {
          await deleteRelease(context, oldDraft.id)
        } catch (deletionError) {
          const deletionStatus = (deletionError as { status?: number }).status

          if (deletionStatus === 404) {
            warning(
              `Old draft release ${oldDraft.tag_name} (ID: ${String(oldDraft.id)}) was already deleted by another workflow run`
            )
            continue
          }

          throw deletionError
        }
      }
    }

    info(`Release ${release.tag_name} created/updated successfully`)
    return {
      id: release.id,
      url: release.html_url,
      tagName: release.tag_name
    }
  } catch (err) {
    error(`Failed to create/update release: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  }
}
