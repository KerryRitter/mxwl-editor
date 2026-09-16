import { app, type BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type {
  AgentId,
  AgentSessionState,
  AgentTranscript,
  AgentTranscriptMeta
} from '../../shared/types'
import {
  ACP_AGENTS,
  ACP_AGENT_ORDER,
  DEFAULT_AGENT_SETTINGS,
  agentShellCommand
} from '../../shared/acpAgents'
import type { SettingsStore } from '../persistence/SettingsStore'
import type { WorkspaceManager } from '../workspace/WorkspaceManager'
import { AcpSession } from './AcpSession'
import { TranscriptStore } from './TranscriptStore'

/** Chunks stream in token by token; saving on each one would rewrite the file per word. */
const SAVE_DEBOUNCE_MS = 1500

type RestorableAgent = {
  hostId: string
  cwd: string
  agentId: AgentId
}

export type AgentCatalogEntry = {
  id: AgentId
  label: string
  hint: string
  /** Resolved launch line, so Settings and the picker show what will actually run */
  command: string
  viaNpx: boolean
}

/**
 * One live agent per workspace. Swapping agents tears the old process down and
 * starts a new one — ACP sessions are per-process, so there is nothing to carry
 * across, and leaving the loser running would burn a subscription seat.
 */
export class AgentController {
  private sessions = new Map<string, AcpSession>()
  private saveTimers = new Map<string, NodeJS.Timeout>()
  private lastStates = new Map<string, AgentSessionState>()
  private runtimeFile = join(app.getPath('userData'), 'agent-runtime.json')
  private restorable = this.loadRestorable()

  constructor(
    private workspaces: WorkspaceManager,
    private settings: SettingsStore,
    private getSender: () => BrowserWindow | null,
    private transcripts = new TranscriptStore(),
    private onState?: (
      previous: AgentSessionState | undefined,
      next: AgentSessionState
    ) => void
  ) {}

  /** Saved conversations for a folder, newest first. */
  history(cwd?: string): AgentTranscriptMeta[] {
    return this.transcripts.list(cwd)
  }

  transcript(id: string): AgentTranscript | null {
    return this.transcripts.read(id)
  }

  deleteTranscript(id: string): void {
    this.transcripts.remove(id)
  }

  private agentSettings(): typeof DEFAULT_AGENT_SETTINGS {
    return this.settings.all().agent ?? DEFAULT_AGENT_SETTINGS
  }

  /** The pickable agents, with overrides applied so `custom` shows its real line. */
  catalog(): AgentCatalogEntry[] {
    const settings = this.agentSettings()
    return ACP_AGENT_ORDER.map((id) => ({
      id,
      label: ACP_AGENTS[id].label,
      hint: ACP_AGENTS[id].hint,
      command: agentShellCommand(id, settings),
      viaNpx: ACP_AGENTS[id].viaNpx
    }))
  }

  get(wsId: string): AgentSessionState | null {
    return this.sessions.get(wsId)?.snapshot() ?? null
  }

  list(): AgentSessionState[] {
    return [...this.sessions.values()].map((s) => s.snapshot())
  }

  /**
   * Connects `wsId` to `agentId`, starting the process if needed. Returns the
   * state as of the attempt — a failed start is a state with `status: 'error'`,
   * not a thrown error, so the panel can render the reason.
   */
  async open(wsId: string, agentId?: AgentId): Promise<AgentSessionState> {
    const want = agentId ?? this.agentSettings().defaultAgent
    const current = this.sessions.get(wsId)
    if (current && current.agentId === want) {
      if (current.snapshot().status === 'idle') await current.start()
      return current.snapshot()
    }
    if (current) await this.close(wsId, false)

    const ws = this.workspaces.list().find((w) => w.id === wsId)
    if (!ws) throw new Error('workspace not found')

    const session = new AcpSession({
      wsId,
      agentId: want,
      cwd: ws.remotePath,
      workspaces: this.workspaces,
      settings: () => this.agentSettings(),
      onChange: (state) => this.emit(state)
    })
    this.sessions.set(wsId, session)
    this.emit(session.snapshot())
    await session.start()
    this.remember(wsId, want)
    return session.snapshot()
  }

  async close(wsId: string, forget = true): Promise<void> {
    const session = this.sessions.get(wsId)
    if (!session) {
      if (forget) this.forget(wsId)
      return
    }
    this.flush(wsId)
    this.sessions.delete(wsId)
    this.lastStates.delete(wsId)
    await session.dispose()
    if (forget) this.forget(wsId)
    this.send('agent:closed', { wsId })
  }

  /** Same agent, fresh process — the fix for a hung or half-authenticated CLI. */
  async restart(wsId: string): Promise<AgentSessionState> {
    const agentId = this.sessions.get(wsId)?.agentId
    await this.close(wsId, false)
    return this.open(wsId, agentId)
  }

  prompt(wsId: string, text: string): Promise<void> {
    return this.require(wsId).prompt(text)
  }

  cancel(wsId: string): Promise<void> {
    return this.require(wsId).cancel()
  }

  setMode(wsId: string, modeId: string): Promise<void> {
    return this.require(wsId).setMode(modeId)
  }

  respond(wsId: string, requestId: string, optionId: string | null): void {
    this.sessions.get(wsId)?.answerPermission(requestId, optionId)
  }

  authenticate(wsId: string, methodId: string): Promise<void> {
    return this.require(wsId).authenticate(methodId)
  }

  /** Saves what is about to be dropped, then starts the conversation over. */
  clear(wsId: string): Promise<void> {
    this.flush(wsId)
    return this.require(wsId).clear()
  }

  async disposeAll(): Promise<void> {
    const ids = [...this.sessions.keys()]
    for (const id of ids) await this.close(id, false)
  }

  /**
   * ACP processes cannot survive a machine crash, but the runtime can relaunch
   * the same agent against the restored workspace and keep the saved transcript
   * available. A failed host is left in the restore file for the next launch.
   */
  async restoreSessions(): Promise<void> {
    for (const entry of this.restorable) {
      const workspace = this.workspaces.findByPath(entry.hostId, entry.cwd)
      if (!workspace || this.sessions.has(workspace.id)) continue
      try {
        await this.workspaces.waitForConnected(workspace.id, 30_000)
        await this.open(workspace.id, entry.agentId)
      } catch {
        // Workspace status already carries connection failures. Keep the entry.
      }
    }
  }

  private require(wsId: string): AcpSession {
    const session = this.sessions.get(wsId)
    if (!session) throw new Error('no agent running for this workspace')
    return session
  }

  /** Writes the pending transcript now, cancelling the debounce. */
  private flush(wsId: string): void {
    const timer = this.saveTimers.get(wsId)
    if (timer) clearTimeout(timer)
    this.saveTimers.delete(wsId)
    const transcript = this.sessions.get(wsId)?.transcript()
    if (transcript) this.transcripts.save(transcript)
  }

  private scheduleSave(wsId: string): void {
    if (this.saveTimers.has(wsId)) return
    const timer = setTimeout(() => {
      this.saveTimers.delete(wsId)
      const transcript = this.sessions.get(wsId)?.transcript()
      if (transcript) this.transcripts.save(transcript)
    }, SAVE_DEBOUNCE_MS)
    // A pending save must never hold the app open at quit — `disposeAll` flushes.
    timer.unref?.()
    this.saveTimers.set(wsId, timer)
  }

  private emit(state: AgentSessionState): void {
    const previous = this.lastStates.get(state.wsId)
    this.lastStates.set(state.wsId, state)
    this.onState?.(previous, state)
    this.scheduleSave(state.wsId)
    this.send('agent:event', state)
  }

  private send(channel: string, payload: unknown): void {
    const window = this.getSender()
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return
    window.webContents.send(channel, payload)
  }

  private remember(wsId: string, agentId: AgentId): void {
    const workspace = this.workspaces.list().find((candidate) => candidate.id === wsId)
    if (!workspace) return
    this.restorable = [
      ...this.restorable.filter(
        (entry) => entry.hostId !== workspace.hostId || entry.cwd !== workspace.remotePath
      ),
      { hostId: workspace.hostId, cwd: workspace.remotePath, agentId }
    ]
    this.persistRestorable()
  }

  private forget(wsId: string): void {
    const workspace = this.workspaces.list().find((candidate) => candidate.id === wsId)
    if (!workspace) return
    this.restorable = this.restorable.filter(
      (entry) => entry.hostId !== workspace.hostId || entry.cwd !== workspace.remotePath
    )
    this.persistRestorable()
  }

  private loadRestorable(): RestorableAgent[] {
    if (!existsSync(this.runtimeFile)) return []
    try {
      const value = JSON.parse(readFileSync(this.runtimeFile, 'utf8')) as unknown
      if (!Array.isArray(value)) return []
      return value.filter(isRestorableAgent)
    } catch {
      return []
    }
  }

  private persistRestorable(): void {
    const dir = dirname(this.runtimeFile)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const temporary = `${this.runtimeFile}.tmp`
    writeFileSync(temporary, JSON.stringify(this.restorable, null, 2), 'utf8')
    renameSync(temporary, this.runtimeFile)
  }
}

function isRestorableAgent(value: unknown): value is RestorableAgent {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<RestorableAgent>
  return (
    typeof entry.hostId === 'string' &&
    typeof entry.cwd === 'string' &&
    typeof entry.agentId === 'string' &&
    ACP_AGENT_ORDER.includes(entry.agentId as AgentId)
  )
}
