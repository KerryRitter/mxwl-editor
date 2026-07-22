import { randomUUID } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import type { ChannelLike } from './LocalConnection'
import type { SshConnection } from './SshConnection'
import type { LocalConnection } from './LocalConnection'

type Conn = SshConnection | LocalConnection

export type TerminalSessionOptions = {
  wsId: string
  conn: Conn
  cwd: string
  cols: number
  rows: number
  getSender: () => BrowserWindow | null
  onClosed?: (sessionId: string) => void
}

export class TerminalSession {
  readonly id: string
  readonly wsId: string
  private conn: Conn
  private cwd: string
  private stream: ChannelLike | null = null
  private getSender: () => BrowserWindow | null
  private onClosed?: (sessionId: string) => void
  private disposed = false

  constructor(opts: TerminalSessionOptions) {
    this.id = randomUUID()
    this.wsId = opts.wsId
    this.conn = opts.conn
    this.cwd = opts.cwd
    this.getSender = opts.getSender
    this.onClosed = opts.onClosed
  }

  async start(cols: number, rows: number): Promise<void> {
    this.stream = (await this.conn.shell({ cols, rows, cwd: this.cwd })) as ChannelLike
    this.stream.on('data', (d: unknown) => this.send(Buffer.isBuffer(d) ? d.toString() : String(d)))
    this.stream.stderr.on('data', (d: unknown) =>
      this.send(Buffer.isBuffer(d) ? d.toString() : String(d))
    )
    this.stream.on('close', () => {
      this.send('\r\n\x1b[90m[session closed]\x1b[0m\r\n')
      this.notifyClosed()
    })
  }

  write(data: string): void {
    if (this.disposed) return
    try {
      this.stream?.write(data)
    } catch {
      void data
    }
  }

  resize(cols: number, rows: number): void {
    if (this.disposed || !this.stream) return
    try {
      this.stream.setWindow?.(rows, cols, rows * 16, cols * 8)
    } catch {
      void `${cols}x${rows}`
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true
    const s = this.stream
    this.stream = null
    if (s) {
      try {
        s.end()
      } catch {
        void s
      }
    }
  }

  private send(data: string): void {
    const win = this.getSender()
    win?.webContents.send('terminal:output', { wsId: this.wsId, sessionId: this.id, data })
  }

  private notifyClosed(): void {
    if (this.disposed) return
    this.disposed = true
    this.stream = null
    const win = this.getSender()
    win?.webContents.send('terminal:closed', { wsId: this.wsId, sessionId: this.id })
    this.onClosed?.(this.id)
  }
}
