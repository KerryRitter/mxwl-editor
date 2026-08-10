import { randomUUID } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import type { ChannelLike } from './LocalConnection'
import type { SshConnection } from './SshConnection'
import type { LocalConnection } from './LocalConnection'

type Conn = SshConnection | LocalConnection

/** Kept so a terminal can be re-drawn after its pane unmounts (workspace/tab switch). */
const REPLAY_LIMIT = 256 * 1024

export type TerminalSessionOptions = {
  wsId: string
  conn: Conn
  cwd: string
  cols: number
  rows: number
  label?: string
  aiTaskId?: string
  getSender: () => BrowserWindow | null
  onClosed?: (sessionId: string) => void
}

export class TerminalSession {
  readonly id: string
  readonly wsId: string
  readonly label: string
  readonly aiTaskId?: string
  private conn: Conn
  private cwd: string
  private stream: ChannelLike | null = null
  private getSender: () => BrowserWindow | null
  private onClosed?: (sessionId: string) => void
  private disposed = false
  private replayBuf = ''
  private watchers = new Set<(chunk: string) => void>()

  constructor(opts: TerminalSessionOptions) {
    this.id = randomUUID()
    this.wsId = opts.wsId
    this.label = opts.label ?? 'shell'
    this.aiTaskId = opts.aiTaskId
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

  /** Buffered output, so a re-mounted pane doesn't come back blank. */
  replay(): string {
    return this.replayBuf
  }

  /** Lets the AI runner observe a session it is driving. */
  watch(cb: (chunk: string) => void): () => void {
    this.watchers.add(cb)
    return () => this.watchers.delete(cb)
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
    this.watchers.clear()
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
    this.replayBuf += data
    if (this.replayBuf.length > REPLAY_LIMIT) {
      this.replayBuf = this.replayBuf.slice(this.replayBuf.length - REPLAY_LIMIT)
    }
    for (const w of this.watchers) {
      try {
        w(data)
      } catch {
        void data
      }
    }
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
