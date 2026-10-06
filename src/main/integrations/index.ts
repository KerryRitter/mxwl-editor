import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type {
  AppSettings,
  JiraIssue,
  PullRequest,
  SettingsSnapshot,
  WorkspaceIssue,
  WorkspaceIntegrations
} from '../../shared/types'
import {
  githubHost,
  githubIssueNumber,
  githubRepository,
  githubRepositoryFromRemote,
  type GitHubAccountInput,
  type GitHubConnectionResult
} from '../../shared/github'
import { JiraClient } from './JiraClient'
import { BitbucketClient } from './BitbucketClient'
import { GitHubClient } from './GitHubClient'
import { shellQuote } from '../workspace/util'
import { encryptSecret, isEncryptionAvailable } from '../hosts/secrets'
import type { SettingsStore } from '../persistence/SettingsStore'
import type { WorkspaceManager } from '../workspace/WorkspaceManager'

export interface IntegrationsSettingsInput {
  github?: GitHubAccountInput | null
  jira?: { host: string; email: string; apiToken?: string } | null
  bitbucket?: { host: string; username: string; appPassword?: string } | null
  mcpAuthToken?: string
  ai?: Partial<import('../../shared/types').AiSettings>
  agent?: Partial<import('../../shared/types').AgentSettings>
  notifications?: Partial<
    import('../../shared/types').AgentNotificationSettings
  >
  control?: Partial<import('../../shared/types').ControlSettings>
  runtime?: Partial<import('../../shared/types').RuntimeSettings>
  plugins?: Partial<import('../../shared/plugins').PluginSettings>
}

function githubAccount(
  input: GitHubAccountInput | null,
  current: AppSettings['github']
): AppSettings['github'] {
  if (!input) return null
  if (!['public', 'cli', 'token'].includes(input.auth))
    throw new Error('Choose a GitHub authentication method.')
  const host = githubHost(input.host).host
  return {
    host,
    auth: input.auth,
    tokenEnc:
      input.auth === 'token'
        ? input.token?.trim()
          ? encryptSecret(input.token.trim())
          : current?.host === host && current.auth === 'token'
            ? current.tokenEnc
            : ''
        : ''
  }
}

