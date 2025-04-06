import { debug, error, info } from '@actions/core'
import { getOctokit } from '@actions/github'

import { Commit, parseCommit } from '../commits/index.js'
import { Tag } from '../version/index.js'

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

  try {
    const { data: tags } = await context.octokit.rest.repos.listTags({
      owner: context.owner,
      repo: context.repo,
      per_page: 100
    })

    info(`Found ${String(tags.length)} tags`)
    return tags.map(tag => ({
      name: tag.name,
      version: tag.name
    }))
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

      if (pageCommits.length === 0) {
        debug('No more commits found')
        hasMore = false
      } else {
        debug(`Found ${String(pageCommits.length)} commits on page ${String(page)}`)
        // If we have a sinceTag, stop when we reach it
        if (sinceTag && pageCommits.some(commit => commit.sha === sinceTag)) {
          info(`Reached target tag ${sinceTag}, stopping commit fetch`)
          hasMore = false
          // Only include commits up to but not including the tag's commit
          const commitsUpToTag = pageCommits.slice(
            0,
            pageCommits.findIndex(commit => commit.sha === sinceTag)
          )
          commits.push(...commitsUpToTag.map(commit => parseCommit(commit.commit.message)))
        } else {
          commits.push(...pageCommits.map(commit => parseCommit(commit.commit.message)))
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

export const createOrUpdateRelease = async (
  context: GitHubContext,
  tagName: string,
  releaseName: string,
  releaseNotes: string,
  draft = true
): Promise<GitHubRelease> => {
  debug(`Checking for existing draft release with tag ${tagName}`)

  try {
    const { data: releases } = await context.octokit.rest.repos.listReleases({
      owner: context.owner,
      repo: context.repo
    })
    const existingDraft = releases.find(({ draft, tag_name }) => draft && tag_name === tagName)

    const releaseParams = {
      owner: context.owner,
      repo: context.repo,
      tag_name: tagName,
      name: releaseName,
      body: releaseNotes,
      draft
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
