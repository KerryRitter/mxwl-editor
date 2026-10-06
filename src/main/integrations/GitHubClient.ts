import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { PullRequest, WorkspaceIssue } from '../../shared/types'
import {
  githubHost,
  githubIssueNumber,
  type GitHubAccount,
  type GitHubRepository
} from '../../shared/github'
import { decryptSecret } from '../hosts/secrets'

const runFile = promisify(execFile)

export async function githubCliToken(host: string): Promise<string> {
  try {
    const { stdout } = await runFile(
      'gh',
      ['auth', 'token', '--hostname', host],
      {
        timeout: 10_000,
        maxBuffer: 64 * 1024,
        windowsHide: true
      }
    )
    const token = stdout.trim()
    if (token) return token
  } catch {
    /* CLI errors can contain credentials, so never forward their output. */
  }
  throw new Error(
    `Sign in to GitHub CLI on the computer running mxwl: gh auth login --hostname ${host}`
  )
}

type IssueResponse = {
  number: number
  title: string
  state: string
  html_url: string
  body?: string | null
  labels?: Array<string | { name?: string }>
  assignee?: { login: string } | null
  pull_request?: unknown
}
type PullResponse = {
  number: number
  title: string
  state: string
  html_url: string
  user?: { login: string }
  draft?: boolean
}

export class GitHubClient {
  constructor(
    private account: GitHubAccount | null,
    private repository?: GitHubRepository,
    private readCliToken: (host: string) => Promise<string> = githubCliToken
  ) {}

  private repositoryPath(): string {
    if (!this.repository)
      throw new Error('Choose a GitHub repository in the project integrations.')
    return `/repos/${encodeURIComponent(this.repository.owner)}/${encodeURIComponent(this.repository.repo)}`
  }

  private async request<T>(
    path: string,
    missingIsNull = false
  ): Promise<T | null> {
    const { host, api } = githubHost(this.account?.host)
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'mxwl-editor'
    }
    if (this.account?.auth === 'cli')
      headers.Authorization = `Bearer ${await this.readCliToken(host)}`
    if (this.account?.auth === 'token') {
      const token = decryptSecret(this.account.tokenEnc)
      if (!token)
        throw new Error(
          'Add a GitHub token in Settings → Accounts, or use GitHub CLI authentication.'
        )
      headers.Authorization = `Bearer ${token}`
    }
    const response = await fetch(api + path, {
      headers,
      signal: AbortSignal.timeout(15_000)
    })
    if (response.status === 404 && missingIsNull) return null
    if (!response.ok) {
      if (response.status === 401)
        throw new Error(
          'GitHub authentication failed. Sign in again or replace the token in Settings → Accounts.'
        )
      if (response.status === 403 || response.status === 429) {
        if (
          response.headers.get('x-ratelimit-remaining') === '0' ||
          response.status === 429
        )
          throw new Error(
            'GitHub API rate limit reached. Authenticate in Settings → Accounts or try again later.'
          )
        throw new Error(
          'GitHub access denied. Check repository permissions and your organization’s SSO authorization.'
        )
      }
      if (response.status === 404)
        throw new Error(
          'GitHub repository not found or inaccessible. Check the project repository and account access.'
        )
      throw new Error(`GitHub request failed (${response.status}).`)
    }
    return response.json() as Promise<T>
  }

  private issue(issue: IssueResponse): WorkspaceIssue {
    return {
      provider: 'github-issues',
      key: `#${issue.number}`,
      summary: issue.title,
      status: issue.state,
      url: issue.html_url,
      assignee: issue.assignee?.login,
      body: issue.body ?? '',
      labels: (issue.labels ?? [])
        .map((label) =>
          typeof label === 'string' ? label : (label.name ?? '')
        )
        .filter(Boolean)
    }
  }

  async getIssue(reference: string): Promise<WorkspaceIssue | null> {
    if (!this.repository)
      throw new Error('Choose a GitHub repository in the project integrations.')
    const number = githubIssueNumber(
      reference,
      this.repository,
      this.account?.host
    )
    if (!number)
      throw new Error(
        'Enter a GitHub issue number (#123), GH-123, or an issue URL from this project’s repository.'
      )
    const issue = await this.request<IssueResponse>(
      `${this.repositoryPath()}/issues/${number}`,
      true
    )
    return issue && !issue.pull_request ? this.issue(issue) : null
  }

  async recentIssues(): Promise<WorkspaceIssue[]> {
    const issues = await this.request<IssueResponse[]>(
      `${this.repositoryPath()}/issues?state=open&sort=updated&direction=desc&per_page=50`
    )
    return (issues ?? [])
      .filter((issue) => !issue.pull_request)
      .map((issue) => this.issue(issue))
  }

  async prForBranch(
    branch: string,
    headOwner = this.repository?.owner
  ): Promise<PullRequest | null> {
    if (!branch || !this.repository) return null
    const query = new URLSearchParams({
      state: 'open',
      head: `${headOwner}:${branch}`,
      sort: 'updated',
      direction: 'desc',
      per_page: '1'
    })
    const pulls = await this.request<PullResponse[]>(
      `${this.repositoryPath()}/pulls?${query}`
    )
    const pr = pulls?.[0]
    return pr
      ? {
          provider: 'github',
          id: pr.number,
          title: pr.title,
          state: pr.state,
          url: pr.html_url,
          author: pr.user?.login,
          draft: pr.draft ?? false
        }
      : null
  }

  async testConnection(): Promise<string> {
    if (!this.account || this.account.auth === 'public') {
      await this.request('/rate_limit')
      return 'Connected to GitHub. Public repositories are available; sign in for private repositories.'
    }
    const user = await this.request<{ login: string }>('/user')
    return `Connected to GitHub as ${user?.login ?? 'your account'}.`
  }
}
