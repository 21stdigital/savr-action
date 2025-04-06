import { getOctokit } from '@actions/github'

import { Commit } from '../commits/index.js'
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
  const { data: comparison } = await context.octokit.rest.repos.compareCommits({
    owner: context.owner,
    repo: context.repo,
    base,
    head
  })

  return comparison.commits.map(commit => ({
    // TODO: Check if this is correct
    type: 'chore',
    subject: commit.commit.message,
    message: commit.commit.message,
    breaking: false
  }))
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
