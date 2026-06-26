import { getBooleanInput, getInput, info, setOutput } from '@actions/core'
import { context, getOctokit } from '@actions/github'
import { valid } from 'semver'

import { categorizeCommits, type CategorizedCommits, determineVersionBump } from './commits.js'
import { createOrUpdateRelease, getAnnotatedTag, getCommits, getGitRef, getTags, type GitHubContext } from './github.js'
import { compileReleaseNotes } from './templates.js'
import { sanitizeLogOutput } from './utils.js'
import { getLatestVersion, incrementVersion } from './version.js'

interface ReleaseOutputs {
  skipped: boolean
  version: string
  tag: string
  releaseUrl?: string
  releaseId?: string
}

interface BuildReleaseOptions {
  version: string
  tagName: string
  releaseName: string
  categorizedCommits: CategorizedCommits
  releaseNotesTemplate: string
  dryRun: boolean
  dryRunMessage: string
  targetCommitish?: string
}

const BRANCH_REF_PREFIX = 'refs/heads/'

const normalizeBranchRef = (branchRef: string): string =>
  branchRef.startsWith(BRANCH_REF_PREFIX) ? branchRef.slice(BRANCH_REF_PREFIX.length) : branchRef

const processCommits = async (githubContext: GitHubContext, head: string, sinceTag?: string) => {
  const commits = await getCommits(githubContext, head, sinceTag)
  info('Retrieved commits:')
  commits.forEach(commit => {
    // Sanitize commit message to prevent workflow command injection
    info(`- ${sanitizeLogOutput(commit.message)} (type: ${commit.type})`)
  })

  const categorizedCommits = categorizeCommits(commits)
  return { commits, categorizedCommits }
}

// Compiles release notes and either logs a dry-run preview or creates/updates
// the draft release. Returns the outputs the caller should publish — shared by
// the initial-release and version-bump paths in run().
export const buildAndPublishRelease = async (
  githubContext: GitHubContext,
  options: BuildReleaseOptions
): Promise<ReleaseOutputs> => {
  const { version, tagName, releaseName, categorizedCommits, releaseNotesTemplate, dryRun, dryRunMessage } = options

  const releaseNotes = compileReleaseNotes(releaseNotesTemplate, {
    version,
    ...categorizedCommits
  })

  if (dryRun) {
    info(dryRunMessage)
    info(`Version: ${version}`)
    info('Release notes:')
    // Sanitize release notes to prevent workflow command injection
    info(sanitizeLogOutput(releaseNotes))
    return {
      skipped: true,
      version,
      tag: tagName
    }
  }

  // Preserve the exact call arity of the two original branches: the
  // initial-release path omits targetCommitish entirely.
  const release = options.targetCommitish
    ? await createOrUpdateRelease(githubContext, tagName, releaseName, releaseNotes, options.targetCommitish)
    : await createOrUpdateRelease(githubContext, tagName, releaseName, releaseNotes)

  return {
    skipped: false,
    releaseUrl: release.url,
    releaseId: release.id.toString(),
    version,
    tag: release.tagName
  }
}

export const run = async (): Promise<void> => {
  const token = getInput('github-token', { required: true })
  const tagPrefix = getInput('tag-prefix')
  const releaseBranchInput = getInput('release-branch')
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

  if (!releaseBranchInput.trim()) {
    throw new Error('release-branch must not be empty')
  }

  const releaseBranch = normalizeBranchRef(releaseBranchInput.trim())
  const triggerRef = context.ref.trim()

  if (!triggerRef.startsWith(BRANCH_REF_PREFIX)) {
    info(`Skipping release: workflow was triggered by non-branch ref "${triggerRef}"`)
    return
  }

  const triggerBranch = normalizeBranchRef(triggerRef)
  if (triggerBranch !== releaseBranch) {
    info(
      `Skipping release: configured release-branch "${releaseBranch}" does not match triggering branch "${triggerBranch}"`
    )
    return
  }

  const octokit = getOctokit(token)
  const { owner, repo } = context.repo

  if (!owner || !repo) {
    throw new Error('Unable to determine repository owner and name from context')
  }

  setOutput('dry-run', dryRun.toString())

  const githubContext = { owner, repo, octokit }
  const setReleaseOutputs = (outputs: ReleaseOutputs) => {
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

    const headRef = await getGitRef(githubContext, `heads/${releaseBranch}`)
    const { categorizedCommits } = await processCommits(githubContext, headRef.object.sha)

    setReleaseOutputs(
      await buildAndPublishRelease(githubContext, {
        version: initialVersion,
        tagName: `${tagPrefix}${initialVersion}`,
        releaseName: initialVersion,
        categorizedCommits,
        releaseNotesTemplate,
        dryRun,
        dryRunMessage: 'Dry run - would create initial release with:'
      })
    )
    return
  }

  const tagData = await getGitRef(githubContext, `tags/${latestTag.name}`)
  const headData = await getGitRef(githubContext, `heads/${releaseBranch}`)

  let latestTagCommitSha = tagData.object.sha
  if (tagData.object.type === 'tag') {
    const annotatedTagData = await getAnnotatedTag(githubContext, tagData.object.sha)

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

  setReleaseOutputs(
    await buildAndPublishRelease(githubContext, {
      version: newVersion,
      tagName: `${tagPrefix}${newVersion}`,
      releaseName: newVersion,
      categorizedCommits,
      releaseNotesTemplate,
      dryRun,
      dryRunMessage: 'Dry run - would create/update release with:',
      targetCommitish: headData.object.sha
    })
  )
}
