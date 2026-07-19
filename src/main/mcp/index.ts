import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { McpStatus } from '../../shared/types'
import type { WorkspaceManager } from '../workspace/WorkspaceManager'
import type { SettingsStore } from '../persistence/SettingsStore'
import { WorkspaceMcpServer } from './WorkspaceMcpServer'

const CDP_REMOTE_PORT = 9222
const MCP_REMOTE_PORT = 9223

export type { McpStatus }

export class McpController {
  private server: WorkspaceMcpServer | null = null
  private enabledWorkspaces = new Set<string>()
  private lastError: string | null = null

  constructor(
    private workspaceManager: WorkspaceManager,
    private settingsStore: SettingsStore
  ) {}

  status(): McpStatus {
    return {
      enabled: this.enabledWorkspaces.size > 0,
      cdpUrl: `http://localhost:${CDP_REMOTE_PORT}`,
      mcpUrl: `http://localhost:${MCP_REMOTE_PORT}/mcp`,
      error: this.lastError ?? undefined
    }
  }

  async enable(workspaceId: string): Promise<McpStatus> {
    this.lastError = null
    try {
      await this.ensureServer()
      const conn = this.workspaceManager.getConnection(workspaceId)
      if (!conn) throw new Error('workspace has no connection')
      // Local hosts already share loopback with MCP/CDP — tunnels are no-ops
      await conn.startReverseTunnel(CDP_REMOTE_PORT, CDP_REMOTE_PORT)
      await conn.startReverseTunnel(MCP_REMOTE_PORT, this.server!.listeningPort)
      this.enabledWorkspaces.add(workspaceId)
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err)
    }
    return this.status()
  }

  async disable(workspaceId: string): Promise<McpStatus> {
    const conn = this.workspaceManager.getConnection(workspaceId)
    if (conn) {
      await conn.stopReverseTunnel(CDP_REMOTE_PORT).catch(() => undefined)
      await conn.stopReverseTunnel(MCP_REMOTE_PORT).catch(() => undefined)
    }
    this.enabledWorkspaces.delete(workspaceId)
    if (this.enabledWorkspaces.size === 0 && this.server) {
      await this.server.stop().catch(() => undefined)
      this.server = null
    }
    return this.status()
  }

  async disableAll(): Promise<void> {
    for (const id of [...this.enabledWorkspaces]) await this.disable(id)
  }

  private async ensureServer(): Promise<void> {
    if (this.server) return
    this.server = new WorkspaceMcpServer({
      port: MCP_REMOTE_PORT,
      workspaceManager: this.workspaceManager,
      settingsStore: this.settingsStore
    })
    await this.server.start()
  }
}

export function registerMcpIpc(controller: McpController): void {
  ipcMain.handle('mcp:status', (): McpStatus => controller.status())
  ipcMain.handle('mcp:enable', async (_e: IpcMainInvokeEvent, wsId: string) => controller.enable(wsId))
  ipcMain.handle('mcp:disable', async (_e: IpcMainInvokeEvent, wsId: string) => controller.disable(wsId))
}
