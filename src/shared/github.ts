export type GitHubRepository = { owner: string; repo: string }
export type GitHubAccount = {
  host: string
  auth: 'public' | 'cli' | 'token'
  tokenEnc: string
}
export type GitHubAccountInput = Omit<GitHubAccount, 'tokenEnc'> & {
  token?: string
}
export type GitHubConnectionResult = { ok: boolean; message: string }

export function githubHost(input = 'github.com'): {
  host: string
  web: string
  api: string
} {
  const value = input.trim() || 'github.com'
  const url = new URL(value.includes('://') ? value : `https://${value}`)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['/', '/api/v3', '/api/v3/'].includes(url.pathname)
  )
    throw new Error(
      'Use a GitHub HTTPS hostname, such as github.com or github.example.com.'
    )
  const host =
    url.host === 'api.github.com' ? 'github.com' : url.host.toLowerCase()
  return {
    host,
    web: `https://${host}`,
    api:
      host === 'github.com'
        ? 'https://api.github.com'
        : `https://${host}/api/v3`
  }
}

export function githubRepository(
  owner: string,
  repo: string
): GitHubRepository {
  const result = {
    owner: owner.trim(),
    repo: repo.trim().replace(/\.git$/, '')
  }
  if (
    ![result.owner, result.repo].every(
      (part) => /^[A-Za-z0-9_.-]+$/.test(part) && !['.', '..'].includes(part)
    )
  )
    throw new Error(
      'Set a GitHub repository owner and repository name in the project integrations.'
    )
  return result
}

export function githubRepositoryFromRemote(
  remote: string,
  host = 'github.com'
): GitHubRepository | null {
  const scp = /^[^@\s]+@([^:]+):(.+)$/.exec(remote.trim())
  try {
    const url = scp
      ? new URL(`https://${scp[1]}/${scp[2]}`)
      : new URL(remote.trim())
    if (url.hostname.toLowerCase() !== new URL(githubHost(host).web).hostname)
      return null
    const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/')
    return parts.length === 2 ? githubRepository(parts[0], parts[1]) : null
  } catch {
    return null
  }
}

export function githubIssueNumber(
  reference: string,
  repository: GitHubRepository,
  host = 'github.com'
): number | null {
  let value = reference.trim()
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value)
      if (url.origin !== githubHost(host).web) return null
      const match = /^\/([^/]+)\/([^/]+)\/issues\/(\d+)\/?$/.exec(url.pathname)
      if (
        !match ||
        match[1].toLowerCase() !== repository.owner.toLowerCase() ||
        match[2].toLowerCase() !== repository.repo.toLowerCase()
      )
        return null
      value = match[3]
    } catch {
      return null
    }
  }
  const qualified = /^([^/]+)\/([^#]+)#(\d+)$/.exec(value)
  if (qualified) {
    if (
      qualified[1].toLowerCase() !== repository.owner.toLowerCase() ||
      qualified[2].toLowerCase() !== repository.repo.toLowerCase()
    )
      return null
    value = qualified[3]
  }
  const match = /^(?:#|GH-)?([1-9]\d*)$/i.exec(value)
  const number = match ? Number(match[1]) : NaN
  return Number.isSafeInteger(number) && number > 0 ? number : null
}
