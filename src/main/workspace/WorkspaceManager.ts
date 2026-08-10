import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { BrowserWindow } from 'electron'
import type {
  DirEntry,
  GitStatus,
  HostConfig,
  SearchHit,
  WorkspaceState,
  WorkspaceStatus
} from '../../shared/types'
import type { HostManager } from '../hosts'
import type { SettingsStore } from '../persistence/SettingsStore'
import { SshConnection } from './SshConnection'
import { LocalConnection, createLocalHostConfig } from './LocalConnection'
import { SftpFs, type FileStat, type ReadResult } from './SftpFs'
import { LocalFs } from './LocalFs'
import { TerminalSession } from './TerminalSession'
import { BrowserController, type BrowserSnapshot } from './BrowserController'
import { DevController, type DevAction } from './DevController'
import { deriveFromFolder, matchFolderFilter } from './derive'
import { basenameRemote, joinRemote, shellQuote } from './util'
import { expandHome } from '../hosts/HostManager'
import { decryptSecret } from '../hosts/secrets'
import type { SessionStore } from '../persistence/SessionStore'
import { DEFAULT_HIDE } from '../../shared/hostDefaults'

type Conn = SshConnection | LocalConnection
type FsBackend = SftpFs | LocalFs

export type HostShell = {
  host: HostConfig
  exec(cmd: string): Promise<{ stdout: string; stderr: string; code: number | null }>
  resolve(path: string): Promise<string>
  close(): Promise<void>
}

type Workspace = {
  state: WorkspaceState
  conn: Conn
  fs: FsBackend
  terminals: Map<string, TerminalSession>
  browser: BrowserController
  dev: DevController
  startupCommandSent: boolean
}

export class WorkspaceManager {
  private workspaces = new Map<string, Workspace>()
  private frontWsId: string | null = null

  constructor(
    private hosts: HostManager,
    private getSender: () => BrowserWindow | null,
    private session: SessionStore | undefined,
    private settings: SettingsStore
  ) {}

  private isLocal(host: HostConfig): boolean {
    return host.kind === 'local'
  }

  private createConn(host: HostConfig): Conn {
    return this.isLocal(host) ? new LocalConnection(host) : new SshConnection(host)
  }

  private createFs(conn: Conn): FsBackend {
    return conn instanceof LocalConnection ? new LocalFs() : new SftpFs(conn)
  }

  list(): WorkspaceState[] {
    return [...this.workspaces.values()].map((w) => w.state)
  }

  get(id: string): Workspace | undefined {
    return this.workspaces.get(id)
  }

  getConnection(id: string): Conn | undefined {
    return this.workspaces.get(id)?.conn
  }

  async discover(hostId: string): Promise<DirEntry[]> {
    const host = this.hosts.get(hostId)
    if (!host) throw new Error('host not found')
    const conn = this.createConn(host)
    try {
      await conn.connect()
      const root = await this.resolvePath(conn, host, host.workspacesRoot || '~/Workspaces')
      const entries = await this.createFs(conn).readDir(root)
      return entries
        .filter((e) => e.isDirectory && !e.name.startsWith('.'))
        .filter((e) => matchFolderFilter(e.name, host.folderFilter))
        .sort((a, b) => a.name.localeCompare(b.name))
    } finally {
      await conn.close()
    }
  }

  /**
   * A connection to a host that isn't bound to an open workspace — used by the AI
   * runner to probe for task folders before deciding what to open. Caller closes.
   */
  async openHostShell(hostId: string): Promise<HostShell> {
    const host = this.hosts.get(hostId)
    if (!host) throw new Error('host not found')
    const conn = this.createConn(host)
    await conn.connect()
    // ssh2's exec gets a non-login, non-interactive shell, so nvm / npm-global /
    // ~/.local/bin are off PATH and the AI CLIs look missing. Local conns already
    // go through `bash -lc`.
    const exec =
      host.kind === 'local'
        ? (cmd: string) => conn.exec(cmd)
        : (cmd: string) => conn.exec(`bash -lc ${shellQuote(cmd)}`)
    return {
      host,
      exec,
      resolve: (path: string) => this.resolvePath(conn, host, path),
      close: () => conn.close().catch(() => undefined)
    }
  }

  findByPath(hostId: string, path: string): WorkspaceState | undefined {
    return [...this.workspaces.values()].find(
      (w) => w.state.hostId === hostId && w.state.remotePath === path
    )?.state
  }

