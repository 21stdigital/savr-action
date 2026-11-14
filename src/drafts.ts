import { info, warning } from '@actions/core'
import { valid } from 'semver'

export interface StoredDraft {
  id: number
  tagName: string
  savrManaged: boolean
}

export interface DraftContent {
  tagName: string
  name: string
  notes: string
  targetCommitish: string
}

export interface WrittenDraft {
  id: number
  url: string
  tagName: string
}

// The seam between Draft Release reconciliation and wherever releases live.
export interface ReleaseStore {
  // Every Draft Release, newest first.
  listDrafts: () => Promise<StoredDraft[]>
  createDraft: (content: DraftContent) => Promise<WrittenDraft>
  updateDraft: (id: number, content: DraftContent) => Promise<WrittenDraft>
  // Resolves once the draft is gone, including when it already was.
  deleteDraft: (id: number) => Promise<void>
}

export interface ReconcileOptions {
  tagPrefix: string
  // The Draft Release this run writes; absent when there is nothing to release.
  draft?: DraftContent
  dryRun: boolean
}

export interface ReconcileResult {
  release?: WrittenDraft
  // The Superseded Drafts this run found: deleted, or only reported in a dry
  // run. A draft that could not be deleted is still listed; it was warned about.
  superseded: StoredDraft[]
}

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err))

// A draft belongs to this run's Tag Prefix when its tag name is that prefix
// followed by a semver version. With an empty prefix, semver's tolerance of a
// leading `v` lets `v1.2.0` match too, as getLatestVersion does.
const hasTagPrefix = (tagName: string, tagPrefix: string): boolean =>
  tagName.startsWith(tagPrefix) && valid(tagName.slice(tagPrefix.length)) != null

export const reconcileDraftReleases = async (
  store: ReleaseStore,
  options: ReconcileOptions
): Promise<ReconcileResult> => {
  const { draft } = options

  let drafts: StoredDraft[]
  try {
    drafts = await store.listDrafts()
  } catch (err) {
    // Writing the draft is the run's job; cleanup alone is not worth failing it.
    if (draft) {
      throw err
    }
    warning(`Failed to list Draft Releases for cleanup: ${errorMessage(err)}`)
    return { superseded: [] }
  }
  const current = draft ? drafts.find(({ tagName }) => tagName === draft.tagName) : undefined
  const superseded = drafts.filter(
    candidate => candidate !== current && candidate.savrManaged && hasTagPrefix(candidate.tagName, options.tagPrefix)
  )

  if (options.dryRun) {
    if (draft) {
      info(
        current
          ? `Dry run - would update Draft Release ${draft.tagName} (ID: ${String(current.id)})`
          : `Dry run - would create Draft Release ${draft.tagName}`
      )
    }
    for (const { id, tagName } of superseded) {
      info(`Dry run - would delete Superseded Draft ${tagName} (ID: ${String(id)})`)
    }
    return { superseded }
  }

  let release: WrittenDraft | undefined
  if (draft) {
    release = current ? await store.updateDraft(current.id, draft) : await store.createDraft(draft)
  }

  // Best-effort: a draft that cannot be deleted is reported and skipped, so
  // cleanup never fails the run.
  for (const { id, tagName } of superseded) {
    info(`Deleting Superseded Draft ${tagName} (ID: ${String(id)})`)
    try {
      await store.deleteDraft(id)
    } catch (err) {
      warning(`Failed to delete Superseded Draft ${tagName} (ID: ${String(id)}): ${errorMessage(err)}`)
    }
  }

  return { release, superseded }
}
