import { info, warning } from '@actions/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { reconcileDraftReleases } from '../src/drafts.js'
import { createInMemoryReleaseStore } from './support/in-memory-release-store.js'

vi.mock('@actions/core', () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warning: vi.fn()
}))

const draftFor = (tagName: string) => ({
  tagName,
  name: tagName.replace(/^v/, ''),
  notes: `Notes for ${tagName}`,
  targetCommitish: 'head-sha'
})

describe('reconcileDraftReleases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates the Draft Release when none exists for its tag name', async () => {
    const releases = createInMemoryReleaseStore()

    const result = await reconcileDraftReleases(releases.store, {
      tagPrefix: 'v',
      draft: draftFor('v1.1.0'),
      dryRun: false
    })

    expect(releases.drafts()).toEqual([
      expect.objectContaining({
        tagName: 'v1.1.0',
        name: '1.1.0',
        notes: 'Notes for v1.1.0',
        targetCommitish: 'head-sha',
        savrManaged: true
      })
    ])
    expect(result.release).toEqual({
      id: 1,
      url: 'https://github.com/owner/repo/releases/tag/v1.1.0',
      tagName: 'v1.1.0'
    })
  })

  it('adopts a draft release made by hand with the same tag name as its Draft Release', async () => {
    const releases = createInMemoryReleaseStore([{ id: 7, tagName: 'v1.1.0', savrManaged: false, notes: 'Old' }])

    const result = await reconcileDraftReleases(releases.store, {
      tagPrefix: 'v',
      draft: draftFor('v1.1.0'),
      dryRun: false
    })

    expect(releases.drafts()).toEqual([
      expect.objectContaining({ id: 7, tagName: 'v1.1.0', notes: 'Notes for v1.1.0', savrManaged: true })
    ])
    expect(result.release?.id).toBe(7)
  })

  it('deletes every other Draft Release in its Tag Prefix, whether behind or ahead of the new version', async () => {
    const releases = createInMemoryReleaseStore([
      { id: 3, tagName: 'v2.0.0', savrManaged: true },
      { id: 2, tagName: 'v1.0.1', savrManaged: true },
      { id: 1, tagName: 'v0.9.0', savrManaged: true }
    ])

    const result = await reconcileDraftReleases(releases.store, {
      tagPrefix: 'v',
      draft: draftFor('v1.1.0'),
      dryRun: false
    })

    expect(releases.tagNames()).toEqual(['v1.1.0'])
    expect(result.superseded.map(({ tagName }) => tagName)).toEqual(['v2.0.0', 'v1.0.1', 'v0.9.0'])
  })

  it('leaves Draft Releases with another Tag Prefix or without a version, and draft releases made by hand, alone', async () => {
    const releases = createInMemoryReleaseStore([
      { id: 4, tagName: 'api-v0.2.0', savrManaged: true },
      { id: 3, tagName: 'vnext', savrManaged: true },
      { id: 2, tagName: 'v1.0.1', savrManaged: false },
      { id: 1, tagName: '0.9.0', savrManaged: true }
    ])

    const result = await reconcileDraftReleases(releases.store, {
      tagPrefix: 'v',
      draft: draftFor('v1.1.0'),
      dryRun: false
    })

    expect(releases.tagNames()).toEqual(['v1.1.0', 'api-v0.2.0', 'vnext', 'v1.0.1', '0.9.0'])
    expect(result.superseded).toEqual([])
  })

  it('treats v-prefixed Draft Releases as part of an empty Tag Prefix, like getLatestVersion does', async () => {
    // semver accepts a leading `v`, so `tag-prefix: ''` covers `v0.5.0` as well as `0.5.0` (#345).
    const releases = createInMemoryReleaseStore([
      { id: 3, tagName: 'api-v0.2.0', savrManaged: true },
      { id: 2, tagName: 'v1.0.1', savrManaged: true },
      { id: 1, tagName: '0.9.0', savrManaged: true }
    ])

    await reconcileDraftReleases(releases.store, { tagPrefix: '', draft: draftFor('1.1.0'), dryRun: false })

    expect(releases.tagNames()).toEqual(['1.1.0', 'api-v0.2.0'])
  })

  it('deletes every Draft Release in its Tag Prefix when there is nothing to release', async () => {
    const releases = createInMemoryReleaseStore([
      { id: 3, tagName: 'v1.1.0', savrManaged: true },
      { id: 2, tagName: 'api-v0.2.0', savrManaged: true },
      { id: 1, tagName: 'v0.9.0', savrManaged: true }
    ])

    const result = await reconcileDraftReleases(releases.store, { tagPrefix: 'v', dryRun: false })

    expect(releases.tagNames()).toEqual(['api-v0.2.0'])
    expect(result.release).toBeUndefined()
    expect(result.superseded.map(({ tagName }) => tagName)).toEqual(['v1.1.0', 'v0.9.0'])
  })

  it('keeps the newest of duplicate Draft Releases for its tag name and deletes the older ones', async () => {
    // Two concurrent runs can each create a draft for the same tag name.
    const releases = createInMemoryReleaseStore([
      { id: 2, tagName: 'v1.1.0', savrManaged: true },
      { id: 1, tagName: 'v1.1.0', savrManaged: true }
    ])

    await reconcileDraftReleases(releases.store, { tagPrefix: 'v', draft: draftFor('v1.1.0'), dryRun: false })

    expect(releases.drafts().map(({ id }) => id)).toEqual([2])
  })

  describe('when the release store fails', () => {
    it('warns about a draft it cannot delete and still deletes the rest', async () => {
      const releases = createInMemoryReleaseStore([
        { id: 2, tagName: 'v1.0.1', savrManaged: true },
        { id: 1, tagName: 'v0.9.0', savrManaged: true }
      ])
      releases.failures.deleteDraft = new Map([[2, Object.assign(new Error('Forbidden'), { status: 403 })]])

      const result = await reconcileDraftReleases(releases.store, {
        tagPrefix: 'v',
        draft: draftFor('v1.1.0'),
        dryRun: false
      })

      expect(releases.tagNames()).toEqual(['v1.1.0', 'v1.0.1'])
      expect(result.release?.tagName).toBe('v1.1.0')
      expect(warning).toHaveBeenCalledWith('Failed to delete Superseded Draft v1.0.1 (ID: 2): Forbidden')
    })

    it('fails when it cannot list drafts for a draft it has to write', async () => {
      const releases = createInMemoryReleaseStore()
      releases.failures.listDrafts = new Error('Bad credentials')

      await expect(
        reconcileDraftReleases(releases.store, { tagPrefix: 'v', draft: draftFor('v1.1.0'), dryRun: false })
      ).rejects.toThrow('Bad credentials')
    })

    it('fails without deleting anything when it cannot write the draft', async () => {
      const releases = createInMemoryReleaseStore([{ id: 1, tagName: 'v1.0.1', savrManaged: true }])
      releases.failures.write = new Error('Validation Failed')

      await expect(
        reconcileDraftReleases(releases.store, { tagPrefix: 'v', draft: draftFor('v1.1.0'), dryRun: false })
      ).rejects.toThrow('Validation Failed')
      expect(releases.tagNames()).toEqual(['v1.0.1'])
    })

    it('only warns when it cannot list drafts and there is nothing to release', async () => {
      const releases = createInMemoryReleaseStore()
      releases.failures.listDrafts = new Error('Bad credentials')

      const result = await reconcileDraftReleases(releases.store, { tagPrefix: 'v', dryRun: false })

      expect(result).toEqual({ superseded: [] })
      expect(warning).toHaveBeenCalledWith('Failed to list Draft Releases for cleanup: Bad credentials')
    })
  })

  describe('in a dry run', () => {
    it('changes nothing and reports the draft it would write and the drafts it would delete', async () => {
      const releases = createInMemoryReleaseStore([
        { id: 2, tagName: 'v1.0.1', savrManaged: true },
        { id: 1, tagName: 'v0.9.0', savrManaged: true }
      ])

      const result = await reconcileDraftReleases(releases.store, {
        tagPrefix: 'v',
        draft: draftFor('v1.1.0'),
        dryRun: true
      })

      expect(releases.tagNames()).toEqual(['v1.0.1', 'v0.9.0'])
      expect(result.release).toBeUndefined()
      expect(result.superseded.map(({ tagName }) => tagName)).toEqual(['v1.0.1', 'v0.9.0'])
      expect(info).toHaveBeenCalledWith('Dry run - would create Draft Release v1.1.0')
      expect(info).toHaveBeenCalledWith('Dry run - would delete Superseded Draft v1.0.1 (ID: 2)')
      expect(info).toHaveBeenCalledWith('Dry run - would delete Superseded Draft v0.9.0 (ID: 1)')
    })

    it('reports an update when a draft for the tag name exists', async () => {
      const releases = createInMemoryReleaseStore([{ id: 5, tagName: 'v1.1.0', savrManaged: true, notes: 'Old' }])

      await reconcileDraftReleases(releases.store, { tagPrefix: 'v', draft: draftFor('v1.1.0'), dryRun: true })

      expect(releases.drafts()).toEqual([expect.objectContaining({ id: 5, notes: 'Old' })])
      expect(info).toHaveBeenCalledWith('Dry run - would update Draft Release v1.1.0 (ID: 5)')
    })
  })
})
