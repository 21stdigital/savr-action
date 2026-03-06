import { debug, info, warning } from '@actions/core'

import { sanitizeLogOutput } from './utils.js'
import { VersionType } from './version.js'

export interface Commit {
  type: string
  scope?: string
  subject: string
  message: string
  body?: string
  breaking: boolean
}

export interface CategorizedCommits {
  features: Commit[]
  fixes: Commit[]
  breaking: Commit[]
}

const COMMIT_TYPES = [
  'feat',
  'fix',
  'chore',
  'docs',
  'refactor',
  'perf',
  'test',
  'ci',
  'style',
  'revert',
  'build'
] as const
const COMMIT_REGEX = new RegExp(`^(${COMMIT_TYPES.join('|')})(?:\\(([^)]+)\\))?(!?):\\s*(.+)`)

export const parseCommit = (message: string): Commit => {
  // Sanitize commit message to prevent workflow command injection in debug logs
  debug(`Parsing commit message: ${sanitizeLogOutput(message)}`)
  // Keep first line for conventional commit parsing and retain the rest as body.
  const [firstLine, ...remainingLines] = message.split(/\r?\n/)
  const body = remainingLines.join('\n').trim()
  const match = COMMIT_REGEX.exec(firstLine)

  if (!match) {
    warning('Commit message does not match conventional format, defaulting to chore type')
    return {
      type: 'chore',
      subject: firstLine,
      message: firstLine,
      body,
      breaking: false
    }
  }

  const [, type, scope, isBreaking, subject] = match
  const breaking = isBreaking === '!' || /BREAKING[ -]CHANGE:/.test(message)

  debug(`Parsed commit - Type: ${type}, Scope: ${scope || 'none'}, Breaking: ${String(breaking)}`)
  return {
    type,
    scope,
    subject,
    message: firstLine,
    body,
    breaking
  }
}

export const categorizeCommits = (commits: Commit[]): CategorizedCommits => {
  debug(`Categorizing ${String(commits.length)} commits`)

  const categorized = {
    features: commits.filter(({ type }) => type === 'feat'),
    fixes: commits.filter(({ type }) => type === 'fix'),
    breaking: commits.filter(({ breaking }) => breaking)
  }

  info(`Categorization results:
    - Features: ${String(categorized.features.length)}
    - Fixes: ${String(categorized.fixes.length)}
    - Breaking changes: ${String(categorized.breaking.length)}`)

  return categorized
}

export const determineVersionBump = (categorizedCommits: CategorizedCommits): VersionType | undefined => {
  debug('Determining version bump based on categorized commits')

  if (categorizedCommits.breaking.length > 0) {
    info('Breaking changes detected - major version bump required')
    return 'major'
  }
  if (categorizedCommits.features.length > 0) {
    info('New features detected - minor version bump required')
    return 'minor'
  }
  if (categorizedCommits.fixes.length > 0) {
    info('Bug fixes detected - patch version bump required')
    return 'patch'
  }

  debug('No version bump required')
  return undefined
}
