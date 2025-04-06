import { getBooleanInput, getInput, info, setOutput } from '@actions/core'
import { context, getOctokit } from '@actions/github'

import { categorizeCommits, determineVersionBump } from './commits/index.js'
import { createOrUpdateRelease, getCommits, getTags } from './github/index.js'
import { compileReleaseNotes } from './templates/index.js'
import { getLatestVersion, incrementVersion } from './version/index.js'

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

    // Get all commits for the initial release
    const commits = await getCommits(githubContext, '', 'HEAD')
    info('Retrieved commits:')
    commits.forEach(commit => {
      info(`- ${commit.message} (type: ${commit.type})`)
    })

    const categorizedCommits = categorizeCommits(commits)
    info('Categorized commits:')
    info(`Features: ${categorizedCommits.features.length.toString()}`)
    info(`Fixes: ${categorizedCommits.fixes.length.toString()}`)
    info(`Breaking: ${categorizedCommits.breaking.length.toString()}`)

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
  const latestTagSha = tagData.object.sha
  info(`Latest tag SHA: ${latestTagSha}`)

  const { data: headData } = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${releaseBranch}` })
  const headSha = headData.object.sha
  info(`Head SHA: ${headSha}`)

  const commits = await getCommits(githubContext, latestTagSha, headSha)
  info('Retrieved commits:')
  commits.forEach(commit => {
    info(`- ${commit.message} (type: ${commit.type})`)
  })

  const categorizedCommits = categorizeCommits(commits)
  info('Categorized commits:')
  info(`Features: ${categorizedCommits.features.length.toString()}`)
  info(`Fixes: ${categorizedCommits.fixes.length.toString()}`)
  info(`Breaking: ${categorizedCommits.breaking.length.toString()}`)

  let newVersion = latestTag.version
  const versionBump = determineVersionBump(categorizedCommits)

  if (versionBump != null) {
    newVersion = incrementVersion(newVersion, versionBump)
  }

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
  const releaseName = `Release ${newVersion}`

  const release = await createOrUpdateRelease(githubContext, tagName, releaseName, releaseNotes)

  setOutput('release-url', release.url)
  setOutput('release-id', release.id.toString())
  setOutput('version', release.tagName)
}
