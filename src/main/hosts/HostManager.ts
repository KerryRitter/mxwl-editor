import { randomUUID } from 'crypto'
import { readFileSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { Client, type ConnectConfig } from 'ssh2'
import type { AuthConfig, DeriveConfig, HostConfig, PresetService, TestResult } from '../../shared/types'
import { decryptSecret } from './secrets'
import { HostStore } from './store'
import { createLocalHostConfig } from '../workspace/LocalConnection'
import { DEFAULT_DERIVE, DEFAULT_HIDE, emptyServices } from '../../shared/hostDefaults'

export function expandHome(p: string): string {
  if (!p) return p
  if (p === '~') return homedir()
  if (p.startsWith('~/')) return join(homedir(), p.slice(2))
  if (p.startsWith('${HOME}')) return homedir() + p.slice(7)
  if (p.startsWith('$HOME/')) return join(homedir(), p.slice(6))
  return p
}

export function buildConnectConfig(host: HostConfig): ConnectConfig {
  const base: ConnectConfig = {
    host: host.host,
    port: host.port,
    username: host.username,
    readyTimeout: 10000,
    keepaliveInterval: 15000,
    keepaliveCountMax: 6
  }
  return { ...base, ...authCreds(host.auth) }
}

function authCreds(auth: AuthConfig): ConnectConfig {
  switch (auth.kind) {
    case 'none':
      return {}
    case 'agent':
      return { agent: process.env.SSH_AUTH_SOCK }
    case 'key':
      return {
        privateKey: readKey(auth.keyPath),
        passphrase: auth.encryptedPassphrase ? decryptSecret(auth.encryptedPassphrase) : undefined
      }
    case 'password':
      return { password: decryptSecret(auth.encryptedPassword) }
  }
}

function readKey(keyPath: string): Buffer {
  const resolved = expandHome(keyPath)
  try {
    return readFileSync(resolved)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Cannot read private key at "${keyPath}" (resolved "${resolved}"): ${msg}`)
  }
}

export class HostManager {
  constructor(private store: HostStore) {}

  list(): HostConfig[] {
    return this.store.all().map((h) => this.persistIfMigrated(normalizeHost(h)))
  }

  get(id: string): HostConfig | undefined {
    const h = this.store.get(id)
    return h ? this.persistIfMigrated(normalizeHost(h)) : undefined
  }

  save(host: HostConfig): HostConfig {
    return this.store.upsert(normalizeHost(host))
  }

  delete(id: string): void {
    this.store.delete(id)
  }

  ensureLocal(workspacesRoot?: string): HostConfig {
    const existing = this.list().find((h) => h.kind === 'local' || looksLikeLocal(h))
    if (existing) {
      const fixed: HostConfig = {
        ...createLocalHostConfig(workspacesRoot ?? existing.workspacesRoot),
        id: existing.id,
        addedAt: existing.addedAt,
        label: existing.label || 'This machine',
        workspacesRoot: workspacesRoot ?? existing.workspacesRoot ?? '~/Workspaces',
        derive: existing.derive,
        folderFilter: existing.folderFilter,
        services: existing.services,
        hide: existing.hide
      }
      return this.save(fixed)
    }
    return this.save(createLocalHostConfig(workspacesRoot))
  }

  clone(id: string): HostConfig {
    const src = this.get(id)
    if (!src) throw new Error('host not found')
    const copy: HostConfig = {
      ...structuredClone(src),
      id: randomUUID(),
      label: `${src.label} (copy)`,
      addedAt: Date.now()
    }
    return this.save(copy)
  }

  private persistIfMigrated(host: HostConfig): HostConfig {
    const raw = this.store.get(host.id) as HostConfig & { browserUrlTemplate?: string } | undefined
    if (!raw) return host
    const needsWrite =
      raw.kind !== host.kind ||
      raw.auth?.kind !== host.auth.kind ||
      !raw.derive ||
      !Array.isArray(raw.services) ||
      (raw as { browserUrlTemplate?: string }).browserUrlTemplate !== undefined ||
      (host.kind === 'local' && (raw.port !== 0 || raw.auth?.kind !== 'none'))
    if (needsWrite) this.store.upsert(host)
    return host
  }

  test(host: HostConfig): Promise<TestResult> {
    const start = Date.now()
    if (host.kind === 'local') {
      const root = expandHome(host.workspacesRoot || '~/Workspaces')
      const homeOk = existsSync(homedir())
      return Promise.resolve({
        ok: homeOk,
        error: homeOk ? undefined : 'home directory missing',
        latencyMs: Date.now() - start
      })
    }

    const client = new Client()
    return new Promise((resolve) => {
      const finish = (r: Omit<TestResult, 'latencyMs'>) => {
        try {
          client.end()
        } catch (err) {
          void err
        }
        resolve({ ...r, latencyMs: Date.now() - start })
      }
      client.once('ready', () => finish({ ok: true }))
      client.once('error', (err: Error) => finish({ ok: false, error: err.message }))
      const timer = setTimeout(() => finish({ ok: false, error: 'timeout (10s)' }), 10000)
      client.once('close', () => clearTimeout(timer))
      try {
        client.connect(buildConnectConfig(host))
      } catch (err) {
        finish({ ok: false, error: err instanceof Error ? err.message : String(err) })
      }
    })
  }
}

function looksLikeLocal(h: HostConfig): boolean {
  if (h.kind === 'local') return true
  if (h.auth?.kind === 'none') return true
  if (h.port === 0 && (h.host === 'localhost' || h.host === '127.0.0.1')) return true
  return false
}

function normalizeHost(h: HostConfig & { browserUrlTemplate?: string }): HostConfig {
  const legacyUrl = h.browserUrlTemplate?.trim()
  const derive: DeriveConfig = h.derive
    ? {
        folderPattern: h.derive.folderPattern || DEFAULT_DERIVE.folderPattern,
        titleTemplate: h.derive.titleTemplate || DEFAULT_DERIVE.titleTemplate,
        browserUrlTemplate: h.derive.browserUrlTemplate ?? legacyUrl ?? '',
        issueKeyTemplate: h.derive.issueKeyTemplate
      }
    : {
        ...DEFAULT_DERIVE,
        browserUrlTemplate: legacyUrl ?? ''
      }
  const services: PresetService[] = Array.isArray(h.services) ? h.services : emptyServices()
  const hide = h.hide ?? DEFAULT_HIDE
  const base: HostConfig = {
    id: h.id,
    label: h.label,
    host: h.host,
    port: h.port,
    username: h.username,
    auth: h.auth ?? { kind: 'agent' },
    workspacesRoot: h.workspacesRoot || '~/Workspaces',
    derive,
    folderFilter: h.folderFilter,
    services,
    hide,
    terminalStartup: h.terminalStartup?.trim() || undefined,
    testLogin: h.testLogin,
    addedAt: h.addedAt || Date.now(),
    kind: h.kind ?? 'ssh'
  }
  if (looksLikeLocal(base)) {
    return {
      ...base,
      kind: 'local',
      host: base.host || 'localhost',
      port: 0,
      auth: { kind: 'none' }
    }
  }
  return base
}
