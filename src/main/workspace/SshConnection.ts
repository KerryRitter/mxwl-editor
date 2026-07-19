import { EventEmitter } from 'node:events'
import { connect as tcpConnect, type Socket } from 'node:net'
import {
  Client,
  type ClientChannel,
  type ConnectConfig,
  type PseudoTtyOptions,
  type SFTPWrapper
} from 'ssh2'
import type { HostConfig, WorkspaceStatus } from '../../shared/types'
import { buildConnectConfig } from '../hosts'
import { shellQuote } from './util'

export interface ShellOptions {
  cols: number
  rows: number
  cwd?: string
  term?: string
}

export interface ExecResult {
  stdout: string
  stderr: string
  code: number | null
}

export class SshConnection extends EventEmitter {
  readonly hostId: string
  private host: HostConfig
  private client: Client | null = null
  private sftpCache: Promise<SFTPWrapper> | null = null
  private status: WorkspaceStatus = 'disconnected'
  private intentional = false
  private reconnectTimer: NodeJS.Timeout | null = null
  private reconnectAttempts = 0
  private tunnelListenerAttached = false
  private tunnelRoutes = new Map<number, { localPort: number; localHost: string }>()

  constructor(host: HostConfig) {
    super()
    this.host = host
    this.hostId = host.id
  }

  get currentStatus(): WorkspaceStatus {
    return this.status
  }

  connect(): Promise<void> {
    this.intentional = false
    return this.attemptConnect()
  }

  private attemptConnect(): Promise<void> {
    this.setStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting')
    return new Promise<void>((resolve, reject) => {
      const client = new Client()
      let settled = false

      const onReady = (): void => {
        this.reconnectAttempts = 0
        this.setStatus('connected')
        settled = true
        detach()
        resolve()
      }
      const onError = (err: Error): void => {
        detach()
        if (!settled) {
          settled = true
          reject(err)
        }
        if (!this.intentional) this.scheduleReconnect()
      }
      const onClose = (): void => {
        detach()
        this.sftpCache = null
        this.setStatus('disconnected')
        if (!this.intentional) this.scheduleReconnect()
      }
      const detach = (): void => {
        client.removeListener('ready', onReady)
        client.removeListener('error', onError)
        client.removeListener('close', onClose)
      }

      client.on('ready', onReady)
      client.on('error', onError)
      client.on('close', onClose)

      try {
        client.connect(buildConnectConfig(this.host))
        this.client = client
      } catch (err) {
        reject(err as Error)
      }
    })
  }

  private scheduleReconnect(): void {
    if (this.intentional || this.reconnectTimer) return
    this.reconnectAttempts++
    // Cap attempts so a dead host doesn't spin forever; user can reopen workspace
    if (this.reconnectAttempts > 12) {
      this.setStatus('error')
      return
    }
    this.setStatus('reconnecting')
    const delay = Math.min(30000, 1000 * 2 ** Math.min(this.reconnectAttempts, 5))
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.attemptConnect().catch(() => this.scheduleReconnect())
    }, delay)
  }

  private setStatus(s: WorkspaceStatus): void {
    this.status = s
    this.emit('status', s)
  }

  private requireConnected(): void {
    if (this.status !== 'connected' || !this.client) {
      throw new Error(`ssh connection to ${this.host.label} is not ready (status: ${this.status})`)
    }
  }

  async sftp(): Promise<SFTPWrapper> {
    this.requireConnected()
    if (!this.sftpCache) {
      this.sftpCache = new Promise<SFTPWrapper>((resolve, reject) => {
        this.client!.sftp((err, sftp) => (err ? reject(err) : resolve(sftp)))
      })
      this.sftpCache.catch(() => {
        this.sftpCache = null
      })
    }
    return this.sftpCache
  }

  exec(cmd: string): Promise<ExecResult> {
    this.requireConnected()
    return new Promise<ExecResult>((resolve, reject) => {
      this.client!.exec(cmd, (err, stream) => {
        if (err) return reject(err)
        let stdout = ''
        let stderr = ''
        let code: number | null = null
        stream.on('data', (d: Buffer) => (stdout += d.toString()))
        stream.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
        stream.on('close', (c: number | null) => {
          code = c
          resolve({ stdout, stderr, code })
        })
      })
    })
  }

  execStream(cmd: string): Promise<ClientChannel> {
    this.requireConnected()
    return new Promise<ClientChannel>((resolve, reject) => {
      this.client!.exec(cmd, (err, stream) => (err ? reject(err) : resolve(stream)))
    })
  }

  shell(opts: ShellOptions): Promise<ClientChannel> {
    this.requireConnected()
    const window: PseudoTtyOptions = {
      cols: opts.cols,
      rows: opts.rows,
      term: opts.term ?? 'xterm-256color'
    }
    return new Promise<ClientChannel>((resolve, reject) => {
      this.client!.shell(window, (err, stream) => {
        if (err) return reject(err)
        if (opts.cwd) stream.write(`cd ${shellQuote(opts.cwd)}\n`)
        resolve(stream)
      })
    })
  }

  async close(): Promise<void> {
    this.intentional = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.sftpCache = null
    await this.stopAllReverseTunnels()
    const client = this.client
    this.client = null
    if (client) {
      try {
        client.end()
      } catch {
        void client
      }
    }
    this.setStatus('disconnected')
  }

  async startReverseTunnel(
    remotePort: number,
    localPort: number,
    localHost = '127.0.0.1'
  ): Promise<number> {
    this.requireConnected()
    this.attachTunnelListener()
    return new Promise<number>((resolve, reject) => {
      this.client!.forwardIn('127.0.0.1', remotePort, (err, actualPort) => {
        if (err) return reject(new Error(`forwardIn ${remotePort}: ${err.message}`))
        this.tunnelRoutes.set(actualPort, { localPort, localHost })
        resolve(actualPort)
      })
    })
  }

  async stopReverseTunnel(remotePort: number): Promise<void> {
    this.tunnelRoutes.delete(remotePort)
    if (!this.client) return
    await new Promise<void>((resolve) => {
      try {
        this.client!.unforwardIn('127.0.0.1', remotePort, () => resolve())
      } catch {
        resolve()
      }
    })
  }

  async stopAllReverseTunnels(): Promise<void> {
    const ports = [...this.tunnelRoutes.keys()]
    this.tunnelRoutes.clear()
    for (const port of ports) await this.stopReverseTunnel(port)
  }

  private attachTunnelListener(): void {
    if (this.tunnelListenerAttached || !this.client) return
    this.tunnelListenerAttached = true
    this.client.on(
      'tcp connection',
      (
        info: { destPort: number },
        accept: () => ClientChannel,
        reject: () => void
      ) => {
        const route = this.tunnelRoutes.get(info.destPort)
        if (!route) {
          try {
            reject()
          } catch (err) {
            void err
          }
          return
        }
        const channel = accept()
      const socket: Socket = tcpConnect(route.localPort, route.localHost)
      channel.pipe(socket)
      socket.pipe(channel)
      const cleanup = (): void => {
        try {
          socket.destroy()
        } catch (err) {
          void err
        }
        try {
          channel.destroy()
        } catch (err) {
          void err
        }
      }
      channel.on('error', cleanup)
      socket.on('error', cleanup)
      channel.on('close', cleanup)
      socket.on('close', cleanup)
    })
  }
}
