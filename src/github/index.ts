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

export const getCommits = async (context: GitHubContext, base: string, head: string): Promise<Commit[]> => {
  info(`Getting commits from ${base} to ${head}`)

  // Get all commits
  const { data: commits } = await context.octokit.rest.repos.listCommits({
    owner: context.owner,
    repo: context.repo,
    sha: head,
    per_page: 100
  })

  info(`Found ${commits.length.toString()} commits`)
  commits.forEach(commit => {
    info(`Commit: ${commit.sha.substring(0, 7)} - ${commit.commit.message}`)
  })

  return commits.map(commit => parseCommit(commit.commit.message))
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

  if (existingDraft != null) {
    const { data: release } = await context.octokit.rest.repos.updateRelease({
      owner: context.owner,
      repo: context.repo,
      release_id: existingDraft.id,
      tag_name: tagName,
      name: releaseName,
      body: releaseNotes,
      draft
    })

    return {
      id: release.id,
      url: release.html_url,
      tagName: release.tag_name
    }
  }

  const { data: release } = await context.octokit.rest.repos.createRelease({
    owner: context.owner,
    repo: context.repo,
    tag_name: tagName,
    name: releaseName,
    body: releaseNotes,
    draft
  })

  return {
    id: release.id,
    url: release.html_url,
    tagName: release.tag_name
  }
}
