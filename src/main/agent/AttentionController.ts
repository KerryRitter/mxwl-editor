import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, Notification, type BrowserWindow } from 'electron'
import type { AgentNotificationRecord, AgentSessionState } from '../../shared/types'
import { classifyAgentTransition, type AgentNotificationEvent } from '../../shared/agentNotifications'
import type { SettingsStore } from '../persistence/SettingsStore'
import type { WorkspaceManager } from '../workspace/WorkspaceManager'

const MAX_RECORDS = 200

type Pending = {
  event: AgentNotificationEvent
  state: AgentSessionState
  timer: NodeJS.Timeout
}

export class AttentionController {
  private filePath = join(app.getPath('userData'), 'attention.json')
  private records: AgentNotificationRecord[] = this.load()
  private pending = new Map<string, Pending>()

  constructor(
    private settings: SettingsStore,
    private workspaces: WorkspaceManager,
    private getSender: () => BrowserWindow | null,
    private focusAgent: (wsId: string) => void
  ) {}

  observe(previous: AgentSessionState | null | undefined, next: AgentSessionState): void {
    const waiting = this.pending.get(next.wsId)
    if (waiting && !isStillRelevant(waiting.event, next)) {
      clearTimeout(waiting.timer)
      this.pending.delete(next.wsId)
    } else if (waiting) {
      waiting.state = next
    }

    const event = classifyAgentTransition(previous, next)
    if (!event) return
    const prefs = this.settings.all().notifications
    if (prefs.mutedAgents.includes(next.agentId)) return

    const existing = this.pending.get(next.wsId)
    if (existing) clearTimeout(existing.timer)
    const delayMs = Math.max(0, Math.min(3600, prefs.delaySeconds)) * 1000
    if (delayMs === 0) {
      this.publish(next, event)
      return
    }
    const timer = setTimeout(() => {
      const pending = this.pending.get(next.wsId)
      if (!pending || pending.timer !== timer) return
      this.pending.delete(next.wsId)
      if (isStillRelevant(event, pending.state)) this.publish(pending.state, event)
    }, delayMs)
    timer.unref?.()
    this.pending.set(next.wsId, { event, state: next, timer })
  }

  list(): AgentNotificationRecord[] {
    return structuredClone(this.records)
  }

  markRead(id: string): AgentNotificationRecord[] {
    this.records = this.records.map((record) =>
      record.id === id ? { ...record, read: true } : record
    )
    this.persist()
    this.sync()
    return this.list()
  }

  markAllRead(): AgentNotificationRecord[] {
    this.records = this.records.map((record) => ({ ...record, read: true }))
    this.persist()
    this.sync()
    return this.list()
  }

  clear(): void {
    this.records = []
    this.persist()
    this.sync()
  }

  private publish(state: AgentSessionState, event: AgentNotificationEvent): void {
    const record: AgentNotificationRecord = {
      id: randomUUID(),
      wsId: state.wsId,
      agentId: state.agentId,
      agentLabel: state.agentLabel,
      ...event,
      createdAt: Date.now(),
      read: false
    }
    this.records = [record, ...this.records].slice(0, MAX_RECORDS)
    this.persist()

    const prefs = this.settings.all().notifications
    const activeWorkspace =
      prefs.suppressActiveWorkspace &&
      Boolean(this.getSender()?.isFocused()) &&
      this.workspaces.list()[0]?.id === state.wsId
    const popup = !activeWorkspace && (prefs.delivery === 'in-app' || prefs.delivery === 'both')
    this.send('attention:event', {
      record,
      popup,
      sound: popup && prefs.sound
    })

    if (
      !activeWorkspace &&
      Notification.isSupported() &&
      (prefs.delivery === 'system' || prefs.delivery === 'both')
    ) {
      const workspace = this.workspaces.list().find((item) => item.id === state.wsId)
      const notification = new Notification({
        title: event.title,
        body: `${workspace?.title ?? 'mxwl'} · ${event.detail}`,
        silent: !prefs.sound
      })
      notification.on('click', () => this.focusAgent(state.wsId))
      notification.show()
    }
  }

  private sync(): void {
    this.send('attention:sync', this.list())
  }

  private send(channel: string, payload: unknown): void {
    const window = this.getSender()
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return
    window.webContents.send(channel, payload)
  }

  private load(): AgentNotificationRecord[] {
    if (!existsSync(this.filePath)) return []
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as AgentNotificationRecord[]
      return Array.isArray(parsed) ? parsed.filter(isRecord).slice(0, MAX_RECORDS) : []
    } catch {
      return []
    }
  }

  private persist(): void {
    const dir = dirname(this.filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const temporary = `${this.filePath}.tmp`
    writeFileSync(temporary, JSON.stringify(this.records, null, 2), 'utf8')
    renameSync(temporary, this.filePath)
  }
}

function isStillRelevant(event: AgentNotificationEvent, state: AgentSessionState): boolean {
  if (event.kind === 'attention') return Boolean(state.permission) || state.status === 'auth-required'
  if (event.kind === 'error') {
    return state.status === 'error' || state.status === 'exited' || (state.turn === 'idle' && Boolean(state.error))
  }
  return state.status === 'ready' && state.turn === 'idle' && !state.permission && !state.error
}

function isRecord(value: unknown): value is AgentNotificationRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<AgentNotificationRecord>
  return (
    typeof record.id === 'string' &&
    typeof record.wsId === 'string' &&
    typeof record.agentLabel === 'string' &&
    typeof record.title === 'string' &&
    typeof record.detail === 'string' &&
    typeof record.createdAt === 'number' &&
    typeof record.read === 'boolean' &&
    (record.kind === 'done' || record.kind === 'attention' || record.kind === 'error')
  )
}
