import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import type { WorkspaceManager } from '../workspace/WorkspaceManager'
import type { SettingsStore } from '../persistence/SettingsStore'
import { JiraClient } from '../integrations/JiraClient'
import { WorkspaceCdpBridge } from './WorkspaceCdpBridge'
import { workspaceBridgeConfig, workspaceBridgeUrls } from './connection'

export interface McpServerOptions {
  port?: number
  workspaceManager: WorkspaceManager
  settingsStore: SettingsStore
  isEnabled?: (workspaceId: string) => boolean
}

function text(value: unknown): { type: 'text'; text: string } {
  return { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) ?? 'null' }
}

export class WorkspaceMcpServer {
  private httpServer: ReturnType<typeof createServer> | null = null
  private connections = new Set<McpServer>()
  private cdp: WorkspaceCdpBridge | null = null
  private port: number

  constructor(private opts: McpServerOptions) {
    this.port = opts.port ?? 9223
  }

  get listeningPort(): number {
    return this.port
  }

  private createMcp(scope?: string, port = this.port): McpServer {
    const { workspaceManager: wm, settingsStore } = this.opts
    const workspace = (requested?: string): string => {
      const id = requested ?? scope
      if (!id) throw new Error('workspaceId is required on the unscoped endpoint')
      if (scope && id !== scope) throw new Error('workspace is outside this project connection')
      if (this.opts.isEnabled && !this.opts.isEnabled(id)) throw new Error('MCP bridge is not enabled for this workspace')
      if (!wm.browserSnapshot(id)) throw new Error('workspace not found')
      return id
    }

    const mcp = new McpServer(
      { name: 'mxwl-editor', version: '0.1.0' },
      { capabilities: { tools: {}, resources: {}, prompts: {} } }
    )

    mcp.tool('workspace_list', 'List open workspaces', {}, async () => ({
      content: [
        text(
          wm.list().filter((w) => (!scope || w.id === scope) && (!this.opts.isEnabled || this.opts.isEnabled(w.id))).map((w) => ({
            id: w.id,
            title: w.title,
            remotePath: w.remotePath,
            branch: w.derived.branch,
            issueKey: w.derived.issueKey,
            status: w.status
          }))
        )
      ]
    }))

    mcp.tool(
      'fs_list',
      'List files in a remote directory',
      { workspaceId: z.string().optional(), path: z.string() },
      async ({ workspaceId, path }) => {
        const entries = await wm.fsReadDir(workspace(workspaceId), path)
        return { content: [text(entries)] }
      }
    )

    mcp.tool(
      'fs_read',
      'Read a remote file (text)',
      { workspaceId: z.string().optional(), path: z.string() },
      async ({ workspaceId, path }) => {
        const res = await wm.fsReadFile(workspace(workspaceId), path)
        return { content: [text(res.encoding === 'utf8' ? res.content : res)] }
      }
    )

    mcp.tool(
      'fs_write',
      'Write a remote file',
      { workspaceId: z.string().optional(), path: z.string(), content: z.string() },
      async ({ workspaceId, path, content }) => {
        await wm.fsWriteFile(workspace(workspaceId), path, content)
        return { content: [text({ ok: true, path })] }
      }
    )

    mcp.tool(
      'terminal_exec',
      'Run a one-shot command in the workspace (returns full output)',
      { workspaceId: z.string().optional(), command: z.string() },
      async ({ workspaceId, command }) => {
        const result = await wm.execInWorkspace(workspace(workspaceId), command)
        return { content: [text(result)] }
      }
    )

    mcp.tool(
      'dev_status',
      'Get dev server statuses for a workspace',
      { workspaceId: z.string().optional() },
      async ({ workspaceId }) => ({ content: [text(wm.devSnapshot(workspace(workspaceId)))] })
    )

    mcp.tool(
      'browser_navigate',
      'Navigate the active browser tab of a workspace',
      { workspaceId: z.string().optional(), url: z.string() },
      async ({ workspaceId, url }) => {
        wm.browserNavigateActive(workspace(workspaceId), url)
        return { content: [text({ ok: true, url })] }
      }
    )

    mcp.tool(
      'jira_get',
      'Fetch a Jira issue by key (requires Jira configured in settings)',
      { key: z.string() },
      async ({ key }) => {
        const jira = new JiraClient(settingsStore.all())
        const issue = await jira.getIssue(key)
        return { content: [text(issue)] }
      }
    )

    mcp.tool('browser_tabs', 'List embedded Chromium tabs in this workspace',
      { workspaceId: z.string().optional() }, async ({ workspaceId }) => ({
        content: [text(wm.browserSnapshot(workspace(workspaceId)))]
      }))
    mcp.tool('browser_new_tab', 'Open a managed tab in the workspace embedded browser',
      { workspaceId: z.string().optional(), url: z.string().optional() }, async ({ workspaceId, url }) => ({
        content: [text({ tabId: wm.browserNewTab(workspace(workspaceId), url || 'about:blank') })]
      }))
    mcp.tool('browser_select_tab', 'Select an embedded browser tab',
      { workspaceId: z.string().optional(), tabId: z.string() }, async ({ workspaceId, tabId }) => {
        const id = workspace(workspaceId)
        if (!wm.browserSnapshot(id)?.tabs.some((tab) => tab.id === tabId)) throw new Error('browser tab not found')
        wm.browserSetActive(id, tabId)
        return { content: [text({ ok: true })] }
      })
    mcp.tool('browser_evaluate', 'Evaluate JavaScript inside an existing embedded Chromium tab',
      { workspaceId: z.string().optional(), expression: z.string(), tabId: z.string().optional() },
      async ({ workspaceId, expression, tabId }) => ({ content: [text(await wm.browserEvaluate(workspace(workspaceId), expression, tabId))] }))
    mcp.tool('browser_screenshot', 'Capture an embedded Chromium tab as a PNG',
      { workspaceId: z.string().optional(), tabId: z.string().optional() },
      async ({ workspaceId, tabId }) => ({ content: [{ type: 'image' as const, mimeType: 'image/png', data: await wm.browserScreenshot(workspace(workspaceId), tabId) }] }))
    mcp.tool('browser_connect', 'Get the workspace CDP endpoint and Playwright MCP configuration. Use connectOverCDP and browser.contexts()[0]; new pages appear in mxwl.',
      { workspaceId: z.string().optional() }, async ({ workspaceId }) => {
        const id = workspace(workspaceId)
        return { content: [text({ ...workspaceBridgeUrls(id, port), workspaceId: id,
          config: workspaceBridgeConfig(id, '', port),
          example: `const browser = await chromium.connectOverCDP('${workspaceBridgeUrls(id, port).cdpUrl}');\nconst context = browser.contexts()[0];\nconst page = context.pages()[0] || await context.newPage();`,
          authentication: settingsStore.all().mcpAuthToken ? 'Use the same Authorization Bearer header as this MCP connection for CDP.' : undefined
        })] }
      })
    return mcp
  }

