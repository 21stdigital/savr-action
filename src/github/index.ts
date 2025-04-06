import { info } from '@actions/core'
import { getOctokit } from '@actions/github'

import { Commit, parseCommit } from '../commits/index.js'
import { Tag } from '../version/index.js'

export interface GitHubContext {
  owner: string
  repo: string
  octokit: ReturnType<typeof getOctokit>
}

interface GitHubRelease {
  id: number
  url: string
  tagName: string
}

export const getTags = async (context: GitHubContext): Promise<Tag[]> => {
  const { data: tags } = await context.octokit.rest.repos.listTags({ owner: context.owner, repo: context.repo })
  return tags.map(tag => ({ name: tag.name, version: tag.name }))
}

export const getCommits = async (context: GitHubContext, head: string): Promise<Commit[]> => {
  info(`Getting commits up to ${head}`)

  const commits: Commit[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const { data: pageCommits } = await context.octokit.rest.repos.listCommits({
      owner: context.owner,
      repo: context.repo,
      sha: head,
      per_page: 100,
      page
    })

    if (pageCommits.length === 0) {
      hasMore = false
    } else {
      commits.push(...pageCommits.map(commit => parseCommit(commit.commit.message)))
      page++
    }
  }

  info(`Found ${commits.length.toString()} commits`)
  commits.forEach(commit => {
    info(`Commit: ${commit.message} (type: ${commit.type})`)
  })

  return commits
}

export const createOrUpdateRelease = async (
  context: GitHubContext,
  tagName: string,
  releaseName: string,
  releaseNotes: string,
  draft = true
): Promise<GitHubRelease> => {
  const { data: releases } = await context.octokit.rest.repos.listReleases({ owner: context.owner, repo: context.repo })
  const existingDraft = releases.find(({ draft, tag_name }) => draft && tag_name === tagName)

  const releaseParams = {
    owner: context.owner,
    repo: context.repo,
    tag_name: tagName,
    name: releaseName,
    body: releaseNotes,
    draft
  }

  const { data: release } = existingDraft
    ? await context.octokit.rest.repos.updateRelease({
        ...releaseParams,
        release_id: existingDraft.id
      })
    : await context.octokit.rest.repos.createRelease(releaseParams)

  return {
    id: release.id,
    url: release.html_url,
    tagName: release.tag_name
  }
}
