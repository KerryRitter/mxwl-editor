import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import { join } from 'node:path'
import {
  appendFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { registerIpc } from './ipc'
import { createMainWindow } from './window'
import { HostStore, HostManager, registerHostIpc } from './hosts'
import { WorkspaceManager, registerWorkspaceIpc } from './workspace'
import { SettingsStore } from './persistence/SettingsStore'
import { SessionStore } from './persistence/SessionStore'
import { registerIntegrationsIpc } from './integrations'
import { McpController, registerMcpIpc } from './mcp'
import { AiRunner, registerAiIpc } from './ai'
import { AgentController, AttentionController, registerAgentIpc } from './agent'
import {
  ControlServer,
  isControlCli,
  registerControlIpc,
  runControlCli
} from './control'

const controlCli = isControlCli()
const hasSingleInstanceLock = controlCli || app.requestSingleInstanceLock()

// The GUI exposes CDP for the embedded-browser workflow. CLI invocations are
// short-lived clients and must never contend for that port.
if (!controlCli && hasSingleInstanceLock) {
  if (!app.commandLine.hasSwitch('remote-debugging-port')) {
    app.commandLine.appendSwitch('remote-debugging-port', '9222')
  }
  app.commandLine.appendSwitch('remote-debugging-bind-address', '127.0.0.1')
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let hostManager: HostManager | null = null
let workspaceManager: WorkspaceManager | null = null
let settingsStore: SettingsStore | null = null
let mcpController: McpController | null = null
let aiRunner: AiRunner | null = null
let agentController: AgentController | null = null
let attentionController: AttentionController | null = null
let controlServer: ControlServer | null = null
let isQuitting = false
let trayRefreshTimer: NodeJS.Timeout | null = null

function logCrash(kind: string, err: unknown): void {
  const line = `[${new Date().toISOString()}] ${kind}: ${err instanceof Error ? err.stack || err.message : String(err)}\n`
  console.error(line)
  try {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, 'crash.log'), line, 'utf8')
  } catch {
    // A crash logger should never become a second crash.
  }
}

function keepAliveEnabled(): boolean {
  return (
    process.env['MXWL_DISABLE_KEEP_ALIVE'] !== '1' &&
    Boolean(settingsStore?.all().runtime.keepAlive)
  )
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createManagedWindow(false)
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createManagedWindow(startHidden: boolean): BrowserWindow {
  const win = createMainWindow({ startHidden })
  win.on('close', (event) => {
    if (!isQuitting && keepAliveEnabled()) {
      event.preventDefault()
      win.hide()
    }
  })
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
  return win
}

function focusAgent(wsId: string): void {
  workspaceManager?.bringToFront(wsId)
  showMainWindow()
  const send = (): void => mainWindow?.webContents.send('control:focusAgent', { wsId })
  if (mainWindow?.webContents.isLoading()) mainWindow.webContents.once('did-finish-load', send)
  else send()
}

function trayImage() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><rect width="22" height="22" rx="6" fill="#09090b"/><path d="M4 15V7l4 5 3-5 3 5 4-5v8" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  return nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  )
}

function refreshTrayMenu(): void {
  if (!tray) return
  const fleet = controlServer?.fleet() ?? []
  const attention = fleet.filter((agent) => agent.activity.state === 'attention')
  const working = fleet.filter((agent) => agent.activity.state === 'working')
  tray.setToolTip(
    attention.length
      ? `mxwl · ${attention.length} need attention`
      : `mxwl · ${working.length} working`
  )
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: mainWindow?.isVisible() ? 'Hide mxwl' : 'Show mxwl',
        click: () => (mainWindow?.isVisible() ? mainWindow.hide() : showMainWindow())
      },
      { type: 'separator' },
      ...(attention.length
        ? attention.slice(0, 6).map((agent) => ({
            label: `● ${agent.workspaceTitle}: ${agent.activity.summary}`,
            click: () => focusAgent(agent.wsId)
          }))
        : [{ label: `${working.length} working · ${fleet.length} live`, enabled: false }]),
      { type: 'separator' },
      {
        label: 'Quit mxwl',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
  )
}

