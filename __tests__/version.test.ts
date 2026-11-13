import { describe, expect, it } from 'vitest'

import { getLatestVersion, incrementVersion, resolveVersionBump } from '../src/version.js'

describe('version', () => {
  describe('incrementVersion', () => {
    it('should increment major version', () => {
      expect(incrementVersion('1.0.0', 'major')).toBe('2.0.0')
      expect(incrementVersion('1.2.3', 'major')).toBe('2.0.0')
    })

    it('should increment minor version', () => {
      expect(incrementVersion('1.0.0', 'minor')).toBe('1.1.0')
      expect(incrementVersion('1.2.3', 'minor')).toBe('1.3.0')
    })

    it('should increment patch version', () => {
      expect(incrementVersion('1.0.0', 'patch')).toBe('1.0.1')
      expect(incrementVersion('1.2.3', 'patch')).toBe('1.2.4')
    })

    it('should handle pre-release versions', () => {
      expect(incrementVersion('1.0.0-alpha.1', 'major')).toBe('1.0.0')
      expect(incrementVersion('1.0.0-beta.1', 'minor')).toBe('1.0.0')
      expect(incrementVersion('1.0.0-rc.1', 'patch')).toBe('1.0.0')
    })

    it('should handle build metadata', () => {
      expect(incrementVersion('1.0.0+20130313144700', 'major')).toBe('2.0.0')
      expect(incrementVersion('1.0.0+exp.sha.5114f85', 'minor')).toBe('1.1.0')
      expect(incrementVersion('1.0.0+20130313144700', 'patch')).toBe('1.0.1')
    })

    it('should handle versions with both pre-release and build metadata', () => {
      expect(incrementVersion('1.0.0-alpha.1+20130313144700', 'major')).toBe('1.0.0')
      expect(incrementVersion('1.0.0-beta.1+exp.sha.5114f85', 'minor')).toBe('1.0.0')
      expect(incrementVersion('1.0.0-rc.1+20130313144700', 'patch')).toBe('1.0.0')
    })

    it('should throw for invalid version string', () => {
      expect(() => incrementVersion('not-a-version', 'patch')).toThrow('Failed to increment version')
    })
  })

  describe('resolveVersionBump', () => {
    it('should bump minor for a breaking change in Initial Development when bump-minor-pre-major is on', () => {
      expect(resolveVersionBump('major', '0.3.0', { bumpMinorPreMajor: true })).toBe('minor')
    })

    it('should keep a major bump once the project has left Initial Development', () => {
      expect(resolveVersionBump('major', '1.2.0', { bumpMinorPreMajor: true })).toBe('major')
    })

    it('should keep a major bump in Initial Development when bump-minor-pre-major is off', () => {
      expect(resolveVersionBump('major', '0.3.0', { bumpMinorPreMajor: false })).toBe('major')
    })

    it('should bump minor for a breaking change on a 0.0.x version', () => {
      expect(resolveVersionBump('major', '0.0.3', { bumpMinorPreMajor: true })).toBe('minor')
    })

    it('should bump minor for a breaking change on a 0.x pre-release', () => {
      expect(resolveVersionBump('major', '0.4.0-beta.1', { bumpMinorPreMajor: true })).toBe('minor')
    })

    it('should leave minor and patch bumps unchanged', () => {
      expect(resolveVersionBump('minor', '0.3.0', { bumpMinorPreMajor: true })).toBe('minor')
      expect(resolveVersionBump('patch', '0.3.0', { bumpMinorPreMajor: true })).toBe('patch')
    })

    it('should produce the next version for a breaking change with bump-minor-pre-major on', () => {
      const options = { bumpMinorPreMajor: true }
      expect(incrementVersion('0.3.0', resolveVersionBump('major', '0.3.0', options))).toBe('0.4.0')
      expect(incrementVersion('0.0.3', resolveVersionBump('major', '0.0.3', options))).toBe('0.1.0')
      expect(incrementVersion('0.4.0-beta.1', resolveVersionBump('major', '0.4.0-beta.1', options))).toBe('0.4.0')
      expect(incrementVersion('1.2.0', resolveVersionBump('major', '1.2.0', options))).toBe('2.0.0')
    })
  })

  describe('getLatestVersion', () => {
    it('should return undefined when no tags are provided', () => {
      expect(getLatestVersion([], 'v')).toBeUndefined()
    })

    it('should return undefined when no valid semver tags are found', () => {
      expect(getLatestVersion([{ name: 'invalid', version: 'invalid' }], 'v')).toBeUndefined()
    })

    it('should return the latest version when valid semver tags are found', () => {
      const tags = [
        { name: 'v1.0.0', version: '1.0.0' },
        { name: 'v1.1.0', version: '1.1.0' },
        { name: 'v1.0.1', version: '1.0.1' }
      ]
      expect(getLatestVersion(tags, 'v')).toEqual({ name: 'v1.1.0', version: '1.1.0' })
    })

    it('should filter tags by prefix', () => {
      const tags = [
        { name: 'v1.0.0', version: '1.0.0' },
        { name: 'release-1.1.0', version: '1.1.0' }
      ]
      expect(getLatestVersion(tags, 'v')).toEqual({ name: 'v1.0.0', version: '1.0.0' })
    })

    it('should handle pre-release versions', () => {
      const tags = [
        { name: 'v1.0.0', version: '1.0.0' },
        { name: 'v1.1.0-alpha.1', version: '1.1.0-alpha.1' },
        { name: 'v1.0.1-beta.1', version: '1.0.1-beta.1' }
      ]
      expect(getLatestVersion(tags, 'v')).toEqual({ name: 'v1.1.0-alpha.1', version: '1.1.0-alpha.1' })
    })

    it('should handle build metadata', () => {
      const tags = [
        { name: 'v1.0.0+20130313144700', version: '1.0.0+20130313144700' },
        { name: 'v1.1.0+exp.sha.5114f85', version: '1.1.0+exp.sha.5114f85' }
      ]
      expect(getLatestVersion(tags, 'v')).toEqual({ name: 'v1.1.0+exp.sha.5114f85', version: '1.1.0+exp.sha.5114f85' })
    })

    it('should handle mixed version formats', () => {
      const tags = [
        { name: 'v1.0.0', version: '1.0.0' },
        { name: 'v1.1.0-alpha.1+20130313144700', version: '1.1.0-alpha.1+20130313144700' },
        { name: 'v1.0.1-beta.1+exp.sha.5114f85', version: '1.0.1-beta.1+exp.sha.5114f85' }
      ]
      expect(getLatestVersion(tags, 'v')).toEqual({
        name: 'v1.1.0-alpha.1+20130313144700',
        version: '1.1.0-alpha.1+20130313144700'
      })
    })

    it('should handle different prefix formats', () => {
      const tags = [
        { name: 'v1.0.0', version: '1.0.0' },
        { name: 'release-v1.1.0', version: '1.1.0' },
        { name: 'version-1.0.1', version: '1.0.1' }
      ]
      expect(getLatestVersion(tags, 'v')).toEqual({ name: 'v1.0.0', version: '1.0.0' })
      expect(getLatestVersion(tags, 'release-v')).toEqual({ name: 'release-v1.1.0', version: '1.1.0' })
      expect(getLatestVersion(tags, 'version-')).toEqual({ name: 'version-1.0.1', version: '1.0.1' })
    })

    it('should prefer stable over prerelease of same base version', () => {
      const tags = [
        { name: 'v1.0.0-rc.1', version: '1.0.0-rc.1' },
        { name: 'v1.0.0', version: '1.0.0' }
      ]
      expect(getLatestVersion(tags, 'v')).toEqual({ name: 'v1.0.0', version: '1.0.0' })
    })

    it('should sort prerelease versions deterministically', () => {
      const tags = [
        { name: 'v1.0.0-alpha.1', version: '1.0.0-alpha.1' },
        { name: 'v1.0.0-alpha.2', version: '1.0.0-alpha.2' },
        { name: 'v1.0.0-beta.1', version: '1.0.0-beta.1' }
      ]
      expect(getLatestVersion(tags, 'v')).toEqual({ name: 'v1.0.0-beta.1', version: '1.0.0-beta.1' })
    })

    it('should handle equal versions correctly in sorting', () => {
      const tags = [
        { name: 'v1.0.0', version: '1.0.0' },
        { name: 'v1.0.0', version: '1.0.0' },
        { name: 'v1.1.0', version: '1.1.0' }
      ]
      // Should still return the latest version even with duplicates
      expect(getLatestVersion(tags, 'v')).toEqual({ name: 'v1.1.0', version: '1.1.0' })
    })

    it('should handle many tags (>100 tags scenario)', () => {
      // Create 150 tags to test pagination scenario
      const tags = []
      for (let i = 0; i < 150; i++) {
        tags.push({ name: `v1.0.${String(i)}`, version: `1.0.${String(i)}` })
      }
      const latest = getLatestVersion(tags, 'v')
      expect(latest).toEqual({ name: 'v1.0.149', version: '1.0.149' })
    })
  })
})
