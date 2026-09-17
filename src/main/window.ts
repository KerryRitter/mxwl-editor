import { BrowserWindow, Menu, shell } from 'electron'
import { join } from 'path'

export function createMainWindow(options: { startHidden?: boolean } = {}): BrowserWindow {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1000,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'mxwl-editor',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Drop default File→Print (Ctrl+P) so we can use it for quick-open
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          {
            label: 'Actual Size',
            accelerator: 'CmdOrCtrl+0',
            click: () => win.webContents.send('shortcut:zoom', { action: 'reset' })
          },
          {
            label: 'Zoom In',
            accelerator: 'CmdOrCtrl+Plus',
            click: () => win.webContents.send('shortcut:zoom', { action: 'in' })
          },
          {
            label: 'Zoom Out',
            accelerator: 'CmdOrCtrl+-',
            click: () => win.webContents.send('shortcut:zoom', { action: 'out' })
          },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      }
    ])
  )

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const mod = input.control || input.meta
    if (!mod || input.alt) return
    const key = input.key.toLowerCase()
    if (key === 'p' && !input.shift) {
      event.preventDefault()
      win.webContents.send('shortcut:palette', { mode: 'files' })
      return
    }
    if (key === 'p' && input.shift) {
      event.preventDefault()
      win.webContents.send('shortcut:palette', { mode: 'commands' })
      return
    }
    if (key === 'k' && !input.shift) {
      event.preventDefault()
      win.webContents.send('shortcut:palette', { mode: 'all' })
      return
    }
    if (key === '0' && !input.shift) {
      event.preventDefault()
      win.webContents.send('shortcut:zoom', { action: 'reset' })
      return
    }
    if (key === '-' || key === '_') {
      event.preventDefault()
      win.webContents.send('shortcut:zoom', { action: 'out' })
      return
    }
    if (key === '+' || key === '=') {
      event.preventDefault()
      win.webContents.send('shortcut:zoom', { action: 'in' })
    }
  })

  win.on('ready-to-show', () => {
    if (!options.startHidden) win.show()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Refuse cross-origin frame navigations that Electron reports for plugin UI.
  // The renderer bridge separately verifies the origin on every message.
  const pluginFrameOrigins = new Map<string, string>()
  win.webContents.on(
    'did-frame-navigate',
    (_event, url, _statusCode, _statusText, isMainFrame, processId, routingId) => {
      if (isMainFrame) return
      const key = `${processId}:${routingId}`
      if (!url.startsWith('mxwl-plugin://')) {
        pluginFrameOrigins.delete(key)
        return
      }
      const parsed = new URL(url)
      pluginFrameOrigins.set(key, `${parsed.protocol}//${parsed.host}`)
    }
  )
  win.webContents.on('will-frame-navigate', (event) => {
    const frame = event.frame
    if (!frame) return
    const currentOrigin = pluginFrameOrigins.get(`${frame.processId}:${frame.routingId}`)
    if (!currentOrigin) return
    try {
      const to = new URL(event.url)
      if (`${to.protocol}//${to.host}` !== currentOrigin) event.preventDefault()
    } catch {
      event.preventDefault()
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
