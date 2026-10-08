import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { McpStatus } from '../../shared/types'
import type { WorkspaceManager } from '../workspace/WorkspaceManager'
import type { SettingsStore } from '../persistence/SettingsStore'
import { WorkspaceMcpServer } from './WorkspaceMcpServer'
import type { McpServer as AgentMcpServer } from '@agentclientprotocol/sdk'
import { MCP_PORT, workspaceBridgeConfig, workspaceBridgeUrls } from './connection'

export type { McpStatus }

export class McpController {
  private server: WorkspaceMcpServer | null = null
  private enabledWorkspaces = new Set<string>()
  private lastError: string | null = null
  private ports = new Map<string, number>()
  private starting: Promise<void> | null = null
  private enabling = new Map<string, Promise<McpStatus>>()
  private operations = Promise.resolve()

  constructor(
    private workspaceManager: WorkspaceManager,
    private settingsStore: SettingsStore
  ) {
    workspaceManager.onWorkspaceClosed = (id) => { void this.disable(id) }
    workspaceManager.terminalEnvironment = (id) => this.environment(id)
  }

  status(workspaceId?: string): McpStatus {
    const port = (workspaceId ? this.ports.get(workspaceId) : undefined) ?? this.server?.listeningPort ?? MCP_PORT
    return {
      enabled: workspaceId ? this.enabledWorkspaces.has(workspaceId) : this.enabledWorkspaces.size > 0,
      ...workspaceBridgeUrls(workspaceId ?? '', port),
      workspaceId,
      config: workspaceId ? JSON.stringify(workspaceBridgeConfig(workspaceId, this.settingsStore.all().mcpAuthToken, port), null, 2) : undefined,
      error: this.lastError ?? undefined
    }
  }

  async enable(workspaceId: string): Promise<McpStatus> {
    const pending = this.enabling.get(workspaceId)
    if (pending) return pending
    const enable = this.enqueue(() => this.enabledWorkspaces.has(workspaceId)
      ? Promise.resolve(this.status(workspaceId)) : this.enableWorkspace(workspaceId))
    this.enabling.set(workspaceId, enable)
    try { return await enable } finally { this.enabling.delete(workspaceId) }
  }

  private async enableWorkspace(workspaceId: string): Promise<McpStatus> {
    this.lastError = null
    try {
      await this.ensureServer()
      const conn = this.workspaceManager.getConnection(workspaceId)
      if (!conn) throw new Error('workspace has no connection')
      // Each remote workspace gets a free port, avoiding competing SSH forwards.
      const port = conn.kind === 'local' ? this.server!.listeningPort
        : await conn.startReverseTunnel(0, this.server!.listeningPort)
      this.ports.set(workspaceId, port)
      this.enabledWorkspaces.add(workspaceId)
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err)
    }
    this.workspaceManager.setMcpEnabled(workspaceId, this.enabledWorkspaces.has(workspaceId))
    return this.status(workspaceId)
  }

  async disable(workspaceId: string): Promise<McpStatus> {
    return this.enqueue(() => this.disableWorkspace(workspaceId))
  }

  private async disableWorkspace(workspaceId: string): Promise<McpStatus> {
    const conn = this.workspaceManager.getConnection(workspaceId)
    const port = this.ports.get(workspaceId)
    this.enabledWorkspaces.delete(workspaceId)
    this.server?.disableWorkspace(workspaceId)
    this.ports.delete(workspaceId)
    this.workspaceManager.setMcpEnabled(workspaceId, false)
    if (conn && port) await conn.stopReverseTunnel(port).catch(() => undefined)
    if (this.enabledWorkspaces.size === 0 && this.server) {
      await this.server.stop().catch(() => undefined)
      this.server = null
    }
    return this.status(workspaceId)
  }

  async disableAll(): Promise<void> {
    for (const id of [...this.enabledWorkspaces]) await this.disable(id)
  }

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const result = this.operations.then(action)
    this.operations = result.then(() => undefined, () => undefined)
    return result
  }

  private async ensureServer(): Promise<void> {
    if (this.starting) return this.starting
    if (this.server) return
    this.server = new WorkspaceMcpServer({
      port: process.env.MXWL_MCP_PORT !== undefined ? Number(process.env.MXWL_MCP_PORT) : MCP_PORT,
      workspaceManager: this.workspaceManager,
      settingsStore: this.settingsStore,
      isEnabled: (id) => this.enabledWorkspaces.has(id)
    })
    this.starting = this.server.start()
    try { await this.starting } catch (error) { this.server = null; throw error }
    finally { this.starting = null }
  }

  async environment(workspaceId: string): Promise<Record<string, string>> {
    const status = await this.enable(workspaceId)
    if (!status.enabled) return {}
    const token = this.settingsStore.all().mcpAuthToken
    return {
      MXWL_WORKSPACE_ID: workspaceId,
      MXWL_MCP_URL: status.mcpUrl,
      MXWL_CDP_ENDPOINT: status.cdpUrl,
      PLAYWRIGHT_MCP_CDP_ENDPOINT: status.cdpUrl,
      ...(token ? { PLAYWRIGHT_MCP_CDP_HEADERS: `Authorization: Bearer ${token}` } : {})
    }
  }

  async agentServers(workspaceId: string, http: boolean): Promise<AgentMcpServer[]> {
    const status = await this.enable(workspaceId)
    if (!status.enabled) return []
    const token = this.settingsStore.all().mcpAuthToken
    if (http) return [{ type: 'http', name: 'mxwl', url: status.mcpUrl,
      headers: token ? [{ name: 'Authorization', value: `Bearer ${token}` }] : [] }]
    // ACP guarantees stdio support. Relay JSON-RPC to the workspace HTTP server
    // for agents that do not advertise the optional HTTP transport capability.
    const relay = `const readline = require('node:readline'); readline.createInterface({input:process.stdin}).on('line',async line=>{try{const res=await fetch(process.argv[1],{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream',...(process.env.MXWL_MCP_TOKEN?{Authorization:'Bearer '+process.env.MXWL_MCP_TOKEN}:{})},body:line});if(res.status===202)return;const body=await res.text();if(body)process.stdout.write(body+'\\n')}catch(e){const req=JSON.parse(line);if(req.id!=null)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req.id,error:{code:-32603,message:String(e)}})+'\\n')}});`
    return [{ name: 'mxwl', command: 'node', args: ['-e', relay, status.mcpUrl],
      env: token ? [{ name: 'MXWL_MCP_TOKEN', value: token }] : [] }]
  }
}

export function registerMcpIpc(controller: McpController): void {
  ipcMain.handle('mcp:status', (_e: IpcMainInvokeEvent, wsId?: string): McpStatus => controller.status(wsId))
  ipcMain.handle('mcp:enable', async (_e: IpcMainInvokeEvent, wsId: string) => controller.enable(wsId))
  ipcMain.handle('mcp:disable', async (_e: IpcMainInvokeEvent, wsId: string) => controller.disable(wsId))
}
