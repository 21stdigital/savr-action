import { debug, info, warning } from '@actions/core'
import { inc, rcompare, valid } from 'semver'

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
