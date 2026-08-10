import { randomUUID } from 'node:crypto'
import * as acp from '@agentclientprotocol/sdk'
import type {
  AgentBlock,
  AgentId,
  AgentMessage,
  AgentPermissionRequest,
  AgentSessionState,
  AgentSettings,
  AgentToolContent,
  AgentTranscript
} from '../../shared/types'
import { ACP_AGENTS, agentLaunch, agentShellCommand } from '../../shared/acpAgents'
import { annotateModes, buildCommandPalette, permissiveMode } from '../../shared/agentCommands'
import type { WorkspaceManager } from '../workspace/WorkspaceManager'
import { LocalConnection, type ChannelLike } from '../workspace/LocalConnection'
import { shellQuote, USER_PATH_PREAMBLE } from '../workspace/util'
import { channelStream } from './stream'

/** Diagnostics an agent writes to stderr, kept for the error banner. */
const STDERR_LIMIT = 4000
/** An agent that never answers `initialize` is broken, not slow. */
const INIT_TIMEOUT_MS = 60_000

export type AcpSessionOptions = {
  wsId: string
  agentId: AgentId
  cwd: string
  workspaces: WorkspaceManager
  settings: () => AgentSettings
  onChange: (state: AgentSessionState) => void
}

/**
 * One ACP connection: an agent subprocess (local) or `ssh exec` (remote), the
 * JSON-RPC client on top of it, and the transcript it produces. The class owns
 * the whole lifetime — `dispose()` is the only way it stops.
 */
export class AcpSession {
  readonly wsId: string
  readonly agentId: AgentId

  private state: AgentSessionState
  private workspaces: WorkspaceManager
  private getSettings: () => AgentSettings
  private onChange: (state: AgentSessionState) => void

  /** Identifies this conversation's file on disk; a fresh session gets a fresh one */
  private transcriptId = randomUUID()

  private channel: ChannelLike | null = null
  private conn: acp.ClientConnection | null = null
  private agent: acp.ClientContext | null = null
  private stderr = ''
  private disposed = false

  /** Permission requests parked until the UI answers them */
  private pending = new Map<
    string,
    (outcome: acp.RequestPermissionResponse['outcome']) => void
  >()

  constructor(opts: AcpSessionOptions) {
    this.wsId = opts.wsId
    this.agentId = opts.agentId
    this.workspaces = opts.workspaces
    this.getSettings = opts.settings
    this.onChange = opts.onChange
    this.state = {
      wsId: opts.wsId,
      agentId: opts.agentId,
      agentLabel: ACP_AGENTS[opts.agentId].label,
      status: 'idle',
      turn: 'idle',
      error: null,
      agentInfo: null,
      sessionId: null,
      cwd: opts.cwd,
      messages: [],
      plan: [],
      commands: buildCommandPalette([]),
      modes: { current: null, available: [] },
      authMethods: [],
      permission: null,
      usage: null,
      startedAt: Date.now()
    }
  }

  snapshot(): AgentSessionState {
    return this.state
  }

  /** What gets persisted. Null until the conversation has something in it. */
  transcript(): AgentTranscript | null {
    if (this.state.messages.length === 0) return null
    const first = this.state.messages.find((m) => m.role === 'user')
    return {
      id: this.transcriptId,
      agentId: this.agentId,
      agentLabel: this.state.agentLabel,
      cwd: this.state.cwd,
      startedAt: this.state.startedAt,
      updatedAt: Date.now(),
      messageCount: this.state.messages.length,
      title: first ? messageText(first).slice(0, 120) : this.state.agentLabel,
      messages: this.state.messages
    }
  }

  // ── lifecycle ──────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.state.status === 'starting' || this.state.status === 'ready') return
    this.patch({ status: 'starting', error: null })

    const settings = this.getSettings()
    const launch = agentLaunch(this.agentId, settings)
    if (!launch.command) {
      this.fail(`No command configured for ${this.state.agentLabel} — set one in Settings → Agent`)
      return
    }