  async start(): Promise<void> {
    if (this.httpServer) return
    const { settingsStore } = this.opts
    const authorized = (req: IncomingMessage): boolean => {
      const token = settingsStore.all().mcpAuthToken
      return !token || req.headers.authorization === `Bearer ${token}` || req.headers['x-mxwl-token'] === token
    }
    const cdp = new WorkspaceCdpBridge(this.opts.workspaceManager, (req, id) =>
      authorized(req) && (!this.opts.isEnabled || this.opts.isEnabled(id)))

    const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (!authorized(req)) {
          res.writeHead(401, { 'Content-Type': 'text/plain' })
          res.end('unauthorized')
          return
      }
      try {
        if (await cdp.handleHttp(req, res)) return
        const match = /^\/mcp(?:\/([^/]+))?\/?$/.exec(new URL(req.url || '/', 'http://localhost').pathname)
        if (!match || (match[1] && this.opts.isEnabled && !this.opts.isEnabled(match[1]))) {
          res.writeHead(404).end('MCP endpoint not found')
          return
        }
        const port = Number(new URL(`http://${req.headers.host || `127.0.0.1:${this.port}`}`).port) || this.port
        const mcp = this.createMcp(match[1], port)
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
        this.connections.add(mcp)
        res.on('close', () => { this.connections.delete(mcp); void mcp.close() })
        await mcp.connect(transport)
        await transport.handleRequest(req, res)
      } catch (err) {
        res.writeHead(500)
        res.end(String(err))
      }
    })

    cdp.attach(httpServer)
    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject)
      httpServer.listen(this.port, '127.0.0.1', () => resolve())
    })
    const address = httpServer.address()
    if (address && typeof address === 'object') this.port = address.port
    this.httpServer = httpServer
    this.cdp = cdp
  }

  async stop(): Promise<void> {
    this.cdp?.close()
    this.cdp = null
    if (this.httpServer) {
      await new Promise<void>((resolve) => this.httpServer!.close(() => resolve()))
      this.httpServer = null
    }
    await Promise.all([...this.connections].map((mcp) => mcp.close()))
    this.connections.clear()
  }

  disableWorkspace(id: string): void {
    this.cdp?.closeWorkspace(id)
  }
}
