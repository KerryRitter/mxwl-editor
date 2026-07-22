import { randomUUID } from 'crypto'
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { AuthConfig, HostConfig, HostInput, TestLoginConfig, TestResult } from '../../shared/types'
import { DEFAULT_DERIVE, DEFAULT_HIDE, emptyServices } from '../../shared/hostDefaults'
import { HostManager, buildConnectConfig, expandHome } from './HostManager'
import { HostStore } from './store'
import { encryptSecret } from './secrets'

export { HostManager, HostStore, buildConnectConfig, expandHome }

function resolveAuth(input: HostInput, existing?: HostConfig): AuthConfig {
  if (input.kind === 'local' || input.auth.kind === 'none') {
    return { kind: 'none' }
  }
  if (input.auth.kind === 'key') {
    const keep = existing?.auth.kind === 'key' ? existing.auth.encryptedPassphrase : undefined
    return {
      kind: 'key',
      keyPath: expandHome(input.auth.keyPath),
      encryptedPassphrase: input.auth.passphrase
        ? encryptSecret(input.auth.passphrase)
        : keep
    }
  }
  if (input.auth.kind === 'password') {
    const keep = existing?.auth.kind === 'password' ? existing.auth.encryptedPassword : undefined
    return {
      kind: 'password',
      encryptedPassword: input.auth.password ? encryptSecret(input.auth.password) : keep ?? ''
    }
  }
  return { kind: 'agent' }
}

function resolveTestLogin(
  input: HostInput,
  existing?: HostConfig
): TestLoginConfig | undefined {
  if (input.testLogin === null) return undefined
  if (input.testLogin === undefined) return existing?.testLogin
  const t = input.testLogin
  const username = t.username.trim()
  const usernameSelector = t.usernameSelector.trim()
  const passwordSelector = t.passwordSelector.trim()
  const submitSelector = t.submitSelector.trim()
  if (!username && !usernameSelector && !passwordSelector && !submitSelector && !t.password) {
    return undefined
  }
  const passwordEnc = t.password
    ? encryptSecret(t.password)
    : existing?.testLogin?.passwordEnc ?? ''
  return {
    username,
    passwordEnc,
    usernameSelector,
    passwordSelector,
    submitSelector
  }
}

function normalize(input: HostInput, existing?: HostConfig): HostConfig {
  const kind = input.kind ?? existing?.kind ?? 'ssh'
  const derive = input.derive
    ? {
        folderPattern: input.derive.folderPattern || DEFAULT_DERIVE.folderPattern,
        titleTemplate: input.derive.titleTemplate || DEFAULT_DERIVE.titleTemplate,
        browserUrlTemplate: input.derive.browserUrlTemplate ?? '',
        issueKeyTemplate: input.derive.issueKeyTemplate
      }
    : existing?.derive ?? { ...DEFAULT_DERIVE }
  const services = input.services !== undefined ? input.services : existing?.services ?? emptyServices()
  const folderFilter =
    input.folderFilter !== undefined ? input.folderFilter || undefined : existing?.folderFilter
  const hide = input.hide !== undefined ? input.hide : existing?.hide ?? [...DEFAULT_HIDE]
  const terminalStartup =
    input.terminalStartup !== undefined
      ? input.terminalStartup.trim() || undefined
      : existing?.terminalStartup
  return {
    id: existing?.id ?? input.id ?? randomUUID(),
    addedAt: existing?.addedAt ?? Date.now(),
    kind,
    label: input.label,
    host: input.host,
    port: kind === 'local' ? 0 : input.port,
    username: input.username,
    workspacesRoot: input.workspacesRoot,
    derive,
    folderFilter,
    services,
    hide,
    terminalStartup,
    testLogin: resolveTestLogin(input, existing),
    auth: resolveAuth({ ...input, kind }, existing)
  }
}

export function registerHostIpc(manager: HostManager): void {
  ipcMain.handle('host:list', (): HostConfig[] => manager.list())
  ipcMain.handle('host:get', (_e: IpcMainInvokeEvent, id: string) => manager.get(id))
  ipcMain.handle('host:save', (_e: IpcMainInvokeEvent, input: HostInput): HostConfig => {
    const existing = input.id ? manager.get(input.id) : undefined
    return manager.save(normalize(input, existing))
  })
  ipcMain.handle('host:clone', (_e: IpcMainInvokeEvent, id: string): HostConfig => manager.clone(id))
  ipcMain.handle('host:delete', (_e: IpcMainInvokeEvent, id: string): void => manager.delete(id))
  ipcMain.handle('host:test', (_e: IpcMainInvokeEvent, input: HostInput): Promise<TestResult> => {
    const existing = input.id ? manager.get(input.id) : undefined
    return manager.test(normalize(input, existing))
  })
  ipcMain.handle('host:ensureLocal', (_e: IpcMainInvokeEvent, workspacesRoot?: string): HostConfig =>
    manager.ensureLocal(workspacesRoot)
  )
}
