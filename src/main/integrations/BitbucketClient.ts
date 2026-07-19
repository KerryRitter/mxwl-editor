import type { AppSettings, PullRequest } from '../../shared/types'
import { decryptSecret } from '../hosts/secrets'

function apiBase(host: string): string {
  const trimmed = host.replace(/\/+$/, '')
  if (trimmed.length === 0 || /api\.bitbucket\.org/.test(trimmed)) {
    return 'https://api.bitbucket.org/2.0'
  }
  return trimmed
}

export class BitbucketClient {
  constructor(private settings: AppSettings) {}

  isConfigured(): boolean {
    return Boolean(this.settings.bitbucket?.workspace && this.settings.bitbucket?.repo)
  }

  async prForBranch(branch: string): Promise<PullRequest | null> {
    const s = this.settings.bitbucket
    if (!s || !branch) return null
    const pass = decryptSecret(s.appPasswordEnc)
    const auth = Buffer.from(`${s.username}:${pass}`).toString('base64')
    const url = `${apiBase(s.host)}/repositories/${s.workspace}/${s.repo}/pullrequests?q=${encodeURIComponent(
      `source.branch.name="${branch}"`
    )}&pagelen=1`
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' }
    })
    if (!res.ok) throw new Error(`Bitbucket request failed (${res.status})`)
    const json = (await res.json()) as {
      values?: Array<{
        id: number
        title: string
        state: string
        links?: { html?: { href?: string } }
        author?: { display_name?: string }
      }>
    }
    const pr = json.values?.[0]
    if (!pr) return null
    return {
      id: pr.id,
      title: pr.title,
      state: pr.state,
      url: pr.links?.html?.href ?? '',
      author: pr.author?.display_name
    }
  }
}
