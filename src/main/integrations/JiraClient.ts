import type { AppSettings, JiraIssue } from '../../shared/types'
import { decryptSecret } from '../hosts/secrets'

function trimHost(host: string): string {
  return host.replace(/\/+$/, '')
}

export class JiraClient {
  constructor(private settings: AppSettings) {}

  isConfigured(): boolean {
    return Boolean(this.settings.jira?.host && this.settings.jira?.email)
  }

  async getIssue(key: string): Promise<JiraIssue | null> {
    const s = this.settings.jira
    if (!s) return null
    const token = decryptSecret(s.apiTokenEnc)
    const auth = Buffer.from(`${s.email}:${token}`).toString('base64')
    const url = `${trimHost(s.host)}/rest/api/3/issue/${encodeURIComponent(
      key
    )}?fields=summary,status,labels,assignee`
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' }
    })
    if (!res.ok) throw new Error(`Jira request failed (${res.status})`)
    const json = (await res.json()) as {
      key: string
      fields: {
        summary: string
        status?: { name: string }
        labels?: string[]
        assignee?: { displayName: string }
      }
    }
    return {
      key: json.key,
      summary: json.fields.summary,
      status: json.fields.status?.name ?? '',
      labels: json.fields.labels ?? [],
      assignee: json.fields.assignee?.displayName,
      url: `${trimHost(s.host)}/browse/${json.key}`
    }
  }
}
