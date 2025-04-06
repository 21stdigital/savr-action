export interface Tag {
  name: string
  version: string
}

export interface Commit {
  type: string
  scope?: string
  subject: string
  message: string
  breaking: boolean
}
