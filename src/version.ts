import { debug, info, warning } from '@actions/core'
import { inc, lte, major, rcompare, valid } from 'semver'

export type VersionType = 'major' | 'minor' | 'patch'

export interface Tag {
  name: string
  version: string
}

export const incrementVersion = (version: string, type: VersionType): string => {
  debug(`Incrementing version ${version} by ${type}`)
  const result = inc(version, type)
  if (result == null) {
    throw new Error(`Failed to increment version "${version}" by "${type}"`)
  }
  info(`New version calculated: ${result}`)
  return result
}

export interface VersionBumpOptions {
  bumpMinorPreMajor: boolean
}

// Initial Development: semver's 0.y.z phase, where the major version is 0.
export const isInitialDevelopment = (version: string): boolean => major(version) === 0

// With no Version Tags yet, the first Draft Release is initial-version. A non-0.x
// start leaves Initial Development before it began, so bump-minor-pre-major can
// never apply; warn instead of silently ignoring the input.
export const checkInitialVersion = (initialVersion: string, options: VersionBumpOptions): void => {
  if (options.bumpMinorPreMajor && !isInitialDevelopment(initialVersion)) {
    warning(
      `bump-minor-pre-major has no effect: there are no version tags yet and initial-version "${initialVersion}" is not a 0.x version. Set initial-version to a 0.x version such as 0.1.0 to stay in Initial Development.`
    )
  }
}

export const resolveVersionBump = (
  bump: VersionType,
  currentVersion: string,
  options: VersionBumpOptions
): VersionType => {
  if (bump !== 'major' || !options.bumpMinorPreMajor) {
    return bump
  }

  if (!isInitialDevelopment(currentVersion)) {
    debug(`bump-minor-pre-major has no effect: ${currentVersion} is past Initial Development`)
    return bump
  }

  info(`Breaking changes in Initial Development (${currentVersion}) - minor version bump (bump-minor-pre-major)`)
  return 'minor'
}

export const getLatestVersion = (tags: Tag[], tagPrefix: string): Tag | undefined => {
  debug(`Finding latest version from ${String(tags.length)} tags with prefix "${tagPrefix}"`)

  const semverTags = tags
    .filter(tag => tag.name.startsWith(tagPrefix))
    .map(tag => ({
      name: tag.name,
      version: tag.name.replace(tagPrefix, '')
    }))
    .filter(({ version }) => valid(version))
    .sort((a, b) => rcompare(a.version, b.version))

  if (semverTags.length > 0) {
    info(`Latest version found: ${semverTags[0].version}`)
    return semverTags[0]
  }

  warning('No valid version tags found')
  return undefined
}

// A Draft Release is superseded once a Version Tag at or beyond its version
// exists: publishing it could no longer produce the next version. Tags with
// another prefix or without a semver version are never superseded, so drafts
// SAVR cannot reason about are left alone.
export const isSupersededBy = (draftTagName: string, latestTag: Tag, tagPrefix: string): boolean => {
  if (!draftTagName.startsWith(tagPrefix)) {
    return false
  }

  const draftVersion = draftTagName.slice(tagPrefix.length)
  return valid(draftVersion) != null && lte(draftVersion, latestTag.version)
}
