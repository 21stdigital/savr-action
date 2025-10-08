import { debug, info, warning } from '@actions/core'

import { VersionType } from '../version/index.js'

export interface Commit {
  type: string
  scope?: string
  subject: string
  message: string
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
const COMMIT_REGEX = new RegExp(`^(${COMMIT_TYPES.join('|')})(!?)(?:\\(([^)]+)\\))?: (.+)`)

export const parseCommit = (message: string): Commit => {
  debug(`Parsing commit message: ${message}`)
  // Extract only the first line for parsing and display
  const firstLine = message.split('\n')[0]
  const match = COMMIT_REGEX.exec(firstLine)

  if (!match) {
    warning('Commit message does not match conventional format, defaulting to chore type')
    return {
      type: 'chore',
      subject: firstLine,
      message: firstLine,
      breaking: false
    }
  }

  const [, type, isBreaking, scope, subject] = match
  const breaking = isBreaking === '!' || message.includes('BREAKING CHANGE:')

  debug(`Parsed commit - Type: ${type}, Scope: ${scope || 'none'}, Breaking: ${String(breaking)}`)
  return {
    type,
    scope,
    subject,
    message: firstLine,
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
