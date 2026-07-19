import { EventEmitter } from 'node:events'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { homedir, userInfo, hostname } from 'node:os'
import { existsSync } from 'node:fs'
import * as pty from 'node-pty'
import type { HostConfig, WorkspaceStatus } from '../../shared/types'
import type { ExecResult, ShellOptions } from './SshConnection'
import { expandHome } from '../hosts/HostManager'
import { shellQuote } from './util'
import { DEFAULT_DERIVE, DEFAULT_HIDE } from '../../shared/hostDefaults'

/** Duck-typed stream compatible with ssh2 ClientChannel for DevController / TerminalSession */
export type ChannelLike = {
  write(data: string | Buffer): boolean | void
  end(): void
  destroy?(): void
  setWindow?(rows: number, cols: number, height: number, width: number): void
  on(event: string, listener: (...args: unknown[]) => void): unknown
  stderr: { on(event: string, listener: (...args: unknown[]) => void): unknown }
}

export function createLocalHostConfig(workspacesRoot = '~/Workspaces'): HostConfig {
  const user = userInfo().username
  return {
    id: 'local-this-machine',
    kind: 'local',
    label: 'This machine',
    host: hostname() || 'localhost',
    port: 0,
    username: user,
    auth: { kind: 'none' },
    workspacesRoot,
    derive: { ...DEFAULT_DERIVE },
    services: [],
    hide: [...DEFAULT_HIDE],
    addedAt: Date.now()
  }
}

export class LocalConnection extends EventEmitter {
  readonly kind = 'local' as const
  readonly hostId: string
  private host: HostConfig
  private status: WorkspaceStatus = 'disconnected'
  private intentional = false

  constructor(host: HostConfig) {
    super()
    this.host = host
    this.hostId = host.id
  }

  get currentStatus(): WorkspaceStatus {
    return this.status
  }

  async connect(): Promise<void> {
    this.intentional = false
    this.setStatus('connecting')
    const root = expandHome(this.host.workspacesRoot || '~/Workspaces')
    // workspaces root need not exist yet — home must
    if (!existsSync(homedir())) {
      this.setStatus('error')
      throw new Error('local home directory not found')
    }
    void root
    this.setStatus('connected')
  }

  async close(): Promise<void> {
    this.intentional = true
    this.setStatus('disconnected')
  }

  private requireConnected(): void {
    if (this.status !== 'connected') {
      throw new Error(`local connection not ready (status: ${this.status})`)
    }
  }

  exec(cmd: string): Promise<ExecResult> {
    this.requireConnected()
    return new Promise((resolve) => {
      const child = spawn('/bin/bash', ['-lc', cmd], {
        env: process.env,
        cwd: expandHome(this.host.workspacesRoot || homedir())
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (d: Buffer) => (stdout += d.toString()))
      child.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
      child.on('close', (code) => resolve({ stdout, stderr, code }))
      child.on('error', (err) => resolve({ stdout, stderr: stderr + String(err), code: 1 }))
    })
  }

  execStream(cmd: string): Promise<ChannelLike> {
    this.requireConnected()
    const child = spawn('/bin/bash', ['-lc', cmd], {
      env: process.env,
      cwd: expandHome(this.host.workspacesRoot || homedir())
    })
    return Promise.resolve(wrapChildProcess(child))
  }

  async shell(opts: ShellOptions): Promise<ChannelLike> {
    this.requireConnected()
    const cwd = opts.cwd ? expandHome(opts.cwd) : expandHome(this.host.workspacesRoot || homedir())
    const shellPath = process.env.SHELL || '/bin/bash'
    const term = pty.spawn(shellPath, ['-l'], {
      name: opts.term ?? 'xterm-256color',
      cols: opts.cols,
      rows: opts.rows,
      cwd: existsSync(cwd) ? cwd : homedir(),
      env: process.env as Record<string, string>
    })
    return wrapPty(term)
  }

  /** Local MCP/CDP already on loopback — no tunnel needed */
  async startReverseTunnel(remotePort: number, _localPort: number): Promise<number> {
    this.requireConnected()
    return remotePort
  }

  async stopReverseTunnel(_remotePort: number): Promise<void> {
    // no-op
  }

  private setStatus(s: WorkspaceStatus): void {
    this.status = s
    this.emit('status', s)
    void this.intentional
  }
}

function wrapChildProcess(child: ChildProcessWithoutNullStreams): ChannelLike {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  const stderrListeners = new Set<(...args: unknown[]) => void>()

  const emit = (event: string, ...args: unknown[]): void => {
    for (const fn of listeners.get(event) ?? []) fn(...args)
  }

  child.stdout.on('data', (d: Buffer) => emit('data', d))
  child.stderr.on('data', (d: Buffer) => {
    for (const fn of stderrListeners) fn(d)
  })
  child.on('close', (code) => emit('close', code))
  child.on('error', (err) => emit('error', err))

  return {
    write: (data) => {
      child.stdin.write(data)
      return true
    },
    end: () => {
      try {
        child.kill()
      } catch {
        void child
      }
    },
    destroy: () => {
      try {
        child.kill()
      } catch {
        void child
      }
    },
    on: (event, listener) => {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(listener)
      return undefined
    },
    stderr: {
      on: (_event, listener) => {
        stderrListeners.add(listener)
        return undefined
      }
    }
  }
}

function wrapPty(term: pty.IPty): ChannelLike {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  const emit = (event: string, ...args: unknown[]): void => {
    for (const fn of listeners.get(event) ?? []) fn(...args)
  }

  term.onData((data) => emit('data', Buffer.from(data)))
  term.onExit(({ exitCode }) => emit('close', exitCode))

  return {
    write: (data) => {
      term.write(typeof data === 'string' ? data : data.toString())
      return true
    },
    end: () => {
      try {
        term.kill()
      } catch {
        void term
      }
    },
    destroy: () => {
      try {
        term.kill()
      } catch {
        void term
      }
    },
    setWindow: (rows, cols) => {
      try {
        term.resize(cols, rows)
      } catch {
        void `${cols}x${rows}`
      }
    },
    on: (event, listener) => {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(listener)
      return undefined
    },
    stderr: {
      on: () => undefined
    }
  }
}

export function resolveLocalPath(path: string): string {
  return expandHome(path)
}

export { shellQuote }
