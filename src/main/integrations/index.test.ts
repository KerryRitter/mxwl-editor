import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings } from '../../shared/types'
import type { SettingsStore } from '../persistence/SettingsStore'
import type { WorkspaceManager } from '../workspace/WorkspaceManager'
import { emptyProject } from '../../shared/projects'

const handlers = vi.hoisted(() => new Map<string, (...args: any[]) => any>())
vi.mock('electron', () => ({
  ipcMain: {
    handle: (name: string, handler: (...args: any[]) => any) =>
      handlers.set(name, handler)
  }
}))
vi.mock('../hosts/secrets', () => ({
  encryptSecret: (value: string) => `encrypted:${value}`,
  decryptSecret: (value: string) => value.replace('encrypted:', ''),
  isEncryptionAvailable: () => true
}))
import { registerIntegrationsIpc } from './index'

const event = { sender: { send: vi.fn() } }
let current: AppSettings
let project: ReturnType<typeof emptyProject>
let origin: string
beforeEach(() => {
  current = { github: null, jira: null, bitbucket: null } as AppSettings
  project = emptyProject()
  project.integrations.taskProvider = 'github-issues'
  project.integrations.scmProvider = 'github'
  origin = 'git@github.com:acme/checkout.git'
  handlers.clear()
  event.sender.send.mockClear()
  registerIntegrationsIpc(
    {
      all: () => structuredClone(current),
      update: (patch) => {
        current = { ...current, ...patch }
        return current
      }
    } as SettingsStore,
    {
      get: () => ({
        state: {
          projectId: 'project',
          remotePath: '/work/checkout',
          derived: { issueKey: 'GH-42', branch: 'fix/payment-retries' }
        },
        conn: { exec: async () => ({ code: 0, stdout: origin }) }
      }),
      projects: { get: () => project }
    } as unknown as WorkspaceManager
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('GitHub integration IPC', () => {
  it('encrypts account tokens, keeps them on blank updates, and clears them on host or method changes', () => {
    const update = handlers.get('settings:update')!
    update(event, {
      github: {
        host: 'https://github.com',
        auth: 'token',
        token: 'fixture-token'
      }
    })
    expect(current.github?.tokenEnc).toBe('encrypted:fixture-token')
    update(event, { github: { host: 'github.com', auth: 'token' } })
    expect(current.github?.tokenEnc).toBe('encrypted:fixture-token')
    update(event, { github: { host: 'ghe.example.test', auth: 'token' } })
    expect(current.github?.tokenEnc).toBe('')
    update(event, {
      github: {
        host: 'ghe.example.test',
        auth: 'token',
        token: 'new-fixture-token'
      }
    })
    update(event, { github: { host: 'ghe.example.test', auth: 'cli' } })
    expect(current.github?.tokenEnc).toBe('')
    expect(event.sender.send).toHaveBeenCalledWith('settings:changed')
  })
  it('validates the account before changing saved settings', () => {
    expect(() =>
      handlers.get('settings:update')!(event, {
        github: { host: 'http://github.com', auth: 'token', token: 'fixture' }
      })
    ).toThrow('HTTPS')
    expect(current.github).toBeNull()
  })
  it('infers the repository and issue URL from the checkout origin', async () => {
    const context = await handlers.get('integrations:context')!(
      event,
      'workspace'
    )
    expect(context).toMatchObject({
      taskProvider: 'github-issues',
      scmProvider: 'github',
      githubRepository: { owner: 'acme', repo: 'checkout' },
      issueUrl: 'https://github.com/acme/checkout/issues/42',
      pullRequestsUrl: 'https://github.com/acme/checkout/pulls'
    })
  })
  it('uses explicit upstream repository settings and the fork owner to look up the current PR', async () => {
    project.integrations.repositoryWorkspace = 'upstream'
    project.integrations.repositorySlug = 'checkout'
    origin = 'git@github.com:developer/checkout.git'
    const request = vi
      .fn()
      .mockResolvedValue(
        Response.json([
          {
            number: 88,
            title: 'Fix retries',
            state: 'open',
            html_url: 'https://github.com/upstream/checkout/pull/88'
          }
        ])
      )
    vi.stubGlobal('fetch', request)
    const pr = await handlers.get('pr:get')!(event, 'workspace')
    expect(pr.url).toContain('upstream/checkout/pull/88')
    const url = new URL(request.mock.calls[0][0])
    expect(url.pathname).toBe('/repos/upstream/checkout/pulls')
    expect(url.searchParams.get('head')).toBe('developer:fix/payment-retries')
  })
  it('dispatches issue lookup to GitHub and keeps unsupported providers from making requests', async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          number: 42,
          title: 'Fix retries',
          state: 'open',
          html_url: 'https://github.com/acme/checkout/issues/42'
        })
      )
    vi.stubGlobal('fetch', request)
    expect(
      await handlers.get('issue:get')!(event, '#42', 'workspace')
    ).toMatchObject({ provider: 'github-issues', key: '#42' })
    project.integrations.taskProvider = 'none'
    expect(
      await handlers.get('issue:get')!(event, '#42', 'workspace')
    ).toBeNull()
    expect(await handlers.get('github:issues')!(event, 'workspace')).toEqual([])
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('preserves Jira issue lookup in mixed Jira/GitHub projects', async () => {
    project.integrations.taskProvider = 'jira'
    current.jira = {
      host: 'https://jira.example.test',
      email: 'fixture@example.test',
      apiTokenEnc: 'encrypted:fixture'
    }
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({
            key: 'PAY-42',
            fields: {
              summary: 'Fix retries',
              status: { name: 'In Progress' },
              labels: ['payments']
            }
          })
        )
    )
    expect(
      await handlers.get('issue:get')!(event, 'PAY-42', 'workspace')
    ).toMatchObject({ provider: 'jira', key: 'PAY-42', summary: 'Fix retries' })
  })
})
