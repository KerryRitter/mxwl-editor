import { app } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import type { WorkspaceManager } from '../workspace/WorkspaceManager'

type Message = {
  id?: number
  method?: string
  sessionId?: string
  params?: Record<string, any>
  result?: Record<string, any>
}

/** CDP connects to existing workspace views; new pages become managed mxwl tabs. */
export class WorkspaceCdpBridge {
  private sockets = new WebSocketServer({ noServer: true })
  private workspacesBySocket = new Map<WebSocket, string>()

  constructor(
    private workspaces: WorkspaceManager,
    private authorized: (req: IncomingMessage, wsId: string) => boolean
  ) {}

  attach(server: Server): void {
    server.on('upgrade', async (req, socket, head) => {
      const match = /^\/cdp\/([^/]+)\/?$/.exec(new URL(req.url || '/', 'http://localhost').pathname)
      const wsId = match?.[1]
      if (!wsId || !this.authorized(req, wsId)) {
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
        return
      }
      try {
        await this.workspaces.browserCdpTargets(wsId, true)
        const endpoint = (await this.version()).webSocketDebuggerUrl
        this.sockets.handleUpgrade(req, socket, head, (client) => {
          this.workspacesBySocket.set(client, wsId)
          client.once('close', () => this.workspacesBySocket.delete(client))
          void this.connect(wsId, client, endpoint).catch(() => client.close(1011, 'CDP unavailable'))
        })
      } catch {
        socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n')
      }
    })
  }

