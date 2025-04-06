import { debug, info, warning } from '@actions/core'
import { gt, valid } from 'semver'

export type VersionType = 'major' | 'minor' | 'patch'

export interface Tag {
  name: string
  version: string
}

export const incrementVersion = (version: string, type: VersionType): string => {
  debug(`Incrementing version ${version} by ${type}`)

  // Split version into base version and metadata
  const [baseVersion, ...metadata] = version.split('+')
  const [versionWithoutPreRelease] = baseVersion.split('-')

  // Parse the base version numbers
  const [major, minor, patch] = versionWithoutPreRelease.split('.').map(Number)

  // Calculate new version numbers based on type
  const increments = {
    major: [major + 1, 0, 0],
    minor: [major, minor + 1, 0],
    patch: [major, minor, patch + 1]
  }

  // Construct new version
  const newBaseVersion = increments[type].join('.')
  const newVersion = metadata.length > 0 ? `${newBaseVersion}+${metadata.join('+')}` : newBaseVersion

  info(`New version calculated: ${newVersion}`)
  return newVersion
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
    .sort((a, b) => {
      // Remove pre-release and build metadata for comparison
      const aBase = a.version.split('-')[0].split('+')[0]
      const bBase = b.version.split('-')[0].split('+')[0]
      return gt(aBase, bBase) ? -1 : 1
    })

  if (semverTags.length > 0) {
    info(`Latest version found: ${semverTags[0].version}`)
    return semverTags[0]
  }

  warning('No valid version tags found')
  return undefined
}
