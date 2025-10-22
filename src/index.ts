import { setFailed } from '@actions/core'

import { run } from '@/main.js'

run().catch((error: unknown) => {
  if (error instanceof Error) {
    setFailed(error.message)
  } else {
    setFailed(`An unexpected error occurred: ${String(error)}`)
  }
})
