import type { BrowserWindow } from 'electron'
import type { ClientChannel } from 'ssh2'
import type { DevStatus, PresetService } from '../../shared/types'
import type { SshConnection } from './SshConnection'
import type { LocalConnection, ChannelLike } from './LocalConnection'
import { shellQuote } from './util'

export type DevAction = 'start' | 'stop' | 'restart'

type Conn = SshConnection | LocalConnection
type StreamLike = ClientChannel | ChannelLike

export class DevController {
  private tails = new Map<string, StreamLike>()
  private statuses: Record<string, DevStatus> = {}
  private serviceMap: Map<string, PresetService>

  constructor(
    private wsId: string,
    private conn: Conn,
    private cwd: string,
    private getSender: () => BrowserWindow | null,
    services: PresetService[] = []
  ) {
    this.serviceMap = new Map(services.map((s) => [s.id, s]))
    for (const s of services) this.statuses[s.id] = 'unknown'
  }

  listServices(): PresetService[] {
    return [...this.serviceMap.values()]
  }

  setServices(services: PresetService[]): void {
    this.serviceMap = new Map(services.map((s) => [s.id, s]))
    for (const s of services) {
      if (!this.statuses[s.id]) this.statuses[s.id] = 'unknown'
    }
  }

  getSnapshot(): Record<string, DevStatus> {
    return { ...this.statuses }
  }

  private cmdFor(action: DevAction | 'logs', serviceId: string): string | undefined {
    const s = this.serviceMap.get(serviceId)
    if (!s) return undefined
    return s[action]
  }

  async run(serviceId: string, action: DevAction): Promise<void> {
    const cmd = this.cmdFor(action, serviceId)
    if (!cmd) throw new Error(`no ${action} command configured for ${serviceId}`)
    this.setStatus(serviceId, 'starting')
    const full = `cd ${shellQuote(this.cwd)} && ${cmd}`
    const stream = await this.conn.execStream(full)
    this.bindStream(serviceId, stream, action === 'stop' ? 'stopped' : 'running')
  }

  async tail(serviceId: string): Promise<void> {
    if (this.tails.has(serviceId)) return
    const cmd = this.cmdFor('logs', serviceId)
    if (!cmd) {
      this.sendLog(serviceId, 'stderr', `[no logs command configured for ${serviceId}]`)
      return
    }
    const full = `cd ${shellQuote(this.cwd)} && ${cmd}`
    try {
      const stream = await this.conn.execStream(full)
      this.tails.set(serviceId, stream)
      let buf = ''
      stream.on('data', (d: unknown) => {
        buf += Buffer.isBuffer(d) ? d.toString() : String(d)
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) this.sendLog(serviceId, 'stdout', line)
      })
      stream.stderr.on('data', (d: unknown) => {
        buf += Buffer.isBuffer(d) ? d.toString() : String(d)
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) this.sendLog(serviceId, 'stderr', line)
      })
      stream.on('close', () => {
        this.tails.delete(serviceId)
        this.sendLog(serviceId, 'stdout', '[log stream ended]')
      })
    } catch (err) {
      this.sendLog(serviceId, 'stderr', `[failed to tail ${serviceId}: ${String(err)}]`)
    }
  }

  stopTail(serviceId: string): void {
    const stream = this.tails.get(serviceId)
    if (!stream) return
    try {
      stream.end()
    } catch (err) {
      void err
    }
    this.tails.delete(serviceId)
  }

  dispose(): void {
    for (const id of [...this.tails.keys()]) this.stopTail(id)
  }

  private bindStream(serviceId: string, stream: StreamLike, successStatus: DevStatus): void {
    let buf = ''
    const onLine = (kind: 'stdout' | 'stderr', chunk: string): void => {
      buf += chunk
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) this.sendLog(serviceId, kind, line)
    }
    stream.on('data', (d: unknown) =>
      onLine('stdout', Buffer.isBuffer(d) ? d.toString() : String(d))
    )
    stream.stderr.on('data', (d: unknown) =>
      onLine('stderr', Buffer.isBuffer(d) ? d.toString() : String(d))
    )
    stream.on('close', (code: unknown) => {
      this.sendLog(serviceId, 'stdout', `[exited code=${code}]`)
      this.setStatus(serviceId, code === 0 ? successStatus : 'error')
    })
  }

  private setStatus(serviceId: string, status: DevStatus): void {
    this.statuses[serviceId] = status
    this.getSender()?.webContents.send('dev:status', { wsId: this.wsId, app: serviceId, status })
  }

  private sendLog(serviceId: string, stream: 'stdout' | 'stderr', line: string): void {
    this.getSender()?.webContents.send('dev:logs', {
      wsId: this.wsId,
      app: serviceId,
      stream,
      line
    })
  }
}
