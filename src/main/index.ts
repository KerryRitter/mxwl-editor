import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { appendFileSync, mkdirSync, existsSync } from 'node:fs'
import { registerIpc } from './ipc'
import { createMainWindow } from './window'
import { HostStore, HostManager, registerHostIpc } from './hosts'
import { WorkspaceManager, registerWorkspaceIpc } from './workspace'
import { SettingsStore } from './persistence/SettingsStore'
import { SessionStore } from './persistence/SessionStore'
import { registerIntegrationsIpc } from './integrations'
import { McpController, registerMcpIpc } from './mcp'
import { AiRunner, registerAiIpc } from './ai'
import { AgentController, registerAgentIpc } from './agent'

// appendSwitch beats whatever the process was launched with, so only claim the
// default port when nothing else asked for one. A second instance — or Playwright,
// which launches with `=0` — otherwise fails to bind 9222 and never opens a window.
if (!app.commandLine.hasSwitch('remote-debugging-port')) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
}
app.commandLine.appendSwitch('remote-debugging-bind-address', '127.0.0.1')

let mainWindow: BrowserWindow | null = null
let hostManager: HostManager | null = null
let workspaceManager: WorkspaceManager | null = null
let settingsStore: SettingsStore | null = null
let mcpController: McpController | null = null
let aiRunner: AiRunner | null = null
let agentController: AgentController | null = null

function logCrash(kind: string, err: unknown): void {
  const line = `[${new Date().toISOString()}] ${kind}: ${err instanceof Error ? err.stack || err.message : String(err)}\n`
  console.error(line)
  try {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, 'crash.log'), line, 'utf8')
  } catch {
    // ignore
  }
}

function bootstrap(): void {
  const hostStore = new HostStore()
  hostManager = new HostManager(hostStore)
  registerHostIpc(hostManager)

  settingsStore = new SettingsStore()
  const sessionStore = new SessionStore()

  workspaceManager = new WorkspaceManager(
    hostManager,
    () => mainWindow,
    sessionStore,
    settingsStore
  )
  registerWorkspaceIpc(workspaceManager)

  registerIntegrationsIpc(settingsStore, workspaceManager)

  mcpController = new McpController(workspaceManager, settingsStore)
  registerMcpIpc(mcpController)

  aiRunner = new AiRunner(workspaceManager, settingsStore, () => mainWindow)
  registerAiIpc(aiRunner, settingsStore, workspaceManager)

  agentController = new AgentController(workspaceManager, settingsStore, () => mainWindow)
  registerAgentIpc(agentController)

  void hostManager.list()
  void workspaceManager.restore(sessionStore.load())

  mainWindow = createMainWindow()
  registerIpc()
}

app.whenReady().then(() => {
  process.on('uncaughtException', (err) => logCrash('uncaughtException', err))
  process.on('unhandledRejection', (err) => logCrash('unhandledRejection', err))
  bootstrap()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) bootstrap()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Agent subprocesses outlive their stdio if nothing kills them — on a remote host
// that leaves a CLI burning a seat until the ssh connection times out.
app.on('before-quit', () => {
  void agentController?.disposeAll()
})

export { mainWindow, hostManager, workspaceManager, settingsStore, aiRunner, agentController }