export function registerIntegrationsIpc(
  settingsStore: SettingsStore,
  workspaceManager: WorkspaceManager
): void {
  const projectFor = (wsId: string) => {
    const ws = workspaceManager.get(wsId)
    return ws?.state.projectId
      ? workspaceManager.projects?.get(ws.state.projectId)
      : undefined
  }
  const githubFor = async (wsId: string) => {
    const ws = workspaceManager.get(wsId)
    if (!ws) throw new Error('Workspace not found.')
    const project = projectFor(wsId)
    const account = settingsStore.all().github
    const host = githubHost(account?.host)
    let origin = null as ReturnType<typeof githubRepositoryFromRemote>
    try {
      const result = await ws.conn.exec(
        `git -C ${shellQuote(ws.state.remotePath)} remote get-url origin`,
        { timeoutMs: 10_000 }
      )
      if (result.code === 0)
        origin = githubRepositoryFromRemote(result.stdout.trim(), host.host)
    } catch {
      /* Explicit project repository settings also work without an origin. */
    }
    const repository =
      project?.integrations.repositoryWorkspace ||
      project?.integrations.repositorySlug
        ? githubRepository(
            project.integrations.repositoryWorkspace,
            project.integrations.repositorySlug
          )
        : (githubRepositoryFromRemote(
            project?.repositoryUrl ?? '',
            host.host
          ) ?? origin)
    if (!repository)
      throw new Error(
        'Set the GitHub repository owner and name in Projects, or add a GitHub origin remote.'
      )
    return {
      client: new GitHubClient(account, repository),
      repository,
      host,
      headOwner: origin?.owner ?? repository.owner
    }
  }

  ipcMain.handle('settings:get', (): SettingsSnapshot => ({
    ...settingsStore.all(),
    encryptionAvailable: isEncryptionAvailable()
  }))
  ipcMain.handle(
    'settings:update',
    (_e: IpcMainInvokeEvent, input: IntegrationsSettingsInput) => {
      const current = settingsStore.all()
      const patch: Partial<AppSettings> = {}

      if (input.github !== undefined)
        patch.github = githubAccount(input.github, current.github)

      if (input.mcpAuthToken !== undefined) {
        patch.mcpAuthToken = input.mcpAuthToken
      }
      if (input.ai !== undefined) {
        patch.ai = { ...current.ai, ...input.ai }
      }
      if (input.agent !== undefined) {
        patch.agent = { ...current.agent, ...input.agent }
      }
      if (input.notifications !== undefined) {
        patch.notifications = {
          ...current.notifications,
          ...input.notifications
        }
      }
      if (input.control !== undefined) {
        patch.control = {
          ...current.control,
          ...input.control,
          authToken: current.control.authToken
        }
      }
      if (input.runtime !== undefined) {
        patch.runtime = { ...current.runtime, ...input.runtime }
      }
      if (input.plugins !== undefined) {
        patch.plugins = {
          ...current.plugins,
          ...input.plugins,
          enabled: {
            ...current.plugins.enabled,
            ...(input.plugins.enabled ?? {})
          },
          grants: { ...current.plugins.grants, ...(input.plugins.grants ?? {}) }
        }
      }
      if (input.jira !== undefined) {
        patch.jira =
          input.jira && (input.jira.host || input.jira.email)
            ? {
                host: input.jira.host,
                email: input.jira.email,
                apiTokenEnc: input.jira.apiToken
                  ? encryptSecret(input.jira.apiToken)
                  : (current.jira?.apiTokenEnc ?? '')
              }
            : null
      }
      if (input.bitbucket !== undefined) {
        patch.bitbucket =
          input.bitbucket && (input.bitbucket.host || input.bitbucket.username)
            ? {
                host: input.bitbucket.host,
                username: input.bitbucket.username,
                appPasswordEnc: input.bitbucket.appPassword
                  ? encryptSecret(input.bitbucket.appPassword)
                  : (current.bitbucket?.appPasswordEnc ?? '')
              }
            : null
      }
      const saved = settingsStore.update(patch)
      _e.sender.send('settings:changed')
      return {
        ...saved,
        encryptionAvailable: isEncryptionAvailable()
      }
    }
  )

  ipcMain.handle(
    'github:test',
    async (
      _e: IpcMainInvokeEvent,
      input: GitHubAccountInput
    ): Promise<GitHubConnectionResult> => {
      try {
        const account = githubAccount(input, settingsStore.all().github)
        return {
          ok: true,
          message: await new GitHubClient(account).testConnection()
        }
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error ? error.message : 'GitHub connection failed.'
        }
      }
    }
  )

  ipcMain.handle(
    'integrations:context',
    async (
      _e: IpcMainInvokeEvent,
      wsId: string
    ): Promise<WorkspaceIntegrations> => {
      const project = projectFor(wsId)
      const ws = workspaceManager.get(wsId)
      const taskProvider = project?.integrations.taskProvider ?? 'none'
      const scmProvider = project?.integrations.scmProvider ?? 'none'
      const result: WorkspaceIntegrations = {
        taskProvider,
        scmProvider,
        githubRepository: null,
        githubHost: null,
        issueUrl: null,
        repositoryUrl: null,
        pullRequestsUrl: null
      }
      if (
        taskProvider === 'jira' &&
        settingsStore.all().jira?.host &&
        ws?.state.derived.issueKey
      )
        result.issueUrl = `${settingsStore.all().jira!.host.replace(/\/+$/, '')}/browse/${encodeURIComponent(ws.state.derived.issueKey)}`
      if (
        scmProvider === 'bitbucket' &&
        project?.integrations.repositoryWorkspace &&
        project.integrations.repositorySlug
      ) {
        result.repositoryUrl = `https://bitbucket.org/${encodeURIComponent(project.integrations.repositoryWorkspace)}/${encodeURIComponent(project.integrations.repositorySlug)}`
        result.pullRequestsUrl = `${result.repositoryUrl}/pull-requests/`
      }
      if (taskProvider === 'github-issues' || scmProvider === 'github') {
        try {
          const { repository, host } = await githubFor(wsId)
          const base = `${host.web}/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`
          result.githubRepository = repository
          result.githubHost = host.host
          if (scmProvider === 'github') {
            result.repositoryUrl = base
            result.pullRequestsUrl = `${base}/pulls`
          }
          if (taskProvider === 'github-issues' && ws?.state.derived.issueKey) {
            const number = githubIssueNumber(
              ws.state.derived.issueKey,
              repository,
              host.host
            )
            if (number) result.issueUrl = `${base}/issues/${number}`
          }
        } catch (error) {
          result.error =
            error instanceof Error
              ? error.message
              : 'Could not resolve the GitHub repository.'
        }
      }
      return result
    }
  )

  ipcMain.handle(
    'issue:get',
    async (
      _e: IpcMainInvokeEvent,
      key: string,
      wsId: string
    ): Promise<WorkspaceIssue | null> => {
      const provider = projectFor(wsId)?.integrations.taskProvider
      if (provider === 'github-issues')
        return (await githubFor(wsId)).client.getIssue(key)
      if (provider === 'jira') {
        const jira = new JiraClient(settingsStore.all())
        const issue = jira.isConfigured() ? await jira.getIssue(key) : null
        return issue ? { ...issue, provider: 'jira' } : null
      }
      return null
    }
  )

  ipcMain.handle(
    'github:issues',
    async (_e: IpcMainInvokeEvent, wsId: string): Promise<WorkspaceIssue[]> => {
      if (projectFor(wsId)?.integrations.taskProvider !== 'github-issues')
        return []
      return (await githubFor(wsId)).client.recentIssues()
    }
  )

  ipcMain.handle(
    'jira:get',
    async (
      _e: IpcMainInvokeEvent,
      key: string,
      wsId?: string
    ): Promise<JiraIssue | null> => {
      if (wsId) {
        const ws = workspaceManager.get(wsId)
        const project = ws?.state.projectId
          ? workspaceManager.projects?.get(ws.state.projectId)
          : undefined
        if (project?.integrations.taskProvider !== 'jira') return null
      }
      const jira = new JiraClient(settingsStore.all())
      if (!jira.isConfigured()) return null
      try {
        return await jira.getIssue(key)
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : String(err))
      }
    }
  )

  ipcMain.handle(
    'pr:get',
    async (
      _e: IpcMainInvokeEvent,
      wsId: string
    ): Promise<PullRequest | null> => {
      const ws = workspaceManager.get(wsId)
      const project = ws?.state.projectId
        ? workspaceManager.projects?.get(ws.state.projectId)
        : undefined
      const branch = ws?.state.derived.branch
      if (!branch) return null
      if (project?.integrations.scmProvider === 'github') {
        const { client, headOwner } = await githubFor(wsId)
        return client.prForBranch(branch, headOwner)
      }
      if (project?.integrations.scmProvider !== 'bitbucket') return null
      const bb = new BitbucketClient(settingsStore.all(), {
        workspace: project.integrations.repositoryWorkspace,
        repo: project.integrations.repositorySlug
      })
      if (!bb.isConfigured()) return null
      try {
        return await bb.prForBranch(branch)
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : String(err))
      }
    }
  )
}
