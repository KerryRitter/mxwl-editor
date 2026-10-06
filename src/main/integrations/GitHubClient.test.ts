import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('../hosts/secrets', () => ({
  decryptSecret: (value: string) => value.replace('encrypted:', '')
}))
import { GitHubClient } from './GitHubClient'

const repository = { owner: 'acme', repo: 'checkout' }
const issue = {
  number: 42,
  title: 'Fix checkout',
  state: 'open',
  html_url: 'https://github.com/acme/checkout/issues/42',
  body: 'Keep failed payments out.',
  labels: ['bug', { name: 'payments' }],
  assignee: { login: 'developer' }
}
afterEach(() => vi.unstubAllGlobals())

describe('GitHub API integration', () => {
  it('fetches issues with a stored token and maps useful agent context', async () => {
    const request = vi.fn().mockResolvedValue(Response.json(issue))
    vi.stubGlobal('fetch', request)
    const client = new GitHubClient(
      {
        host: 'github.com',
        auth: 'token',
        tokenEnc: 'encrypted:fixture-token'
      },
      repository
    )
    expect(await client.getIssue('#42')).toEqual({
      provider: 'github-issues',
      key: '#42',
      summary: 'Fix checkout',
      status: 'open',
      url: issue.html_url,
      body: issue.body,
      assignee: 'developer',
      labels: ['bug', 'payments']
    })
    const [url, options] = request.mock.calls[0]
    expect(url).toBe('https://api.github.com/repos/acme/checkout/issues/42')
    expect(options.headers.Authorization).toBe('Bearer fixture-token')
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })
  it('uses the existing CLI account without sending credentials to another host', async () => {
    const token = vi.fn().mockResolvedValue('cli-fixture-token')
    const request = vi.fn().mockResolvedValue(Response.json(issue))
    vi.stubGlobal('fetch', request)
    const client = new GitHubClient(
      { host: 'ghe.acme.test', auth: 'cli', tokenEnc: '' },
      repository,
      token
    )
    await client.getIssue('GH-42')
    expect(token).toHaveBeenCalledWith('ghe.acme.test')
    expect(request.mock.calls[0][0]).toBe(
      'https://ghe.acme.test/api/v3/repos/acme/checkout/issues/42'
    )
    expect(request.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer cli-fixture-token'
    )
    await expect(
      client.getIssue('https://github.com/other/repo/issues/42')
    ).rejects.toThrow('this project')
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('supports public repositories and filters PRs out of the issue picker', async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        Response.json([
          issue,
          { ...issue, number: 43, pull_request: { url: 'pull/43' } }
        ])
      )
    vi.stubGlobal('fetch', request)
    const issues = await new GitHubClient(null, repository).recentIssues()
    expect(issues.map((issue) => issue.key)).toEqual(['#42'])
    expect(request.mock.calls[0][1].headers.Authorization).toBeUndefined()
  })
  it('looks up draft PRs by the exact source branch, including fork owners', async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        Response.json([
          {
            number: 88,
            title: 'Fix checkout',
            state: 'open',
            html_url: 'https://github.com/acme/checkout/pull/88',
            user: { login: 'developer' },
            draft: true
          }
        ])
      )
    vi.stubGlobal('fetch', request)
    const client = new GitHubClient(null, repository)
    expect(
      await client.prForBranch('fix/checkout+payment', 'developer')
    ).toMatchObject({
      provider: 'github',
      id: 88,
      draft: true,
      author: 'developer'
    })
    const url = new URL(request.mock.calls[0][0])
    expect(url.searchParams.get('head')).toBe('developer:fix/checkout+payment')
    expect(url.searchParams.get('state')).toBe('open')
  })
  it('returns no issue for missing issues or PR numbers and no PR for an empty result', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('', { status: 404 }))
        .mockResolvedValueOnce(Response.json({ ...issue, pull_request: {} }))
        .mockResolvedValueOnce(Response.json([]))
    )
    const client = new GitHubClient(null, repository)
    expect(await client.getIssue('#404')).toBeNull()
    expect(await client.getIssue('#42')).toBeNull()
    expect(await client.prForBranch('main')).toBeNull()
  })
  it.each([
    [401, {}, 'authentication'],
    [403, {}, 'access denied'],
    [429, {}, 'rate limit'],
    [403, { 'x-ratelimit-remaining': '0' }, 'rate limit'],
    [404, {}, 'inaccessible']
  ])(
    'reports actionable API errors for status %s',
    async (status, headers, message) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            new Response('', {
              status: Number(status),
              headers: headers as Record<string, string>
            })
          )
      )
      await expect(
        new GitHubClient(null, repository).recentIssues()
      ).rejects.toThrow(String(message))
    }
  )
})
