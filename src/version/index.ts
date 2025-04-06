import { gt, valid } from 'semver'

export type VersionType = 'major' | 'minor' | 'patch'

export interface Tag {
  name: string
  version: string
}

export const incrementVersion = (version: string, type: VersionType): string => {
  const [major, minor, patch] = version.split('.').map(Number)
  const increments = {
    major: [major + 1, 0, 0],
    minor: [major, minor + 1, 0],
    patch: [major, minor, patch + 1]
  }
  return increments[type].join('.')
}

export const getLatestVersion = (tags: Tag[], tagPrefix: string): Tag | undefined => {
  const semverTags = tags
    .filter(tag => tag.name.startsWith(tagPrefix))
    .map(tag => ({
      name: tag.name,
      version: tag.name.replace(tagPrefix, '')
    }))
    .filter(({ version }) => valid(version))
    .sort((a, b) => (gt(a.version, b.version) ? -1 : 1))

  return semverTags.length > 0 ? semverTags[0] : undefined
}
