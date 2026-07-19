import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import type { WorkspaceManager } from '../workspace/WorkspaceManager'
import type { SettingsStore } from '../persistence/SettingsStore'
import { JiraClient } from '../integrations/JiraClient'

export interface McpServerOptions {
  port?: number
  workspaceManager: WorkspaceManager
  settingsStore: SettingsStore
}

function text(value: unknown): { type: 'text'; text: string } {
  return { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }
}

export class WorkspaceMcpServer {
  private httpServer: ReturnType<typeof createServer> | null = null
  private mcp: McpServer | null = null
  private port: number

  constructor(private opts: McpServerOptions) {
    this.port = opts.port ?? 9223
  }

  get listeningPort(): number {
    return this.port
  }

  async start(): Promise<void> {
    if (this.mcp) return
    const { workspaceManager: wm, settingsStore } = this.opts

    const mcp = new McpServer(
      { name: 'mxwl-editor', version: '0.1.0' },
      { capabilities: { tools: {}, resources: {}, prompts: {} } }
    )

    mcp.tool('workspace_list', 'List open workspaces', {}, async () => ({
      content: [
        text(
          wm.list().map((w) => ({
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
      { workspaceId: z.string(), path: z.string() },
      async ({ workspaceId, path }) => {
        const entries = await wm.fsReadDir(workspaceId, path)
        return { content: [text(entries)] }
      }
    )

    mcp.tool(
      'fs_read',
      'Read a remote file (text)',
      { workspaceId: z.string(), path: z.string() },
      async ({ workspaceId, path }) => {
        const res = await wm.fsReadFile(workspaceId, path)
        return { content: [text(res.encoding === 'utf8' ? res.content : res)] }
      }
    )

    mcp.tool(
      'fs_write',
      'Write a remote file',
      { workspaceId: z.string(), path: z.string(), content: z.string() },
      async ({ workspaceId, path, content }) => {
        await wm.fsWriteFile(workspaceId, path, content)
        return { content: [text({ ok: true, path })] }
      }
    )

    mcp.tool(
      'terminal_exec',
      'Run a one-shot command in the workspace (returns full output)',
      { workspaceId: z.string(), command: z.string() },
      async ({ workspaceId, command }) => {
        const result = await wm.execInWorkspace(workspaceId, command)
        return { content: [text(result)] }
      }
    )

    mcp.tool(
      'dev_status',
      'Get dev server statuses for a workspace',
      { workspaceId: z.string() },
      async ({ workspaceId }) => ({ content: [text(wm.devSnapshot(workspaceId))] })
    )

    mcp.tool(
      'browser_navigate',
      'Navigate the active browser tab of a workspace',
      { workspaceId: z.string(), url: z.string() },
      async ({ workspaceId, url }) => {
        wm.browserNavigateActive(workspaceId, url)
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

    this.mcp = mcp
    await mcp.connect(new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }))

    const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const token = settingsStore.all().mcpAuthToken
      if (token) {
        const auth = req.headers.authorization || ''
        const ok =
          auth === `Bearer ${token}` || req.headers['x-mxwl-token'] === token
        if (!ok) {
          res.writeHead(401, { 'Content-Type': 'text/plain' })
          res.end('unauthorized')
          return
        }
      }
      try {
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
        await mcp.connect(transport)
        req.on('end', () => undefined)
        transport.handleRequest(req, res)
      } catch (err) {
        res.writeHead(500)
        res.end(String(err))
      }
    })

    await new Promise<void>((resolve) => {
      httpServer.listen(this.port, '127.0.0.1', () => resolve())
    })
    this.httpServer = httpServer
  }

  async stop(): Promise<void> {
    if (this.httpServer) {
      await new Promise<void>((resolve) => this.httpServer!.close(() => resolve()))
      this.httpServer = null
    }
    if (this.mcp) {
      await this.mcp.close()
      this.mcp = null
    }
  }
}