    try {
      this.channel = await this.spawn(settings)
    } catch (err) {
      this.fail(`could not start ${this.state.agentLabel}: ${errText(err)}`)
      return
    }

    const stream = channelStream(
      this.channel,
      (text) => this.noteStderr(text),
      (code) => this.onExit(code)
    )

    const app = acp
      .client({ name: 'mxwl' })
      .onNotification(acp.methods.client.session.update, (ctx) => this.applyUpdate(ctx.params))
      .onRequest(acp.methods.client.session.requestPermission, (ctx) =>
        this.askPermission(ctx.params)
      )
      .onRequest(acp.methods.client.fs.readTextFile, (ctx) => this.readTextFile(ctx.params))
      .onRequest(acp.methods.client.fs.writeTextFile, (ctx) => this.writeTextFile(ctx.params))

    this.conn = app.connect(stream)
    this.agent = this.conn.agent

    try {
      const init = await withTimeout(
        this.agent.request(acp.methods.agent.initialize, {
          protocolVersion: acp.PROTOCOL_VERSION,
          clientInfo: { name: 'mxwl', version: '0.2.0' },
          // Terminals stay off: mxwl already gives the agent a real terminal tab,
          // and claiming the capability means owning process lifetime too.
          clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } }
        }),
        INIT_TIMEOUT_MS,
        'agent did not answer initialize'
      )

      this.patch({
        agentInfo: init.agentInfo ? `${init.agentInfo.name} ${init.agentInfo.version}` : null,
        authMethods: (init.authMethods ?? []).map((m) => ({
          id: m.id,
          name: m.name,
          description: m.description ?? null
        }))
      })

      await this.newSession()
    } catch (err) {
      // An agent that needs login rejects `session/new`, and the useful next step
      // is the auth picker rather than a raw JSON-RPC error.
      if (this.state.authMethods.length > 0) {
        this.patch({ status: 'auth-required', error: errText(err) })
      } else {
        this.fail(errText(err))
      }
    }
  }

  private async spawn(settings: AgentSettings): Promise<ChannelLike> {
    const conn = this.workspaces.getConnection(this.wsId)
    if (!conn) throw new Error('workspace is not open')

    // Both sides need a login shell: ssh2's exec skips one entirely, and a local
    // Electron app inherits the launcher's PATH, not the user's. The preamble
    // covers what a login shell still misses — see USER_PATH_PREAMBLE.
    const line = `${USER_PATH_PREAMBLE}; cd ${shellQuote(this.state.cwd)} && exec ${agentShellCommand(this.agentId, settings)}`
    const stream = await conn.execStream(
      conn instanceof LocalConnection ? line : `bash -lc ${shellQuote(line)}`
    )
    return stream as ChannelLike
  }

  private async newSession(): Promise<void> {
    const agent = this.require()
    const res = await agent.request(acp.methods.agent.session.new, {
      cwd: this.state.cwd,
      mcpServers: []
    })
    this.patch({
      status: 'ready',
      error: null,
      sessionId: res.sessionId,
      modes: {
        current: res.modes?.currentModeId ?? null,
        available: annotateModes(res.modes?.availableModes ?? [])
      }
    })
    await this.applyAutoApproveMode()
  }

  /**
   * Puts the session straight into its most permissive posture when auto-approve
   * is on. Rejected by an agent that gates the mode behind a flag — that is not
   * a failed session, so it stays a note rather than an error.
   */
  private async applyAutoApproveMode(): Promise<void> {
    if (!this.getSettings().autoApprove) return
    const mode = permissiveMode(this.state.modes.available)
    if (!mode || mode.id === this.state.modes.current) return
    try {
      await this.setMode(mode.id)
    } catch (err) {
      this.noteStderr(`could not switch to ${mode.name}: ${errText(err)}\n`)
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true
    for (const resolve of this.pending.values()) resolve({ outcome: 'cancelled' })
    this.pending.clear()
    try {
      this.conn?.close()
    } catch {
      // the stream may already be torn down
    }
    this.conn = null
    this.agent = null
    const ch = this.channel
    this.channel = null
    try {
      ch?.destroy?.() ?? ch?.end()
    } catch {
      // the process may already be gone
    }
  }

  // ── actions ────────────────────────────────────────────────────────────────

  /** Sends a user turn. Resolves when the agent stops, not when it starts. */
  async prompt(text: string): Promise<void> {
    const agent = this.require()
    if (!this.state.sessionId) throw new Error('no active session')
    if (this.state.turn !== 'idle') throw new Error('a turn is already running')

    this.append({
      id: randomUUID(),
      role: 'user',
      ts: Date.now(),
      blocks: [{ kind: 'text', text }]
    })
    this.patch({ turn: 'running', error: null })

    try {
      const res = await agent.request(acp.methods.agent.session.prompt, {
        sessionId: this.state.sessionId,
        prompt: [{ type: 'text', text }]
      })
      if (res.stopReason === 'refusal') {
        this.patch({ error: 'the agent refused this turn' })
      }
    } catch (err) {
      this.patch({ error: errText(err) })
    } finally {
      this.patch({ turn: 'idle' })
    }
  }

  /**
   * `session/cancel` is a notification, so it only asks. The turn ends when the
   * in-flight `session/prompt` returns `cancelled`, which is what clears `turn`.
   */
  async cancel(): Promise<void> {
    if (this.state.turn !== 'running' || !this.state.sessionId) return
    this.patch({ turn: 'cancelling' })
    await this.require().notify(acp.methods.agent.session.cancel, {
      sessionId: this.state.sessionId
    })
  }

  async setMode(modeId: string): Promise<void> {
    if (!this.state.sessionId) throw new Error('no active session')
    await this.require().request(acp.methods.agent.session.setMode, {
      sessionId: this.state.sessionId,
      modeId
    })
    // Agents may also echo this back via `current_mode_update`; setting it here
    // means the picker doesn't sit stale on the ones that don't.
    this.patch({ modes: { ...this.state.modes, current: modeId } })
  }

  answerPermission(requestId: string, optionId: string | null): void {
    const resolve = this.pending.get(requestId)
    if (!resolve) return
    this.pending.delete(requestId)
    resolve(optionId ? { outcome: 'selected', optionId } : { outcome: 'cancelled' })
    if (this.state.permission?.requestId === requestId) this.patch({ permission: null })
  }

  async authenticate(methodId: string): Promise<void> {
    await this.require().request(acp.methods.agent.authenticate, { methodId })
    await this.newSession()
  }

  /** Drops the conversation and opens a fresh ACP session on the same process. */
  async clear(): Promise<void> {
    // The cleared conversation keeps the file it was already saved under, so
    // what follows is a new one rather than an overwrite of the old.
    this.transcriptId = randomUUID()
    this.patch({ messages: [], plan: [], usage: null, error: null, startedAt: Date.now() })
    await this.newSession()
  }

  // ── inbound ────────────────────────────────────────────────────────────────

  private applyUpdate(params: acp.SessionNotification): void {
    const u = params.update
    switch (u.sessionUpdate) {
      case 'agent_message_chunk':
        this.appendChunk('text', u.content)
        break
      case 'agent_thought_chunk':
        this.appendChunk('thought', u.content)
        break
      case 'user_message_chunk':
        // Echo of what we already rendered locally — showing it again duplicates
        // the user's own message in the transcript.
        break
      case 'tool_call':
        this.agentMessage().blocks.push({
          kind: 'tool',
          toolCallId: u.toolCallId,
          title: u.title,
          name: u.name ?? null,
          toolKind: u.kind ?? 'other',
          status: u.status ?? 'pending',
          content: (u.content ?? []).map(toToolContent),
          locations: (u.locations ?? []).map((l) => l.path)
        })
        this.emit()
        break
      case 'tool_call_update': {
        const block = this.findTool(u.toolCallId)
        if (!block) break
        if (u.title != null) block.title = u.title
        if (u.name != null) block.name = u.name
        if (u.kind != null) block.toolKind = u.kind
        if (u.status != null) block.status = u.status
        if (u.content != null) block.content = u.content.map(toToolContent)
        if (u.locations != null) block.locations = u.locations.map((l) => l.path)
        this.emit()
        break
      }
      case 'plan':
        this.patch({ plan: u.entries.map(toPlanEntry) })
        break
      case 'plan_update':
        // `file` and `markdown` plans are documents, not checklists — the panel
        // has nowhere to put them, so only the itemised form updates the tracker.
        if (u.plan.type === 'items') this.patch({ plan: u.plan.entries.map(toPlanEntry) })
        break
      case 'plan_removed':
        this.patch({ plan: [] })
        break
      case 'available_commands_update':
        this.patch({ commands: buildCommandPalette(u.availableCommands) })
        break
      case 'current_mode_update':
        this.patch({ modes: { ...this.state.modes, current: u.currentModeId } })
        break
      case 'usage_update':
        this.patch({ usage: { used: u.used, size: u.size } })
        break
      default:
        break
    }
  }

  private askPermission(
    params: acp.RequestPermissionRequest
  ): Promise<acp.RequestPermissionResponse> {
    const requestId = randomUUID()
    const request: AgentPermissionRequest = {
      requestId,
      toolCallId: params.toolCall.toolCallId,
      title: params.toolCall.title ?? 'Permission required',
      toolKind: params.toolCall.kind ?? 'other',
      content: (params.toolCall.content ?? []).map(toToolContent),
      options: params.options.map((o) => ({
        optionId: o.optionId,
        name: o.name,
        kind: o.kind
      }))
    }
    // Auto-approve answers before the card is ever shown. Modes cover the agents
    // that have one; this covers the rest, and the tool call still renders, so
    // what ran stays visible in the transcript.
    if (this.getSettings().autoApprove) {
      const allow =
        request.options.find((o) => o.kind === 'allow_always') ??
        request.options.find((o) => o.kind === 'allow_once')
      if (allow) return Promise.resolve({ outcome: { outcome: 'selected', optionId: allow.optionId } })
    }

    this.patch({ permission: request })
    return new Promise((resolve) => {
      this.pending.set(requestId, (outcome) => resolve({ outcome }))
    })
  }

  /**
   * Agents read through the client so the editor's view of a file wins over what
   * is on disk. mxwl has no unsaved-buffer store yet, so this is the workspace's
   * own fs — which is the point for remote hosts, where the agent's `cat` and
   * mxwl's sftp are the same machine but the agent's line/limit slicing is not.
   */
  private async readTextFile(
    params: acp.ReadTextFileRequest
  ): Promise<acp.ReadTextFileResponse> {
    const res = await this.workspaces.fsReadFile(this.wsId, params.path)
    if (res.encoding !== 'utf8') throw new Error(`${params.path} is not text`)
    if (params.line == null && params.limit == null) return { content: res.content }
    const lines = res.content.split('\n')
    const from = Math.max(0, (params.line ?? 1) - 1)
    const to = params.limit != null ? from + params.limit : lines.length
    return { content: lines.slice(from, to).join('\n') }
  }

  private async writeTextFile(params: acp.WriteTextFileRequest): Promise<void> {
    await this.workspaces.fsWriteFile(this.wsId, params.path, params.content)
  }

  // ── transcript helpers ─────────────────────────────────────────────────────

  /** The agent message this turn is writing into, created on first output. */
  private agentMessage(): AgentMessage {
    const last = this.state.messages[this.state.messages.length - 1]
    if (last?.role === 'agent') return last
    const msg: AgentMessage = { id: randomUUID(), role: 'agent', ts: Date.now(), blocks: [] }
    this.state.messages = [...this.state.messages, msg]
    return msg
  }

  private appendChunk(kind: 'text' | 'thought', content: acp.ContentBlock): void {
    const text = contentText(content)
    if (!text) return
    const msg = this.agentMessage()
    const last = msg.blocks[msg.blocks.length - 1]
    // Chunks arrive token-by-token; merging into the trailing block of the same
    // kind is what turns them back into a paragraph instead of a list of fragments.
    if (last && last.kind === kind) last.text += text
    else msg.blocks.push({ kind, text })
    this.emit()
  }

  private findTool(toolCallId: string): Extract<AgentBlock, { kind: 'tool' }> | null {
    for (let i = this.state.messages.length - 1; i >= 0; i--) {
      const blocks = this.state.messages[i].blocks
      for (let j = blocks.length - 1; j >= 0; j--) {
        const b = blocks[j]
        if (b.kind === 'tool' && b.toolCallId === toolCallId) return b
      }
    }
    return null
  }

  private append(msg: AgentMessage): void {
    this.state.messages = [...this.state.messages, msg]
    this.emit()
  }

  // ── plumbing ───────────────────────────────────────────────────────────────

  private require(): acp.ClientContext {
    if (!this.agent) throw new Error(`${this.state.agentLabel} is not running`)
    return this.agent
  }

  private noteStderr(text: string): void {
    this.stderr = (this.stderr + text).slice(-STDERR_LIMIT)
  }

  private onExit(code: number | null): void {
    if (this.disposed) return
    const tail = this.stderr.trim().split('\n').slice(-4).join('\n')
    const hint = ACP_AGENTS[this.agentId].hint
    this.patch({
      status: 'exited',
      turn: 'idle',
      sessionId: null,
      error:
        code === 0
          ? `${this.state.agentLabel} exited`
          : `${this.state.agentLabel} exited (${code ?? 'signal'})${tail ? `\n${tail}` : `\n${hint}`}`
    })
  }

  private fail(message: string): void {
    const tail = this.stderr.trim().split('\n').slice(-4).join('\n')
    this.patch({ status: 'error', turn: 'idle', error: tail ? `${message}\n${tail}` : message })
  }

  private patch(patch: Partial<AgentSessionState>): void {
    this.state = { ...this.state, ...patch }
    this.emit()
  }

  private emit(): void {
    if (this.disposed) return
    // Messages mutate in place while chunks stream, so the identity has to change
    // for the renderer's store to see a new transcript.
    this.state = { ...this.state, messages: [...this.state.messages] }
    this.onChange(this.state)
  }
}

/** Flattens a message to plain text, for the transcript's one-line title. */
function messageText(msg: AgentMessage): string {
  return msg.blocks
    .map((b) => (b.kind === 'text' || b.kind === 'thought' ? b.text : b.kind === 'tool' ? b.title : ''))
    .join(' ')
    .trim()
}

function contentText(content: acp.ContentBlock): string {
  if (content.type === 'text') return content.text
  if (content.type === 'resource_link') return `[${content.name || content.uri}]`
  return `[${content.type}]`
}

function toToolContent(c: acp.ToolCallContent): AgentToolContent {
  if (c.type === 'diff') {
    return { kind: 'diff', path: c.path, oldText: c.oldText ?? null, newText: c.newText }
  }
  if (c.type === 'terminal') return { kind: 'terminal', terminalId: c.terminalId }
  return { kind: 'text', text: contentText(c.content) }
}

function toPlanEntry(e: acp.PlanEntry): AgentSessionState['plan'][number] {
  return { content: e.content, priority: e.priority, status: e.status }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      }
    )
  })
}

function errText(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err) return String(err.message)
  return String(err)
}
