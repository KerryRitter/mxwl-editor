import { randomUUID } from 'crypto'
import { readFileSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { Client, type ConnectConfig } from 'ssh2'
import type { AuthConfig, HostConfig, TestResult } from '../../shared/types'
import { decryptSecret } from './secrets'
import { HostStore } from './store'
import { createLocalHostConfig } from '../workspace/LocalConnection'

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
    case 'tailscale':
      return {}
    case 'agent':
      return { agent: process.env.SSH_AUTH_SOCK }
    case 'key':
      return {
        privateKey: readKey(auth.keyPath),
        passphrase: auth.encryptedPassphrase
          ? decryptSecret(auth.encryptedPassphrase)
          : undefined
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
    throw new Error(
      `Cannot read private key at "${keyPath}" (resolved "${resolved}"): ${msg}`
    )
  }
}

export class HostManager {
  constructor(private store: HostStore) {}

  list(): HostConfig[] {
    return this.store.all().map(normalizeHost)
  }

  get(id: string): HostConfig | undefined {
    const h = this.store.get(id)
    return h ? normalizeHost(h) : undefined
  }

  save(host: HostConfig): HostConfig {
    if (this.get(host.id)?.kind === 'local' && host.kind !== 'local')
      throw new Error('A local machine connection cannot be converted to a remote connection')
    return this.store.upsert(normalizeHost(host))
  }

  delete(id: string): void {
    this.store.delete(id)
  }

  ensureLocal(): HostConfig {
    const existing = this.store.firstLocal()
    return existing ? normalizeHost(existing) : this.save(createLocalHostConfig())
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

  test(host: HostConfig): Promise<TestResult> {
    const start = Date.now()
    if (host.kind === 'local') {
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
      client.once('error', (err: Error) =>
        finish({ ok: false, error: err.message })
      )
      const timer = setTimeout(
        () => finish({ ok: false, error: 'timeout (10s)' }),
        10000
      )
      client.once('close', () => clearTimeout(timer))
      try {
        client.connect(buildConnectConfig(host))
      } catch (err) {
        finish({
          ok: false,
          error: err instanceof Error ? err.message : String(err)
        })
      }
    })
  }
}

function normalizeHost(h: HostConfig): HostConfig {
  return {
    id: h.id,
    label: h.label,
    host: h.host,
    port: h.kind === 'local' ? 0 : h.port,
    username: h.username,
    auth: h.kind === 'local' ? { kind: 'none' } : h.auth,
    addedAt: h.addedAt,
    kind: h.kind ?? 'ssh'
  }
}
