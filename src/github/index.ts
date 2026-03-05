import { debug, error, info, warning } from '@actions/core'
import { getOctokit } from '@actions/github'

import { Commit, parseCommit } from '../commits/index.js'
import { Tag } from '../version/index.js'

export const SAVR_MARKER = '<!-- savr-managed-release -->'

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

export const getTags = async (context: GitHubContext): Promise<Tag[]> => {
  debug(`Fetching tags for repository ${context.owner}/${context.repo}`)

  const allTags: Tag[] = []
  let page = 1
  let hasMore = true

  try {
    while (hasMore) {
      debug(`Fetching tags page ${String(page)}`)
      const { data: tags } = await context.octokit.rest.repos.listTags({
        owner: context.owner,
        repo: context.repo,
        per_page: 100,
        page
      })

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

  try {
    while (hasMore) {
      debug(`Fetching commits page ${String(page)}`)
      const { data: pageCommits } = await context.octokit.rest.repos.listCommits({
        owner: context.owner,
        repo: context.repo,
        sha: head,
        per_page: 100,
        page
      })

      debug(`Found ${String(pageCommits.length)} commits on page ${String(page)}`)
      // If we have a sinceTag, stop when we reach it
      if (sinceTag && pageCommits.some(commit => commit.sha === sinceTag)) {
        info(`Reached target tag ${sinceTag}, stopping commit fetch`)
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
    await context.octokit.rest.repos.deleteRelease({
      owner: context.owner,
      repo: context.repo,
      release_id: releaseId
    })
    info(`Release with ID ${String(releaseId)} deleted successfully`)
  } catch (err) {
    error(`Failed to delete release: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  }
}

const listAllReleases = async (
  context: GitHubContext
): Promise<{ id: number; tag_name: string; draft: boolean; html_url: string; body?: string | null }[]> => {
  const allReleases: { id: number; tag_name: string; draft: boolean; html_url: string; body?: string | null }[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    debug(`Fetching releases page ${String(page)}`)
    const { data: pageReleases } = await context.octokit.rest.repos.listReleases({
      owner: context.owner,
      repo: context.repo,
      per_page: 100,
      page
    })

    allReleases.push(...pageReleases)

    hasMore = pageReleases.length === 100
    if (hasMore) {
      page++
    }
  }

  return allReleases
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
    const releases = await listAllReleases(context)
    const existingDraft = releases.find(({ draft, tag_name }) => draft && tag_name === tagName)

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
      const { data } = await context.octokit.rest.repos.updateRelease({
        ...releaseParams,
        release_id: existingDraft.id
      })
      release = data
    } else {
      info('Creating new draft release')
      const { data } = await context.octokit.rest.repos.createRelease(releaseParams)
      release = data
    }

    // Clean up other draft releases (keep only the current one)
    const otherDrafts = releases.filter(
      ({ draft, tag_name, id, body }) =>
        draft && tag_name !== tagName && id !== release.id && body?.includes(SAVR_MARKER)
    )

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
