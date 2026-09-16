import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Socket } from 'node:net'
import type { AgentController } from '../agent/AgentController'
import type { AttentionController } from '../agent/AttentionController'
import type { HostManager } from '../hosts/HostManager'
import type { SettingsStore } from '../persistence/SettingsStore'
import type { WorkspaceManager } from '../workspace/WorkspaceManager'
import type { ControlStatus, FleetAgent } from '../../shared/types'
import { agentActivity } from '../../shared/agentActivity'
import { CONTROL_DASHBOARD_HTML } from './dashboard'

const BODY_LIMIT = 1024 * 1024

export class ControlServer {
  private server: Server | null = null
  private sockets = new Set<Socket>()
  private currentStatus: ControlStatus = {
    enabled: false,
    running: false,
    host: '127.0.0.1',
    port: 9233,
    url: 'http://127.0.0.1:9233'
  }
  private restartTimer: NodeJS.Timeout | null = null
  private unsubscribe: (() => void) | null = null

  constructor(
    private agents: AgentController,
    private attention: AttentionController,
    private workspaces: WorkspaceManager,
    private hosts: HostManager,
    private settings: SettingsStore,
    private focusAgent: (wsId: string) => void
  ) {}

  start(): void {
    this.applySettings()
    this.unsubscribe = this.settings.subscribe(() => {
      if (this.restartTimer) clearTimeout(this.restartTimer)
      this.restartTimer = setTimeout(() => {
        this.restartTimer = null
        this.applySettings()
      }, 150)
    })
  }

  stop(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.restartTimer = null
    for (const socket of this.sockets) socket.destroy()
    this.sockets.clear()
    this.server?.close()
    this.server = null
    this.currentStatus = { ...this.currentStatus, running: false }
  }

  status(): ControlStatus {
    return { ...this.currentStatus }
  }

  fleet(): FleetAgent[] {
    const workspaces = new Map(this.workspaces.list().map((workspace) => [workspace.id, workspace]))
    return this.agents.list().map((state) => {
      const workspace = workspaces.get(state.wsId)
      const hostId = workspace?.hostId ?? ''
      return {
        wsId: state.wsId,
        workspaceTitle: workspace?.title ?? state.cwd.split('/').filter(Boolean).at(-1) ?? state.cwd,
        issueKey: workspace?.derived.issueKey ?? null,
        cwd: state.cwd,
        hostId,
        hostLabel: this.hosts.get(hostId)?.label ?? 'Unknown host',
        agentId: state.agentId,
        agentLabel: state.agentLabel,
        activity: agentActivity(state),
        permission: state.permission,
        startedAt: state.startedAt
      }
    })
  }

