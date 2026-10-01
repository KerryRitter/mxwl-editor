import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { AppSettings, JiraIssue, PullRequest, SettingsSnapshot } from '../../shared/types'
import { JiraClient } from './JiraClient'
import { BitbucketClient } from './BitbucketClient'
import { encryptSecret, isEncryptionAvailable } from '../hosts/secrets'
import type { SettingsStore } from '../persistence/SettingsStore'
import type { WorkspaceManager } from '../workspace/WorkspaceManager'

export interface IntegrationsSettingsInput {
  jira?: { host: string; email: string; apiToken?: string } | null
  bitbucket?:
    | { host: string; username: string; appPassword?: string }
    | null
  mcpAuthToken?: string
  ai?: Partial<import('../../shared/types').AiSettings>
  agent?: Partial<import('../../shared/types').AgentSettings>
  notifications?: Partial<import('../../shared/types').AgentNotificationSettings>
  control?: Partial<import('../../shared/types').ControlSettings>
  runtime?: Partial<import('../../shared/types').RuntimeSettings>
  plugins?: Partial<import('../../shared/plugins').PluginSettings>
}

export function registerIntegrationsIpc(
  settingsStore: SettingsStore,
  workspaceManager: WorkspaceManager
): void {
  ipcMain.handle('settings:get', (): SettingsSnapshot => ({
    ...settingsStore.all(),
    encryptionAvailable: isEncryptionAvailable()
  }))
  ipcMain.handle('settings:update', (_e: IpcMainInvokeEvent, input: IntegrationsSettingsInput) => {
    const current = settingsStore.all()
    const patch: Partial<AppSettings> = {}

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
      patch.notifications = { ...current.notifications, ...input.notifications }
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
        enabled: { ...current.plugins.enabled, ...(input.plugins.enabled ?? {}) },
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
                : current.jira?.apiTokenEnc ?? ''
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
                : current.bitbucket?.appPasswordEnc ?? ''
            }
          : null
    }
    return {
      ...settingsStore.update(patch),
      encryptionAvailable: isEncryptionAvailable()
    }
  })

  ipcMain.handle('jira:get', async (_e: IpcMainInvokeEvent, key: string, wsId?: string): Promise<JiraIssue | null> => {
    if (wsId) {
      const ws = workspaceManager.get(wsId)
      const project = ws?.state.projectId ? workspaceManager.projects?.get(ws.state.projectId) : undefined
      if (project?.integrations.taskProvider !== 'jira') return null
    }
    const jira = new JiraClient(settingsStore.all())
    if (!jira.isConfigured()) return null
    try {
      return await jira.getIssue(key)
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  })

  ipcMain.handle('pr:get', async (_e: IpcMainInvokeEvent, wsId: string): Promise<PullRequest | null> => {
    const ws = workspaceManager.get(wsId)
    const project = ws?.state.projectId ? workspaceManager.projects?.get(ws.state.projectId) : undefined
    if (project?.integrations.scmProvider !== 'bitbucket') return null
    const bb = new BitbucketClient(settingsStore.all(), { workspace: project.integrations.repositoryWorkspace, repo: project.integrations.repositorySlug })
    const branch = ws?.state.derived.branch
    if (!branch) return null
    if (!bb.isConfigured()) return null
    try {
      return await bb.prForBranch(branch)
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  })
}
