import { getBooleanInput, getInput, info, setOutput } from '@actions/core'
import { context, getOctokit } from '@actions/github'

import { categorizeCommits, determineVersionBump } from './commits/index.js'
import { createOrUpdateRelease, getCommits, getTags, type GitHubContext } from './github/index.js'
import { compileReleaseNotes } from './templates/index.js'
import { getLatestVersion, incrementVersion } from './version/index.js'

const processCommits = async (githubContext: GitHubContext, head: string, sinceTag?: string) => {
  const commits = await getCommits(githubContext, head, sinceTag)
  info('Retrieved commits:')
  commits.forEach(commit => {
    info(`- ${commit.message} (type: ${commit.type})`)
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

  const octokit = getOctokit(token)
  const { owner, repo } = context.repo
  const githubContext = { owner, repo, octokit }

  const tags = await getTags(githubContext)
  const latestTag = getLatestVersion(tags, tagPrefix)

  if (latestTag == null) {
    info(`No existing tags found. Starting from version ${initialVersion}`)
    const tagName = `${tagPrefix}${initialVersion}`
    const releaseName = initialVersion

    const { categorizedCommits } = await processCommits(githubContext, 'HEAD')
    const releaseNotes = compileReleaseNotes(releaseNotesTemplate, {
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

    const release = await createOrUpdateRelease(githubContext, tagName, releaseName, releaseNotes)
    setOutput('release-url', release.url)
    setOutput('release-id', release.id.toString())
    setOutput('version', release.tagName)
    return
  }

  const { data: tagData } = await octokit.rest.git.getRef({ owner, repo, ref: `tags/${latestTag.name}` })
  const { data: headData } = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${releaseBranch}` })

  info(`Latest tag SHA: ${tagData.object.sha}`)
  info(`Head SHA: ${headData.object.sha}`)

  const { categorizedCommits } = await processCommits(githubContext, headData.object.sha, tagData.object.sha)

  let newVersion = latestTag.version
  const versionBump = determineVersionBump(categorizedCommits)

  if (versionBump == null) {
    info('No version bump needed - skipping release creation')
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
    info(releaseNotes)
    return
  }

  const tagName = `${tagPrefix}${newVersion}`
  const releaseName = newVersion

  const release = await createOrUpdateRelease(githubContext, tagName, releaseName, releaseNotes)

  setOutput('release-url', release.url)
  setOutput('release-id', release.id.toString())
  setOutput('version', release.tagName)
}
