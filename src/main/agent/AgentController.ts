import type { BrowserWindow } from 'electron'
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

  constructor(
    private workspaces: WorkspaceManager,
    private settings: SettingsStore,
    private getSender: () => BrowserWindow | null,
    private transcripts = new TranscriptStore()
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
    if (current) await this.close(wsId)

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
    return session.snapshot()
  }

  async close(wsId: string): Promise<void> {
    const session = this.sessions.get(wsId)
    if (!session) return
    this.flush(wsId)
    this.sessions.delete(wsId)
    await session.dispose()
    this.getSender()?.webContents.send('agent:closed', { wsId })
  }

  /** Same agent, fresh process — the fix for a hung or half-authenticated CLI. */
  async restart(wsId: string): Promise<AgentSessionState> {
    const agentId = this.sessions.get(wsId)?.agentId
    await this.close(wsId)
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
    for (const id of ids) await this.close(id)
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
    this.scheduleSave(state.wsId)
    this.getSender()?.webContents.send('agent:event', state)
  }
}
