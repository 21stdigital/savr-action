import { getBooleanInput, getInput, info, setOutput } from '@actions/core'
import { context, getOctokit } from '@actions/github'
import Handlebars from 'handlebars'
import { gt, valid } from 'semver'

import { Commit, Tag } from './types.js'

const incrementVersion = (version: string, type: 'major' | 'minor' | 'patch'): string => {
  const [major, minor, patch] = version.split('.').map(Number)

  switch (type) {
    case 'major':
      return `${String(major + 1)}.0.0`
    case 'minor':
      return `${String(major)}.${String(minor + 1)}.0`
    case 'patch':
      return `${String(major)}.${String(minor)}.${String(patch + 1)}`
  }
}

export const run = async (): Promise<void> => {
  const token = getInput('github-token', { required: true })
  const tagPrefix = getInput('tag-prefix')
  const releaseBranch = getInput('release-branch')
  const releaseNotesTemplate = getInput('release-notes-template')
  const dryRun = getBooleanInput('dry-run')
  const initialVersion = getInput('initial-version')
  const octokit = getOctokit(token)
  const { owner, repo } = context.repo

  const { data: tags } = await octokit.rest.repos.listTags({ owner, repo })

  const semverTags = tags
    .filter((tag: { name: string }) => tag.name.startsWith(tagPrefix))
    .map((tag: { name: string }) => ({
      name: tag.name,
      version: tag.name.replace(tagPrefix, '')
    }))
    .filter(({ version }: Tag) => valid(version))
    .sort((a: Tag, b: Tag) => (gt(a.version, b.version) ? -1 : 1))

  if (semverTags.length === 0) {
    info(`No existing tags found. Starting from version ${initialVersion}`)
    const tagName = `${tagPrefix}${initialVersion}`
    const releaseName = initialVersion

    const { data: commits } = await octokit.rest.repos.listCommits({ owner, repo, sha: releaseBranch })

    const parsedCommits: Commit[] = commits.map(commit => {
      const message = commit.commit.message
      const match = /^(feat|fix|chore|docs|refactor|perf|test)(!?)(?:\(([^)]+)\))?: (.+)/.exec(message)

      if (!match) {
        return {
          type: 'chore',
          subject: message,
          message: message,
          breaking: false
        }
      }

      const [, type, isBreaking, scope, subject] = match
      const breaking = isBreaking === '!' || message.includes('BREAKING CHANGE:')

      return {
        type,
        scope,
        subject,
        message,
        breaking
      }
    })

    const categorizedCommits = {
      features: parsedCommits.filter(({ type }) => type === 'feat'),
      fixes: parsedCommits.filter(({ type }) => type === 'fix'),
      breaking: parsedCommits.filter(({ breaking }) => breaking)
    }

    const template = Handlebars.compile(releaseNotesTemplate)

    const releaseNotes = template({
      version: initialVersion,
      ...categorizedCommits
    })

    if (dryRun) {
      info('Dry run - would create initial release with:')
      info(`Version: ${initialVersion}`)
      info('Release notes:')
      info(releaseNotes)
      return
    }

    const { data: releases } = await octokit.rest.repos.listReleases({ owner, repo })
    const existingDraft = releases.find(({ draft, tag_name }) => draft && tag_name === tagName)

    if (existingDraft != null) {
      const { data: release } = await octokit.rest.repos.updateRelease({
        owner,
        repo,
        release_id: existingDraft.id,
        tag_name: tagName,
        name: releaseName,
        body: releaseNotes,
        draft: true
      })

      setOutput('release-url', release.html_url)
      setOutput('release-id', release.id.toString())
      setOutput('version', release.tag_name)
    } else {
      const { data: release } = await octokit.rest.repos.createRelease({
        owner,
        repo,
        tag_name: tagName,
        name: releaseName,
        body: releaseNotes,
        draft: true
      })

      setOutput('release-url', release.html_url)
      setOutput('release-id', release.id.toString())
      setOutput('version', release.tag_name)
    }
    return
  }

  const latestTag = semverTags[0]
  const { data: tagData } = await octokit.rest.git.getRef({ owner, repo, ref: `tags/${latestTag.name}` })
  const latestTagSha = tagData.object.sha

  const { data: headData } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${releaseBranch}`
  })
  const headSha = headData.object.sha

  const { data: comparison } = await octokit.rest.repos.compareCommits({
    owner,
    repo,
    base: latestTagSha,
    head: headSha
  })

  const parsedCommits: Commit[] = comparison.commits.map(commit => {
    // Simple parsing based on conventional commits format
    const message = commit.commit.message
    const match = /^(feat|fix|chore|docs|refactor|perf|test)(!?)(?:\(([^)]+)\))?: (.+)/.exec(message)

    if (!match) {
      return {
        type: 'chore',
        subject: message,
        message: message,
        breaking: false
      }
    }

    const [, type, isBreaking, scope, subject] = match
    const breaking = isBreaking === '!' || message.includes('BREAKING CHANGE:')

    return {
      type,
      scope,
      subject,
      message,
      breaking
    }
  })

  // Categorize commits
  const categorizedCommits = {
    features: parsedCommits.filter(c => c.type === 'feat'),
    fixes: parsedCommits.filter(c => c.type === 'fix'),
    breaking: parsedCommits.filter(c => c.breaking)
  }

  let newVersion = latestTag.version
  if (categorizedCommits.breaking.length > 0) {
    newVersion = incrementVersion(newVersion, 'major')
  } else if (categorizedCommits.features.length > 0) {
    newVersion = incrementVersion(newVersion, 'minor')
  } else if (categorizedCommits.fixes.length > 0) {
    newVersion = incrementVersion(newVersion, 'patch')
  }

  const template = Handlebars.compile(releaseNotesTemplate)
  const releaseNotes = template({
    version: newVersion,
    ...categorizedCommits
  })

  if (dryRun) {
    info('Dry run - would create/update release with:')
    info(`Version: ${newVersion}`)
    info('Release notes:')
    info(releaseNotes)
    return
  }

  const tagName = `${tagPrefix}${newVersion}`
  const releaseName = `Release ${newVersion}`

  const { data: releases } = await octokit.rest.repos.listReleases({ owner, repo })

  const existingDraft = releases.find(({ draft, tag_name }) => draft && tag_name === tagName)

  if (existingDraft != null) {
    const { data: release } = await octokit.rest.repos.updateRelease({
      owner,
      repo,
      release_id: existingDraft.id,
      tag_name: tagName,
      name: releaseName,
      body: releaseNotes,
      draft: true
    })

    setOutput('release-url', release.html_url)
    setOutput('release-id', release.id.toString())
    setOutput('version', release.tag_name)
  } else {
    const { data: release } = await octokit.rest.repos.createRelease({
      owner,
      repo,
      tag_name: tagName,
      name: releaseName,
      body: releaseNotes,
      draft: true
    })

    setOutput('release-url', release.html_url)
    setOutput('release-id', release.id.toString())
    setOutput('version', release.tag_name)
  }
}
