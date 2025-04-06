import { describe, expect, it } from 'vitest'

import { getLatestVersion, incrementVersion } from '../src/version/index.js'

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
  })
})
