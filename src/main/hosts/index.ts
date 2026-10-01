import { randomUUID } from 'crypto'
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type {
  AuthConfig,
  HostConfig,
  HostInput,
  TestResult
} from '../../shared/types'
import { HostManager, buildConnectConfig, expandHome } from './HostManager'
import { HostStore } from './store'
import { encryptSecret } from './secrets'
import { discoverTailscale } from './tailscale'

export { HostManager, HostStore, buildConnectConfig, expandHome }

function resolveAuth(input: HostInput, existing?: HostConfig): AuthConfig {
  if (input.kind === 'local' || input.auth.kind === 'none') {
    return { kind: 'none' }
  }
  if (input.auth.kind === 'tailscale') return { kind: 'tailscale' }
  if (input.auth.kind === 'key') {
    const keep =
      existing?.auth.kind === 'key'
        ? existing.auth.encryptedPassphrase
        : undefined
    return {
      kind: 'key',
      keyPath: expandHome(input.auth.keyPath),
      encryptedPassphrase: input.auth.passphrase
        ? encryptSecret(input.auth.passphrase)
        : keep
    }
  }
  if (input.auth.kind === 'password') {
    const keep =
      existing?.auth.kind === 'password'
        ? existing.auth.encryptedPassword
        : undefined
    return {
      kind: 'password',
      encryptedPassword: input.auth.password
        ? encryptSecret(input.auth.password)
        : (keep ?? '')
    }
  }
  return { kind: 'agent' }
}

function normalize(input: HostInput, existing?: HostConfig): HostConfig {
  const kind = input.kind ?? existing?.kind ?? 'ssh'
  return {
    id: existing?.id ?? input.id ?? randomUUID(),
    addedAt: existing?.addedAt ?? Date.now(),
    kind,
    label: input.label.trim(),
    host: input.host.trim(),
    port: kind === 'local' ? 0 : input.port,
    username: input.username.trim(),
    auth: resolveAuth({ ...input, kind }, existing)
  }
}

export function registerHostIpc(
  manager: HostManager,
  canDelete: (id: string) => boolean = () => true
): void {
  ipcMain.handle('host:discoverTailscale', () => discoverTailscale())
  ipcMain.handle('host:list', (): HostConfig[] => manager.list())
  ipcMain.handle('host:get', (_e: IpcMainInvokeEvent, id: string) =>
    manager.get(id)
  )
  ipcMain.handle(
    'host:save',
    (_e: IpcMainInvokeEvent, input: HostInput): HostConfig => {
      const existing = input.id ? manager.get(input.id) : undefined
      return manager.save(normalize(input, existing))
    }
  )
  ipcMain.handle(
    'host:clone',
    (_e: IpcMainInvokeEvent, id: string): HostConfig => manager.clone(id)
  )
  ipcMain.handle('host:delete', (_e: IpcMainInvokeEvent, id: string): void => {
    if (!canDelete(id))
      throw new Error(
        'Remove this host’s project locations and close its workspaces first'
      )
    manager.delete(id)
  })
  ipcMain.handle(
    'host:test',
    (_e: IpcMainInvokeEvent, input: HostInput): Promise<TestResult> => {
      const existing = input.id ? manager.get(input.id) : undefined
      return manager.test(normalize(input, existing))
    }
  )
  ipcMain.handle(
    'host:ensureLocal',
    (_e: IpcMainInvokeEvent): HostConfig => manager.ensureLocal()
  )
}