function scheduleTrayRefresh(): void {
  if (trayRefreshTimer) return
  trayRefreshTimer = setTimeout(() => {
    trayRefreshTimer = null
    refreshTrayMenu()
  }, 500)
  trayRefreshTimer.unref?.()
}

function createTray(): void {
  try {
    tray = new Tray(trayImage())
    tray.on('click', () => {
      refreshTrayMenu()
      showMainWindow()
    })
    tray.on('right-click', refreshTrayMenu)
    refreshTrayMenu()
  } catch (error) {
    // Some minimal Linux window managers do not expose a tray implementation.
    logCrash('tray', error)
  }
}

function syncLaunchAtLogin(enabled: boolean): void {
  app.setLoginItemSettings({ openAtLogin: enabled, args: ['--background'] })
  if (process.platform !== 'linux') return

  const file = join(app.getPath('home'), '.config', 'autostart', 'mxwl-runtime.desktop')
  if (!enabled) {
    if (existsSync(file)) {
      try {
        if (readFileSync(file, 'utf8').includes('X-MXWL-Runtime=true')) unlinkSync(file)
      } catch (error) {
        logCrash('autostart-remove', error)
      }
    }
    return
  }

  try {
    const executable = process.env['APPIMAGE'] || process.execPath
    mkdirSync(join(app.getPath('home'), '.config', 'autostart'), { recursive: true })
    writeFileSync(
      file,
      `[Desktop Entry]\nType=Application\nName=mxwl runtime\nComment=Keep mxwl agents available in the background\nExec="${executable.replaceAll('"', '\\"')}" --background\nTerminal=false\nX-GNOME-Autostart-enabled=true\nX-MXWL-Runtime=true\n`,
      'utf8'
    )
  } catch (error) {
    logCrash('autostart-write', error)
  }
}

async function bootstrap(): Promise<void> {
  registerIpc()
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

  attentionController = new AttentionController(
    settingsStore,
    workspaceManager,
    () => mainWindow,
    focusAgent
  )
  agentController = new AgentController(
    workspaceManager,
    settingsStore,
    () => mainWindow,
    undefined,
    (previous, next) => {
      attentionController?.observe(previous, next)
      scheduleTrayRefresh()
    }
  )
  registerAgentIpc(agentController, attentionController)

  controlServer = new ControlServer(
    agentController,
    attentionController,
    workspaceManager,
    hostManager,
    settingsStore,
    focusAgent
  )
  registerControlIpc(controlServer)
  controlServer.start()

  void hostManager.list()
  const restore = workspaceManager.restore(sessionStore.load())

  const startHidden = process.argv.includes('--background')
  mainWindow = createManagedWindow(startHidden)
  createTray()
  syncLaunchAtLogin(settingsStore.all().runtime.launchAtLogin)
  settingsStore.subscribe((settings) => {
    syncLaunchAtLogin(settings.runtime.launchAtLogin)
    refreshTrayMenu()
  })

  await restore
  await agentController.restoreSessions()
  refreshTrayMenu()
}

if (!hasSingleInstanceLock) {
  app.quit()
} else if (!controlCli) {
  app.on('second-instance', () => showMainWindow())
}

app.whenReady().then(async () => {
  process.on('uncaughtException', (err) => logCrash('uncaughtException', err))
  process.on('unhandledRejection', (err) => logCrash('unhandledRejection', err))

  if (controlCli) {
    const code = await runControlCli(app.getPath('userData'))
    app.exit(code)
    return
  }

  await bootstrap()
  app.on('activate', showMainWindow)
})

app.on('window-all-closed', () => {
  if (!keepAliveEnabled()) app.quit()
})

// Agent subprocesses outlive their stdio if nothing kills them — on a remote host
// that leaves a CLI burning a seat until the ssh connection times out.
app.on('before-quit', () => {
  isQuitting = true
  workspaceManager?.checkpointSession()
  controlServer?.stop()
  if (trayRefreshTimer) clearTimeout(trayRefreshTimer)
  trayRefreshTimer = null
  tray?.destroy()
  tray = null
  void agentController?.disposeAll()
})

export {
  mainWindow,
  hostManager,
  workspaceManager,
  settingsStore,
  aiRunner,
  agentController,
  attentionController,
  controlServer
}
