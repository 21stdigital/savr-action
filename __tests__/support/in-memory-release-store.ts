import type { DraftContent, ReleaseStore, WrittenDraft } from '../../src/drafts.js'

export interface InMemoryDraft {
  id: number
  tagName: string
  savrManaged: boolean
  name?: string
  notes?: string
  targetCommitish?: string
}

interface Failures {
  listDrafts?: Error
  write?: Error
  deleteDraft?: Map<number, Error>
}

// The second adapter at the release store seam: holds Draft Releases newest
// first, like GitHub lists them, so tests can assert which drafts remain.
export const createInMemoryReleaseStore = (initial: InMemoryDraft[] = []) => {
  let drafts = initial.map(draft => ({ ...draft }))
  let nextId = Math.max(0, ...drafts.map(({ id }) => id)) + 1
  const failures: Failures = {}

  const written = (draft: InMemoryDraft): WrittenDraft => ({
    id: draft.id,
    url: `https://github.com/owner/repo/releases/tag/${draft.tagName}`,
    tagName: draft.tagName
  })

  const store: ReleaseStore = {
    listDrafts: () => {
      if (failures.listDrafts) {
        return Promise.reject(failures.listDrafts)
      }
      return Promise.resolve(drafts.map(({ id, tagName, savrManaged }) => ({ id, tagName, savrManaged })))
    },
    createDraft: (content: DraftContent) => {
      if (failures.write) {
        return Promise.reject(failures.write)
      }
      const draft = { id: nextId++, savrManaged: true, ...content }
      drafts = [draft, ...drafts]
      return Promise.resolve(written(draft))
    },
    updateDraft: (id: number, content: DraftContent) => {
      if (failures.write) {
        return Promise.reject(failures.write)
      }
      const draft = drafts.find(candidate => candidate.id === id)
      if (!draft) {
        return Promise.reject(new Error(`No draft with ID ${String(id)}`))
      }
      Object.assign(draft, content, { savrManaged: true })
      return Promise.resolve(written(draft))
    },
    deleteDraft: (id: number) => {
      const failure = failures.deleteDraft?.get(id)
      if (failure) {
        return Promise.reject(failure)
      }
      drafts = drafts.filter(draft => draft.id !== id)
      return Promise.resolve()
    }
  }

  return {
    store,
    failures,
    drafts: () => drafts.map(draft => ({ ...draft })),
    tagNames: () => drafts.map(({ tagName }) => tagName)
  }
}