  /** Resolves once the workspace connection is usable; rejects on error/timeout. */
  async waitForConnected(id: string, timeoutMs = 60_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const ws = this.workspaces.get(id)
      if (!ws) throw new Error('workspace closed')
      if (ws.state.status === 'connected') return
      if (ws.state.status === 'error') throw new Error('workspace failed to connect')
      if (Date.now() > deadline) throw new Error('timed out waiting for workspace connection')
      await new Promise((r) => setTimeout(r, 250))
    }
  }

  private async resolvePath(conn: Conn, host: HostConfig, path: string): Promise<string> {
    if (this.isLocal(host) || conn instanceof LocalConnection) {
      return expandHome(path)
    }
    if (!path.startsWith('~')) return path
    const { stdout } = await conn.exec('echo $HOME')
    const home = stdout.trim()
    if (!home) return path === '~' ? '.' : './' + path.slice(2)
    if (path === '~') return home
    return joinRemote(home, path.slice(2))
  }

  /**
   * `focus: false` opens a workspace without pulling the browser view forward —
   * used by the AI runner, which opens many workspaces while the user stays put.
   */
  async open(
    hostId: string,
    remotePath: string,
    opts: { focus?: boolean } = {}
  ): Promise<WorkspaceState> {
    const host = this.hosts.get(hostId)
    if (!host) throw new Error('host not found')

    const folderName = basenameRemote(remotePath)
    const derived = deriveFromFolder(folderName, {
      derive: host.derive,
      defaultBrowserUrl: this.settings.all().defaultBrowserUrl
    })
    const id = randomUUID()
    const conn = this.createConn(host)
    const services = host.services ?? []
    const servers: WorkspaceState['dev']['servers'] = {}
    for (const s of services) servers[s.id] = { status: 'unknown' }

    const resolvedPath =
      this.isLocal(host) && (remotePath.startsWith('~') || !remotePath.startsWith('/'))
        ? expandHome(remotePath)
        : remotePath

    if (this.isLocal(host) && !existsSync(resolvedPath)) {
      throw new Error(`Local path does not exist: ${resolvedPath}`)
    }

    const state: WorkspaceState = {
      id,
      hostId,
      remotePath: resolvedPath,
      title: derived.title || folderName,
      status: 'connecting',
      derived,
      browser: { tabs: [], activeTabId: null },
      editor: { openFiles: [], activeFile: null },
      terminal: { sessions: [], activeSessionId: null },
      dev: { servers },
      mcp: { cdpEnabled: false },
      createdAt: Date.now()
    }

    const ws: Workspace = {
      state,
      conn,
      fs: this.createFs(conn),
      terminals: new Map(),
      browser: new BrowserController(id, this.getSender),
      dev: new DevController(id, conn, resolvedPath, this.getSender, services),
      startupCommandSent: false
    }
    this.workspaces.set(id, ws)

    conn.on('status', (s: WorkspaceStatus) => {
      ws.state.status = s
      this.broadcast(id)
      if (s === 'connected') void this.refreshGit(id)
    })

    conn
      .connect()
      .then(() => this.refreshGit(id).catch(() => undefined))
      .catch(() => {
        ws.state.status = 'error'
        this.broadcast(id)
        void ws.conn.close()
      })

    if (opts.focus !== false || !this.frontWsId) this.bringToFront(id)
    else ws.browser.setVisible(false)
    this.persistSession()
    return state
  }

  bringToFront(id: string): void {
    if (!this.workspaces.has(id)) return
    this.frontWsId = id
    for (const [wid, ws] of this.workspaces) {
      ws.browser.setVisible(wid === id)
    }
  }

  private persistSession(): void {
    if (!this.session) return
    this.session.save({
      workspaces: [...this.workspaces.values()].map((w) => ({
        hostId: w.state.hostId,
        remotePath: w.state.remotePath
      }))
    })
  }

  close(id: string): void {
    const ws = this.workspaces.get(id)
    if (!ws) return
    for (const term of ws.terminals.values()) term.dispose().catch(() => undefined)
    ws.browser.dispose()
    ws.dev.dispose()
    ws.conn.close().catch(() => undefined)
    this.workspaces.delete(id)
    if (this.frontWsId === id) {
      const next = [...this.workspaces.keys()][0]
      this.frontWsId = null
      if (next) this.bringToFront(next)
    }
    this.persistSession()
  }

  async restore(session: { workspaces: { hostId: string; remotePath: string }[] }): Promise<void> {
    for (const entry of session.workspaces) {
      if (!this.hosts.get(entry.hostId)) continue
      try {
        await this.open(entry.hostId, entry.remotePath)
      } catch (err) {
        void err
      }
    }
  }

  async openTerminal(
    id: string,
    opts: { cwd?: string; cols: number; rows: number; label?: string; aiTaskId?: string }
  ): Promise<string> {
    const ws = this.workspaces.get(id)
    if (!ws) throw new Error('workspace not found')
    await this.waitForConnected(id, 15_000)
    const session = new TerminalSession({
      wsId: id,
      conn: ws.conn,
      cwd: opts.cwd ?? ws.state.remotePath,
      cols: opts.cols,
      rows: opts.rows,
      label: opts.label,
      aiTaskId: opts.aiTaskId,
      getSender: this.getSender,
      onClosed: (sessionId) => this.forgetTerminal(id, sessionId)
    })
    const isFirst = ws.terminals.size === 0
    await session.start(opts.cols, opts.rows)
    ws.terminals.set(session.id, session)
    ws.state.terminal.sessions.push({
      id: session.id,
      label: session.label,
      ...(session.aiTaskId ? { aiTaskId: session.aiTaskId } : {})
    })
    if (!ws.state.terminal.activeSessionId) ws.state.terminal.activeSessionId = session.id
    if (isFirst && !ws.startupCommandSent) {
      const host = this.hosts.get(ws.state.hostId)
      const cmd = host?.terminalStartup?.trim()
      if (cmd) {
        ws.startupCommandSent = true
        const line = cmd.endsWith('\n') ? cmd : `${cmd}\n`
        setTimeout(() => session.write(line), 500)
      }
    }

    this.broadcast(id)
    return session.id
  }

  /** Buffered output so a re-mounted terminal pane can redraw an existing session. */
  terminalReplay(id: string, sessionId: string): string {
    return this.workspaces.get(id)?.terminals.get(sessionId)?.replay() ?? ''
  }

  watchTerminal(id: string, sessionId: string, cb: (chunk: string) => void): () => void {
    return this.workspaces.get(id)?.terminals.get(sessionId)?.watch(cb) ?? (() => undefined)
  }

  writeTerminal(id: string, sessionId: string, data: string): void {
    this.workspaces.get(id)?.terminals.get(sessionId)?.write(data)
  }

  resizeTerminal(id: string, sessionId: string, cols: number, rows: number): void {
    this.workspaces.get(id)?.terminals.get(sessionId)?.resize(cols, rows)
  }

  closeTerminal(id: string, sessionId: string): void {
    const ws = this.workspaces.get(id)
    if (!ws) return
    const session = ws.terminals.get(sessionId)
    if (!session) return
    session.dispose().catch(() => undefined)
    this.forgetTerminal(id, sessionId)
  }

  private forgetTerminal(id: string, sessionId: string): void {
    const ws = this.workspaces.get(id)
    if (!ws) return
    ws.terminals.delete(sessionId)
    ws.state.terminal.sessions = ws.state.terminal.sessions.filter((s) => s.id !== sessionId)
    if (ws.state.terminal.activeSessionId === sessionId) {
      ws.state.terminal.activeSessionId = ws.state.terminal.sessions[0]?.id ?? null
    }
    this.broadcast(id)
  }

  hideList(wsId?: string): string[] {
    const extra = this.settings.all().hideExtra ?? []
    const hostHide =
      (wsId ? this.hosts.get(this.workspaces.get(wsId)?.state.hostId ?? '')?.hide : undefined) ??
      DEFAULT_HIDE
    return [...new Set([...hostHide, ...extra])]
  }

  async fsReadDir(id: string, path: string): Promise<DirEntry[]> {
    const ws = this.require(id)
    const entries = await ws.fs.readDir(path)
    const hide = new Set(this.hideList(id))
    return entries.filter((e) => !hide.has(e.name))
  }

  fsReadFile(id: string, path: string): Promise<ReadResult> {
    return this.require(id).fs.readFile(path)
  }

  fsWriteFile(id: string, path: string, content: string): Promise<void> {
    return this.require(id).fs.writeFile(path, content)
  }

  fsStat(id: string, path: string): Promise<FileStat> {
    return this.require(id).fs.stat(path)
  }

  async fsMkdir(id: string, path: string): Promise<void> {
    await this.require(id).fs.mkdir(path)
    this.broadcast(id)
  }

  async fsRename(id: string, src: string, dst: string): Promise<void> {
    await this.require(id).fs.rename(src, dst)
    this.broadcast(id)
  }

  async fsDelete(id: string, path: string, isDir: boolean): Promise<void> {
    await this.require(id).fs.remove(path, isDir)
    this.broadcast(id)
  }

  async search(id: string, query: string): Promise<SearchHit[]> {
    if (!query.trim()) return []
    const ws = this.require(id)
    const hideGlobs = this.hideList()
      .map((h) => `--glob '!${h}' --glob '!${h}/**'`)
      .join(' ')
    const q = shellQuote(query)
    const cmd = `cd ${shellQuote(ws.state.remotePath)} && rg -n --no-heading -S --max-count 80 --max-filesize 256K ${hideGlobs} ${q} 2>/dev/null | head -n 100`
    const { stdout } = await ws.conn.exec(cmd)
    const hits: SearchHit[] = []
    for (const line of stdout.split('\n')) {
      if (!line.trim()) continue
      const m = line.match(/^([^:]+):(\d+):(.*)$/)
      if (!m) continue
      hits.push({
        path: joinRemote(ws.state.remotePath, m[1]),
        line: Number(m[2]),
        text: m[3].slice(0, 200)
      })
    }
    return hits
  }

  async listFiles(id: string, query = ''): Promise<string[]> {
    const ws = this.require(id)
    const hideGlobs = this.hideList()
      .map((h) => `--glob '!${h}' --glob '!${h}/**'`)
      .join(' ')
    const q = query.trim()
    const filter = q ? `| rg -i -- ${shellQuote(q)}` : ''
    const cmd = `cd ${shellQuote(ws.state.remotePath)} && (rg --files -g '!.git' ${hideGlobs} 2>/dev/null || find . -type f -not -path '*/.git/*' 2>/dev/null | sed 's|^\\./||') ${filter} | head -n 200`
    const { stdout } = await ws.conn.exec(cmd)
    return stdout
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((rel) => joinRemote(ws.state.remotePath, rel.replace(/^\.\//, '')))
  }

  private require(id: string): Workspace {
    const ws = this.workspaces.get(id)
    if (!ws) throw new Error('workspace not found')
    if (ws.state.status !== 'connected') throw new Error('workspace not connected')
    return ws
  }

  browserNewTab(id: string, url?: string, groupId?: string): string {
    return this.workspaces.get(id)!.browser.newTab(url, groupId)
  }
  browserNewGroup(id: string, label?: string): string {
    return this.workspaces.get(id)!.browser.newGroup(label)
  }
  browserUpdateGroup(id: string, groupId: string, patch: { label?: string; color?: string }): void {
    this.workspaces.get(id)?.browser.updateGroup(groupId, patch)
  }
  browserCloseGroup(id: string, groupId: string): void {
    this.workspaces.get(id)?.browser.closeGroup(groupId)
  }
  async browserClearGroup(id: string, groupId: string): Promise<void> {
    await this.workspaces.get(id)?.browser.clearGroup(groupId)
  }
  browserMoveTab(id: string, tabId: string, groupId: string): string | null {
    return this.workspaces.get(id)?.browser.moveTab(tabId, groupId) ?? null
  }
  browserCloseTab(id: string, tabId: string): void {
    this.workspaces.get(id)?.browser.closeTab(tabId)
  }
  browserSetActive(id: string, tabId: string): void {
    this.workspaces.get(id)?.browser.setActive(tabId)
  }
  browserNavigate(id: string, tabId: string, url: string): void {
    this.workspaces.get(id)?.browser.navigate(tabId, url)
  }
  browserBack(id: string, tabId: string): void {
    this.workspaces.get(id)?.browser.back(tabId)
  }
  browserForward(id: string, tabId: string): void {
    this.workspaces.get(id)?.browser.forward(tabId)
  }
  browserReload(id: string, tabId: string): void {
    this.workspaces.get(id)?.browser.reload(tabId)
  }
  async browserTestLogin(id: string): Promise<void> {
    const ws = this.workspaces.get(id)
    if (!ws) throw new Error('workspace not found')
    const host = this.hosts.get(ws.state.hostId)
    const cfg = host?.testLogin
    if (!cfg?.username || !cfg.usernameSelector || !cfg.passwordSelector || !cfg.submitSelector) {
      throw new Error('test login not configured on this host')
    }
    if (!cfg.passwordEnc) throw new Error('test login password not set')
    const password = decryptSecret(cfg.passwordEnc)
    await ws.browser.fillLogin({
      username: cfg.username,
      password,
      usernameSelector: cfg.usernameSelector,
      passwordSelector: cfg.passwordSelector,
      submitSelector: cfg.submitSelector
    })
  }
  browserZoom(id: string, tabId: string, factor: number): void {
    this.workspaces.get(id)?.browser.zoom(tabId, factor)
  }
  browserDevtools(id: string, tabId: string): void {
    this.workspaces.get(id)?.browser.toggleDevtools(tabId)
  }
  browserSetDevtoolsBounds(
    id: string,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    this.workspaces.get(id)?.browser.setDevtoolsBounds({ x, y, width, height })
  }
  browserSetDevtoolsVisible(id: string, visible: boolean): void {
    this.workspaces.get(id)?.browser.setDevtoolsVisible(visible)
  }
  browserSetBounds(id: string, x: number, y: number, width: number, height: number): void {
    this.workspaces.get(id)?.browser.setBounds({ x, y, width, height })
  }
  browserSetVisible(id: string, visible: boolean): void {
    this.workspaces.get(id)?.browser.setVisible(visible)
  }
  browserSnapshot(id: string): BrowserSnapshot | null {
    return this.workspaces.get(id)?.browser.snapshot() ?? null
  }

  execInWorkspace(
    id: string,
    command: string
  ): Promise<{ stdout: string; stderr: string; code: number | null }> {
    const ws = this.require(id)
    return ws.conn.exec(`cd ${shellQuote(ws.state.remotePath)} && ${command}`)
  }

  listServices(id: string) {
    const ws = this.workspaces.get(id)
    if (!ws) return []
    const host = this.hosts.get(ws.state.hostId)
    const services = host?.services ?? []
    ws.dev.setServices(services)
    return services
  }

  devSnapshot(id: string): Record<string, import('../../shared/types').DevStatus> {
    const ws = this.workspaces.get(id)
    if (!ws) throw new Error('workspace not found')
    return ws.dev.getSnapshot()
  }

  browserNavigateActive(id: string, url: string): void {
    const ws = this.workspaces.get(id)
    if (!ws) return
    const snap = ws.browser.snapshot()
    const tabId = snap.activeId ?? ws.browser.newTab(url)
    if (snap.activeId) ws.browser.navigate(tabId, url)
  }

  devRun(id: string, app: string, action: DevAction): Promise<void> {
    return this.require(id).dev.run(app, action)
  }
  devTail(id: string, app: string): Promise<void> {
    return this.require(id).dev.tail(app)
  }
  devStopTail(id: string, app: string): void {
    this.workspaces.get(id)?.dev.stopTail(app)
  }

  async refreshGit(id: string): Promise<GitStatus | null> {
    const ws = this.workspaces.get(id)
    if (!ws || ws.state.status !== 'connected') return null
    const cmd = `cd ${shellQuote(ws.state.remotePath)} && git rev-parse --abbrev-ref HEAD 2>/dev/null; git status --porcelain 2>/dev/null | head -1; git rev-list --left-right --count @{upstream}...HEAD 2>/dev/null`
    const { stdout } = await ws.conn.exec(cmd)
    const lines = stdout.split('\n').map((l) => l.trim())
    const branch = lines[0] || null
    const dirty = Boolean(lines[1])
    let ahead = 0
    let behind = 0
    if (lines[2]) {
      const parts = lines[2].split(/\s+/)
      behind = Number(parts[0]) || 0
      ahead = Number(parts[1]) || 0
    }
    const changed = branch !== ws.state.derived.branch || dirty !== ws.state.derived.dirty
    ws.state.derived.branch = branch
    ws.state.derived.dirty = dirty
    if (changed) this.broadcast(id)
    return { branch, dirty, ahead, behind }
  }

  private broadcast(id: string): void {
    const ws = this.workspaces.get(id)
    const win = this.getSender()
    win?.webContents.send('workspace:event', {
      id,
      status: ws?.state.status ?? 'disconnected',
      state: ws?.state
    })
  }
}

export { SshConnection, LocalConnection, createLocalHostConfig }
export type { Workspace, HostConfig }
