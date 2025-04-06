import { VersionType } from '@/version/index.js'

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

const COMMIT_REGEX = /^(feat|fix|chore|docs|refactor|perf|test)(!?)(?:\(([^)]+)\))?: (.+)/

export const parseCommit = (message: string): Commit => {
  const match = COMMIT_REGEX.exec(message)

  if (!match) {
    return {
      type: 'chore',
      subject: message,
      message,
      breaking: false
    }
  }

  const [, type, isBreaking, scope, subject] = match
  const breaking = isBreaking === '!' || message.includes('BREAKING CHANGE:')

  return {
    type,
    scope,
    subject,
    message,
    breaking
  }
}

export const categorizeCommits = (commits: Commit[]): CategorizedCommits => ({
  features: commits.filter(({ type }) => type === 'feat'),
  fixes: commits.filter(({ type }) => type === 'fix'),
  breaking: commits.filter(({ breaking }) => breaking)
})

export const determineVersionBump = (categorizedCommits: CategorizedCommits): VersionType | undefined => {
  if (categorizedCommits.breaking.length > 0) return 'major'
  if (categorizedCommits.features.length > 0) return 'minor'
  if (categorizedCommits.fixes.length > 0) return 'patch'

  return undefined
}
