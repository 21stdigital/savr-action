import { getBooleanInput, getInput, info, setOutput } from '@actions/core'
import { context, getOctokit } from '@actions/github'
import { valid } from 'semver'

import { categorizeCommits, determineVersionBump } from './commits.js'
import { createOrUpdateRelease, getCommits, getTags, type GitHubContext } from './github.js'
import { compileReleaseNotes } from './templates.js'
import { sanitizeLogOutput } from './utils.js'
import { getLatestVersion, incrementVersion } from './version.js'

const processCommits = async (githubContext: GitHubContext, head: string, sinceTag?: string) => {
  const commits = await getCommits(githubContext, head, sinceTag)
  info('Retrieved commits:')
  commits.forEach(commit => {
    // Sanitize commit message to prevent workflow command injection
    info(`- ${sanitizeLogOutput(commit.message)} (type: ${commit.type})`)
  })

  const categorizedCommits = categorizeCommits(commits)
  info('Categorized commits:')
  info(`Features: ${categorizedCommits.features.length.toString()}`)
  info(`Fixes: ${categorizedCommits.fixes.length.toString()}`)
  info(`Breaking: ${categorizedCommits.breaking.length.toString()}`)

  return { commits, categorizedCommits }
}

export const run = async (): Promise<void> => {
  const token = getInput('github-token', { required: true })
  const tagPrefix = getInput('tag-prefix')
  const releaseBranch = getInput('release-branch')
  const releaseNotesTemplate = getInput('release-notes-template')
  const dryRun = getBooleanInput('dry-run')
  const initialVersion = getInput('initial-version')
  if (!valid(initialVersion)) {
    throw new Error(`Invalid initial version: "${initialVersion}". Must be a valid semver string (e.g., 1.0.0)`)
  }

  if (tagPrefix.length > 20) {
    throw new Error(`tag-prefix must be at most 20 characters (got ${String(tagPrefix.length)})`)
  }

  if (!/^[a-zA-Z0-9._\-/]*$/.test(tagPrefix)) {
    throw new Error(
      `tag-prefix contains invalid characters: "${tagPrefix}". Only alphanumeric, dots, hyphens, underscores, and slashes are allowed`
    )
  }

  if (!releaseBranch.trim()) {
    throw new Error('release-branch must not be empty')
  }

  const octokit = getOctokit(token)
  const { owner, repo } = context.repo

  if (!owner || !repo) {
    throw new Error('Unable to determine repository owner and name from context')
  }

  const githubContext = { owner, repo, octokit }
  const setReleaseOutputs = (outputs: {
    skipped: boolean
    version: string
    tag: string
    releaseUrl?: string
    releaseId?: string
  }) => {
    setOutput('skipped', outputs.skipped.toString())
    setOutput('release-url', outputs.releaseUrl ?? '')
    setOutput('release-id', outputs.releaseId ?? '')
    setOutput('version', outputs.version)
    setOutput('tag', outputs.tag)
  }

  const tags = await getTags(githubContext)
  const latestTag = getLatestVersion(tags, tagPrefix)

  if (latestTag == null) {
    info(`No existing tags found. Starting from version ${initialVersion}`)
    const tagName = `${tagPrefix}${initialVersion}`
    const releaseName = initialVersion

    const { data: headRef } = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${releaseBranch}` })
    const { categorizedCommits } = await processCommits(githubContext, headRef.object.sha)
    const releaseNotes = compileReleaseNotes(releaseNotesTemplate, {
      version: initialVersion,
      ...categorizedCommits
    })

    if (dryRun) {
      info('Dry run - would create initial release with:')
      info(`Version: ${initialVersion}`)
      info('Release notes:')
      // Sanitize release notes to prevent workflow command injection
      info(sanitizeLogOutput(releaseNotes))
      setReleaseOutputs({
        skipped: true,
        version: initialVersion,
        tag: tagName
      })
      return
    }

    const release = await createOrUpdateRelease(githubContext, tagName, releaseName, releaseNotes)
    setReleaseOutputs({
      skipped: false,
      releaseUrl: release.url,
      releaseId: release.id.toString(),
      version: initialVersion,
      tag: release.tagName
    })
    return
  }

  const { data: tagData } = await octokit.rest.git.getRef({ owner, repo, ref: `tags/${latestTag.name}` })
  const { data: headData } = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${releaseBranch}` })

  let latestTagCommitSha = tagData.object.sha
  if (tagData.object.type === 'tag') {
    const { data: annotatedTagData } = await octokit.rest.git.getTag({
      owner,
      repo,
      tag_sha: tagData.object.sha
    })

    if (annotatedTagData.object.type !== 'commit') {
      throw new Error(
        `Latest tag ${latestTag.name} does not reference a commit (found: ${annotatedTagData.object.type})`
      )
    }

    latestTagCommitSha = annotatedTagData.object.sha
    info(`Latest tag ref SHA: ${tagData.object.sha}`)
    info(`Latest tag commit SHA: ${latestTagCommitSha}`)
  } else {
    info(`Latest tag SHA: ${latestTagCommitSha}`)
  }

  info(`Head SHA: ${headData.object.sha}`)

  // If HEAD and tag point to the same commit, there are no new commits to process
  if (headData.object.sha === latestTagCommitSha) {
    info('HEAD and latest tag point to the same commit - no changes to release')
    setReleaseOutputs({
      skipped: true,
      version: latestTag.version,
      tag: latestTag.name
    })
    return
  }

  const { categorizedCommits } = await processCommits(githubContext, headData.object.sha, latestTagCommitSha)

  let newVersion = latestTag.version
  const versionBump = determineVersionBump(categorizedCommits)

  if (versionBump == null) {
    info('No version bump needed - skipping release creation')
    setReleaseOutputs({
      skipped: true,
      version: latestTag.version,
      tag: latestTag.name
    })
    return
  }

  newVersion = incrementVersion(newVersion, versionBump)

  const releaseNotes = compileReleaseNotes(releaseNotesTemplate, {
    version: newVersion,
    ...categorizedCommits
  })

  if (dryRun) {
    info('Dry run - would create/update release with:')
    info(`Version: ${newVersion}`)
    info('Release notes:')
    // Sanitize release notes to prevent workflow command injection
    info(sanitizeLogOutput(releaseNotes))
    setReleaseOutputs({
      skipped: true,
      version: newVersion,
      tag: `${tagPrefix}${newVersion}`
    })
    return
  }

  const tagName = `${tagPrefix}${newVersion}`
  const releaseName = newVersion

  const release = await createOrUpdateRelease(githubContext, tagName, releaseName, releaseNotes, headData.object.sha)

  setReleaseOutputs({
    skipped: false,
    releaseUrl: release.url,
    releaseId: release.id.toString(),
    version: newVersion,
    tag: release.tagName
  })
}