  async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const path = new URL(req.url || '/', 'http://localhost').pathname
    const match = /^\/cdp\/([^/]+)\/(json(?:\/version|\/list)?)(?:\/)?$/.exec(path)
    if (!path.startsWith('/cdp/')) return false
    if (!match || !this.authorized(req, match[1])) {
      res.writeHead(403).end('CDP bridge not enabled for this workspace')
      return true
    }
    const wsId = match[1]
    const targets = await this.workspaces.browserCdpTargets(wsId, true)
    // SSH reverse forwarding can use a different host-side port. Preserve the
    // client's loopback address so its WebSocket follows the same tunnel.
    const host = new URL(`http://${req.headers.host || `127.0.0.1:${res.socket?.localPort}`}`)
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(host.hostname)) throw new Error('CDP requires a loopback host')
    const endpoint = `ws://${host.host}/cdp/${wsId}`
    const version = await this.version()
    const body = match[2] === 'json/version'
      ? { ...version, webSocketDebuggerUrl: endpoint }
      : targets.map((target) => ({
          id: target.targetId, type: 'page',
          title: this.workspaces.browserSnapshot(wsId)?.tabs.find((tab) => tab.id === target.tabId)?.title,
          url: this.workspaces.browserSnapshot(wsId)?.tabs.find((tab) => tab.id === target.tabId)?.url,
          webSocketDebuggerUrl: endpoint
        }))
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body))
    return true
  }

  close(): void {
    for (const socket of this.sockets.clients) socket.close()
    this.sockets.close()
  }

  closeWorkspace(wsId: string): void {
    for (const [socket, id] of this.workspacesBySocket) if (id === wsId) socket.close()
  }

  private async version(): Promise<Record<string, string>> {
    let port = Number(app.commandLine.getSwitchValue('remote-debugging-port'))
    if (!port) {
      const file = await readFile(join(app.getPath('userData'), 'DevToolsActivePort'), 'utf8')
      port = Number(file.split('\n')[0])
    }
    const response = await fetch(`http://127.0.0.1:${port}/json/version`)
    if (!response.ok) throw new Error('Chromium CDP is unavailable')
    return response.json() as Promise<Record<string, string>>
  }

  private async connect(wsId: string, client: WebSocket, endpoint: string): Promise<void> {
    const upstream = new WebSocket(endpoint)
    const targets = new Map<string, { tabId: string; browserContextId?: string }>()
    const sessions = new Set<string>()
    const attachedTargets = new Set<string>()
    const attachments = new Map<string, () => void>()
    const ignoredRequests = new Set<number>()
    const requests = new Map<number, string>()
    let internalId = -1
    const refresh = async (): Promise<void> => {
      for (const target of await this.workspaces.browserCdpTargets(wsId)) targets.set(target.targetId, target)
    }
    const ready = new Promise<void>((resolve, reject) => {
      upstream.once('open', resolve)
      upstream.once('error', reject)
    }).then(refresh)
    const send = (message: unknown): void => {
      if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message))
    }
    const reply = (message: Message, result: unknown): void => send({ id: message.id, sessionId: message.sessionId, result })
    const hidden = (method: string, params: unknown): void => {
      const id = internalId--
      ignoredRequests.add(id)
      upstream.send(JSON.stringify({ id, method, params }))
    }
    const fail = (message: Message, reason: string): void => send({
      id: message.id, sessionId: message.sessionId, error: { code: -32000, message: reason }
    })

    // Queue both directions: target creation/attachment must precede page events.
    let inbound = Promise.resolve()
    let outbound = Promise.resolve()
    client.on('message', (raw) => {
      inbound = inbound.then(async () => {
        await ready
        const message = JSON.parse(raw.toString()) as Message
        const method = message.method || ''
        const params = message.params ?? {}
        if (!this.workspaces.browserSnapshot(wsId)) throw new Error('workspace closed')
        if (message.sessionId && !sessions.has(message.sessionId)) return fail(message, 'Unknown workspace session')
        if (method === 'Target.createTarget') {
          const snapshot = this.workspaces.browserSnapshot(wsId)!
          const contextTab = params.browserContextId
            ? [...targets.values()].find((t) => t.browserContextId === params.browserContextId)?.tabId
            : snapshot.activeId
          if (params.browserContextId && !contextTab) return fail(message, 'Browser profile is outside this workspace')
          const groupId = snapshot.tabs.find((t) => t.id === contextTab)?.groupId
          const tabId = this.workspaces.browserNewTab(wsId, String(params.url || 'about:blank'), groupId)
          await refresh()
          const target = [...targets].find(([, value]) => value.tabId === tabId)
          if (!target) throw new Error('Could not identify browser tab')
          // Chromium emits attachedToTarget before createTarget's response.
          // Playwright expects its page object to exist when that response arrives.
          if (!attachedTargets.has(target[0])) await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => { attachments.delete(target[0]); reject(new Error('Browser tab attachment timed out')) }, 10_000)
            attachments.set(target[0], () => { clearTimeout(timer); resolve() })
          })
          return reply(message, { targetId: target[0] })
        }
        if (method === 'Target.createBrowserContext' || method === 'Target.disposeBrowserContext') {
          return fail(message, 'Use browser.contexts()[0]; mxwl owns browser profiles')
        }
        if (method === 'Browser.close') { reply(message, {}); client.close(); return }
        // Keep download ownership with Electron. Chromium's browser-context
        // download API rejects Electron's persisted session partitions.
        if (method === 'Browser.setDownloadBehavior') return reply(message, {})
        if (params.targetId && !targets.has(params.targetId)) {
          await refresh()
          if (!targets.has(params.targetId)) return fail(message, 'Target is outside this workspace')
        }
        if (method === 'Target.closeTarget') {
          const target = targets.get(params.targetId)
          if (target) this.workspaces.browserCloseTab(wsId, target.tabId)
          return reply(message, { success: Boolean(target) })
        }
        if (method === 'Target.activateTarget') {
          const target = targets.get(params.targetId)
          if (target) this.workspaces.browserSetActive(wsId, target.tabId)
        }
        if (method === 'Target.getBrowserContexts') {
          await refresh()
          return reply(message, { browserContextIds: [...new Set([...targets.values()].map((t) => t.browserContextId).filter(Boolean))] })
        }
        if (method === 'Target.setAutoAttach') params.waitForDebuggerOnStart = false
        const contexts = [...targets.values()].map((target) => target.browserContextId).filter(Boolean)
        if (params.browserContextId && !contexts.includes(params.browserContextId)) return fail(message, 'Browser profile is outside this workspace')
        const cookieAction = { 'Storage.getCookies': 'get', 'Storage.setCookies': 'set', 'Storage.clearCookies': 'clear' }[method] as 'get' | 'set' | 'clear' | undefined
        if (cookieAction) {
          const tabId = params.browserContextId
            ? [...targets.values()].find((t) => t.browserContextId === params.browserContextId)?.tabId
            : this.workspaces.browserSnapshot(wsId)?.activeId ?? undefined
          return reply(message, await this.workspaces.browserCookies(wsId, cookieAction, params.cookies, tabId))
        }
        if (!message.sessionId && /^(Storage\.|Browser\.(?:setDownloadBehavior|grantPermissions|resetPermissions))/.test(method) && !params.browserContextId) {
          const active = this.workspaces.browserSnapshot(wsId)?.activeId
          params.browserContextId = [...targets.values()].find((t) => t.tabId === active)?.browserContextId
        }
        message.params = params
        if (message.id != null) requests.set(message.id, method)
        upstream.send(JSON.stringify(message))
      }).catch((error) => { send({ error: { code: -32000, message: String(error) } }); client.close(1011) })
    })
    upstream.on('message', (raw) => {
      outbound = outbound.then(async () => {
        const message = JSON.parse(raw.toString()) as Message
        if (message.id != null && ignoredRequests.delete(message.id)) return
        const params = message.params ?? {}
        if (message.method === 'Target.attachedToTarget') {
          await refresh()
          const owned = targets.has(params.targetInfo?.targetId) || (message.sessionId && sessions.has(message.sessionId))
          if (!owned && params.targetInfo?.type !== 'browser') {
            hidden('Target.detachFromTarget', { sessionId: params.sessionId })
            return
          }
          sessions.add(params.sessionId)
          if (targets.has(params.targetInfo?.targetId)) {
            params.targetInfo.type = 'page'
            attachedTargets.add(params.targetInfo.targetId)
          }
        } else if (message.method === 'Target.detachedFromTarget') {
          if (!sessions.delete(params.sessionId)) return
        } else if (message.method?.startsWith('Target.target')) {
          await refresh()
          if (!targets.has(params.targetId ?? params.targetInfo?.targetId)) return
        } else if (message.sessionId && !sessions.has(message.sessionId)) return
        if (message.id != null) {
          const method = requests.get(message.id)
          requests.delete(message.id)
          if (method === 'Target.getTargets' && message.result) {
            await refresh()
            message.result.targetInfos = message.result.targetInfos.filter((t: { targetId: string }) => targets.has(t.targetId))
          }
          if (method === 'Target.attachToTarget' || method === 'Target.attachToBrowserTarget') {
            if (message.result?.sessionId) sessions.add(message.result.sessionId)
          }
        }
        send(message)
        if (message.method === 'Target.attachedToTarget') {
          attachments.get(params.targetInfo.targetId)?.()
          attachments.delete(params.targetInfo.targetId)
        }
      }).catch(() => client.close(1011, 'Workspace browser unavailable'))
    })
    upstream.on('error', () => client.close(1011, 'Chromium connection failed'))
    upstream.on('close', () => client.close())
    client.on('error', () => upstream.close())
    client.on('close', () => upstream.close())
    await ready
  }
}
