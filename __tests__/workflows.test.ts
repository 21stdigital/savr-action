import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { SAVR_MARKER } from '../src/github.js'

describe('workflows', () => {
  it('stale-draft-release.yml finds SAVR drafts by the same marker the action writes', () => {
    const workflowPath = fileURLToPath(new URL('../.github/workflows/stale-draft-release.yml', import.meta.url))
    const workflow = readFileSync(workflowPath, 'utf8')

    expect(workflow).toContain(`SAVR_MARKER: '${SAVR_MARKER}'`)
  })
})
