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
    | { host: string; username: string; appPassword?: string; workspace: string; repo: string }
    | null
  defaultBrowserUrl?: string
  mcpAuthToken?: string
  taskProvider?: import('../../shared/types').TaskProviderId
  scmProvider?: import('../../shared/types').ScmProviderId
}

export function registerIntegrationsIpc(
  settingsStore: SettingsStore,
  workspaceManager: WorkspaceManager
): void {
  function client(): { jira: JiraClient; bb: BitbucketClient; settings: AppSettings } {
    const settings = settingsStore.all()
    return { jira: new JiraClient(settings), bb: new BitbucketClient(settings), settings }
  }

  ipcMain.handle('settings:get', (): SettingsSnapshot => ({
    ...settingsStore.all(),
    encryptionAvailable: isEncryptionAvailable()
  }))
  ipcMain.handle('settings:update', (_e: IpcMainInvokeEvent, input: IntegrationsSettingsInput) => {
    const current = settingsStore.all()
    const patch: Partial<AppSettings> = {}
    if (input.defaultBrowserUrl !== undefined) {
      patch.defaultBrowserUrl = input.defaultBrowserUrl
    }
    if (input.mcpAuthToken !== undefined) {
      patch.mcpAuthToken = input.mcpAuthToken
    }
    if (input.taskProvider !== undefined) {
      patch.taskProvider = input.taskProvider
    }
    if (input.scmProvider !== undefined) {
      patch.scmProvider = input.scmProvider
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
        input.bitbucket && (input.bitbucket.workspace || input.bitbucket.repo)
          ? {
              host: input.bitbucket.host,
              username: input.bitbucket.username,
              appPasswordEnc: input.bitbucket.appPassword
                ? encryptSecret(input.bitbucket.appPassword)
                : current.bitbucket?.appPasswordEnc ?? '',
              workspace: input.bitbucket.workspace,
              repo: input.bitbucket.repo
            }
          : null
    }
    return {
      ...settingsStore.update(patch),
      encryptionAvailable: isEncryptionAvailable()
    }
  })

  ipcMain.handle('jira:get', async (_e: IpcMainInvokeEvent, key: string): Promise<JiraIssue | null> => {
    const { jira } = client()
    if (!jira.isConfigured()) return null
    try {
      return await jira.getIssue(key)
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  })

  ipcMain.handle('pr:get', async (_e: IpcMainInvokeEvent, wsId: string): Promise<PullRequest | null> => {
    const { bb } = client()
    const ws = workspaceManager.get(wsId)
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