  private applySettings(): void {
    const config = this.settings.all().control
    const host = config.remoteAccess ? '0.0.0.0' : '127.0.0.1'
    const overridePort = process.env['MXWL_CONTROL_PORT']
    const requestedPort = overridePort == null ? config.port || 9233 : Number(overridePort)
    const port = requestedPort === 0 ? 0 : Math.max(1024, Math.min(65535, requestedPort))
    const unchanged =
      this.server &&
      this.currentStatus.running &&
      this.currentStatus.enabled === config.enabled &&
      this.currentStatus.host === host &&
      (port === 0 || this.currentStatus.port === port)
    if (unchanged) return

    for (const socket of this.sockets) socket.destroy()
    this.sockets.clear()
    this.server?.close()
    this.server = null
    this.currentStatus = {
      enabled: config.enabled,
      running: false,
      host,
      port,
      url: `http://127.0.0.1:${port}`
    }
    if (!config.enabled) return

    const server = createServer((request, response) => {
      void this.handle(request, response).catch((error) => {
        sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
      })
    })
    server.on('connection', (socket) => {
      this.sockets.add(socket)
      socket.on('close', () => this.sockets.delete(socket))
    })
    server.on('error', (error) => {
      this.currentStatus = { ...this.currentStatus, running: false, error: error.message }
    })
    server.listen(port, host, () => {
      const address = server.address()
      const actualPort = typeof address === 'object' && address ? address.port : port
      this.currentStatus = {
        ...this.currentStatus,
        port: actualPort,
        url: `http://127.0.0.1:${actualPort}`,
        running: true,
        error: undefined
      }
    })
    this.server = server
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
    if (request.method === 'GET' && url.pathname === '/') {
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      })
      response.end(CONTROL_DASHBOARD_HTML)
      return
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, { ok: true, running: this.currentStatus.running })
      return
    }
    if (!this.authorized(request, url)) {
      sendJson(response, 401, { error: 'Unauthorized' })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/status') {
      sendJson(response, 200, {
        runtime: this.status(),
        agents: this.fleet(),
        attention: this.attention.list().filter((record) => !record.read)
      })
      return
    }
    if (request.method === 'GET' && url.pathname === '/api/agents') {
      sendJson(response, 200, this.fleet())
      return
    }
    if (request.method === 'GET' && url.pathname === '/api/attention') {
      sendJson(response, 200, this.attention.list())
      return
    }

    const match = /^\/api\/agents\/([^/]+)\/(focus|prompt|respond|wait)$/.exec(url.pathname)
    if (match) {
      const state = this.resolveAgent(decodeURIComponent(match[1]))
      if (!state) {
        sendJson(response, 404, { error: 'Agent target not found or ambiguous' })
        return
      }
      const action = match[2]
      if (action === 'focus' && request.method === 'POST') {
        this.focusAgent(state.wsId)
        sendJson(response, 200, { ok: true })
        return
      }
      if (action === 'prompt' && request.method === 'POST') {
        const body = await readJson(request)
        const text = typeof body.text === 'string' ? body.text.trim() : ''
        if (!text) throw new Error('Prompt text is required')
        if (body.wait === true) await this.agents.prompt(state.wsId, text)
        else void this.agents.prompt(state.wsId, text)
        sendJson(response, body.wait === true ? 200 : 202, { ok: true })
        return
      }
      if (action === 'respond' && request.method === 'POST') {
        const body = await readJson(request)
        this.agents.respond(
          state.wsId,
          String(body.requestId ?? ''),
          body.optionId == null ? null : String(body.optionId)
        )
        sendJson(response, 200, { ok: true })
        return
      }
      if (action === 'wait' && request.method === 'GET') {
        const until = (url.searchParams.get('until') ?? 'idle,attention,error').split(',')
        const timeout = Math.max(0, Math.min(3_600_000, Number(url.searchParams.get('timeout')) || 300_000))
        const result = await this.waitFor(state.wsId, until, timeout)
        sendJson(response, result ? 200 : 408, result ?? { error: 'Timed out' })
        return
      }
    }

    sendJson(response, 404, { error: 'Not found' })
  }

  private authorized(request: IncomingMessage, url: URL): boolean {
    const token = this.settings.all().control.authToken
    const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, '')
    return Boolean(token) && (bearer === token || url.searchParams.get('token') === token)
  }

  private resolveAgent(target: string) {
    const normalized = target.toLowerCase()
    const states = this.agents.list()
    const exact = states.filter((state) => state.wsId === target)
    if (exact.length === 1) return exact[0]
    const workspaces = new Map(this.workspaces.list().map((workspace) => [workspace.id, workspace]))
    const matches = states.filter((state) => {
      const workspace = workspaces.get(state.wsId)
      return (
        state.agentLabel.toLowerCase() === normalized ||
        workspace?.title.toLowerCase() === normalized ||
        workspace?.derived.issueKey?.toLowerCase() === normalized
      )
    })
    return matches.length === 1 ? matches[0] : null
  }

  private async waitFor(wsId: string, until: string[], timeoutMs: number): Promise<FleetAgent | null> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const agent = this.fleet().find((candidate) => candidate.wsId === wsId)
      if (!agent) return null
      if (until.includes(agent.activity.state)) return agent
      if (Date.now() >= deadline) return null
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = ''
  for await (const chunk of request) {
    raw += String(chunk)
    if (raw.length > BODY_LIMIT) throw new Error('Request body is too large')
  }
  if (!raw) return {}
  const value = JSON.parse(raw) as unknown
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object')
  return value as Record<string, unknown>
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  if (response.headersSent) return
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  })
  response.end(JSON.stringify(value))
}
