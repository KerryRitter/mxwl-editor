import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { BrowserWindow } from 'electron'
import type {
  DirEntry,
  GitChangesSnapshot,
  GitFileDiff,
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
import {
  SessionStore,
  type SessionEntry,
  type TerminalSessionEntry
} from '../persistence/SessionStore'
import { DEFAULT_HIDE } from '../../shared/hostDefaults'
import { fuzzySort } from '../../shared/fuzzy'
import {
  countLines,
  mergeGitStats,
  parseGitHunks,
  parseGitNumStat,
  parseGitStatus
} from './gitChanges'

const MAX_DIFF_FILE_BYTES = 5 * 1024 * 1024

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
  terminalRestore: { entries: TerminalSessionEntry[]; activeId?: string } | null
  terminalRestoreStarted: boolean
  gitChangesCache?: { snapshot: GitChangesSnapshot; loadedAt: number }
  gitChangesPending?: Promise<GitChangesSnapshot>
  fileListCache?: { paths: string[]; loadedAt: number }
}

export class WorkspaceManager {
  private workspaces = new Map<string, Workspace>()
  private frontWsId: string | null = null
  private persistTimer: NodeJS.Timeout | null = null
  private restoringSession = false

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
    const states = [...this.workspaces.values()].map((w) => w.state)
    if (!this.frontWsId) return states
    return states.sort((a, b) => (a.id === this.frontWsId ? -1 : b.id === this.frontWsId ? 1 : 0))
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
    opts: { focus?: boolean; restore?: SessionEntry } = {}
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
      title: opts.restore?.title?.trim() || derived.title || folderName,
      status: 'connecting',
      derived,
      browser: { tabs: [], activeTabId: null },
      editor: { openFiles: [], activeFile: null },
      terminal: {
        sessions: [],
        activeSessionId: opts.restore?.activeTerminalId ?? null,
        restoring: Boolean(opts.restore?.terminals?.length)
      },
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
      startupCommandSent: false,
      terminalRestore: opts.restore?.terminals?.length
        ? { entries: opts.restore.terminals, activeId: opts.restore.activeTerminalId }
        : null,
      terminalRestoreStarted: false
    }
    this.workspaces.set(id, ws)

    conn.on('status', (s: WorkspaceStatus) => {
      ws.state.status = s
      this.broadcast(id)
      if (s === 'connected') {
        void this.refreshGit(id)
        void this.restoreTerminals(id)
      }
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

  /** Creates (or reopens) a sibling Git worktree for one ticket. Never removes paths. */
  async createWorktree(
    sourceId: string,
    input: { ticket: string; branch?: string }
  ): Promise<WorkspaceState> {
    const source = this.require(sourceId)
    const ticket = input.ticket.trim().toUpperCase()
    if (!/^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(ticket)) {
      throw new Error('Ticket must contain only letters, numbers, dots, dashes, or underscores')
    }
    const branch = (input.branch?.trim() || ticket.toLowerCase()).slice(0, 120)
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch) || branch.endsWith('/')) {
      throw new Error('Branch name is not valid')
    }

    const rootResult = await source.conn.exec(
      `cd ${shellQuote(source.state.remotePath)} && git rev-parse --show-toplevel`,
      { timeoutMs: 15_000 }
    )
    const repoRoot = rootResult.stdout.trim()
    if (rootResult.code !== 0 || !repoRoot) {
      throw new Error(rootResult.stderr.trim() || 'The current workspace is not a Git repository')
    }
    const cleanRoot = repoRoot.replace(/\/+$/, '')
    const slash = cleanRoot.lastIndexOf('/')
    const parent = slash <= 0 ? '/' : cleanRoot.slice(0, slash)
    const target = joinRemote(parent, `${basenameRemote(cleanRoot)}-${ticket}`)

    const exists = await source.conn.exec(`test -d ${shellQuote(target)}`, { timeoutMs: 10_000 })
    if (exists.code !== 0) {
      const command = [
        `cd ${shellQuote(cleanRoot)}`,
        `if git show-ref --verify --quiet ${shellQuote(`refs/heads/${branch}`)}; then`,
        `git worktree add ${shellQuote(target)} ${shellQuote(branch)}`,
        `elif git show-ref --verify --quiet ${shellQuote(`refs/remotes/origin/${branch}`)}; then`,
        `git worktree add -b ${shellQuote(branch)} ${shellQuote(target)} ${shellQuote(`origin/${branch}`)}`,
        'else',
        `git worktree add -b ${shellQuote(branch)} ${shellQuote(target)} HEAD`,
        'fi'
      ].join('\n')
      const created = await source.conn.exec(command, { timeoutMs: 120_000 })
      if (created.code !== 0) {
        throw new Error(created.stderr.trim() || created.stdout.trim() || 'Could not create worktree')
      }
    } else {
      const valid = await source.conn.exec(
        `git -C ${shellQuote(target)} rev-parse --is-inside-work-tree`,
        { timeoutMs: 15_000 }
      )
      if (valid.code !== 0) throw new Error(`${target} already exists and is not a Git worktree`)
    }

    const alreadyOpen = this.findByPath(source.state.hostId, target)
    if (alreadyOpen) {
      this.renameWorkspace(alreadyOpen.id, ticket)
      this.bringToFront(alreadyOpen.id)
      return this.require(alreadyOpen.id).state
    }
    const opened = await this.open(source.state.hostId, target)
    this.renameWorkspace(opened.id, ticket)
    await this.waitForConnected(opened.id, 20_000)
    return this.require(opened.id).state
  }

  bringToFront(id: string): void {
    if (!this.workspaces.has(id)) return
    this.frontWsId = id
    for (const [wid, ws] of this.workspaces) {
      ws.browser.setVisible(wid === id)
    }
    this.persistSession()
  }

  private persistSession(): void {
    if (!this.session || this.restoringSession) return
    this.session.save({
      workspaces: [...this.workspaces.values()].map((w) => this.sessionEntry(w)),
      ...(this.frontWsId
        ? {
            activeKey: SessionStore.keyFor({
              hostId: this.workspaces.get(this.frontWsId)!.state.hostId,
              remotePath: this.workspaces.get(this.frontWsId)!.state.remotePath
            })
          }
        : {})
    })
  }

  private scheduleSessionPersist(): void {
    if (!this.session || this.restoringSession || this.persistTimer) return
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      this.persistSession()
    }, 1500)
    this.persistTimer.unref?.()
  }

  checkpointSession(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = null
    this.persistSession()
  }

  private sessionEntry(w: Workspace): SessionEntry {
    const liveTerminals = [...w.terminals.values()].map((terminal) => ({
      id: terminal.id,
      label: terminal.label,
      cwd: terminal.workingDirectory,
      ...(terminal.aiTaskId ? { aiTaskId: terminal.aiTaskId } : {}),
      ...(terminal.tmuxName ? { tmuxName: terminal.tmuxName } : {}),
      ...(terminal.checkpoint() ? { replay: terminal.checkpoint() } : {})
    }))
    const terminals = w.state.terminal.restoring && w.terminalRestore
      ? w.terminalRestore.entries
      : liveTerminals
    const activeTerminalId = w.state.terminal.restoring && w.terminalRestore?.activeId
      ? w.terminalRestore.activeId
      : w.state.terminal.activeSessionId
    return {
      hostId: w.state.hostId,
      remotePath: w.state.remotePath,
      title: w.state.title,
      ...(terminals.length ? { terminals } : {}),
      ...(activeTerminalId
        ? { activeTerminalId }
        : {})
    }
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
    const state = session as { workspaces: SessionEntry[]; activeKey?: string }
    this.restoringSession = true
    try {
      for (const entry of state.workspaces) {
        if (!this.hosts.get(entry.hostId)) continue
        try {
          await this.open(entry.hostId, entry.remotePath, { focus: false, restore: entry })
        } catch (err) {
          void err
        }
      }
      const wanted = state.activeKey
        ? [...this.workspaces.values()].find(
            (workspace) => SessionStore.keyFor(workspace.state) === state.activeKey
          )
        : undefined
      if (wanted) this.bringToFront(wanted.state.id)
    } finally {
      this.restoringSession = false
      this.persistSession()
    }
  }

  renameWorkspace(id: string, title: string): void {
    const ws = this.workspaces.get(id)
    const next = title.trim()
    if (!ws || !next) return
    ws.state.title = next.slice(0, 120)
    this.broadcast(id)
    this.persistSession()
  }

  async openTerminal(
    id: string,
    opts: {
      id?: string
      cwd?: string
      cols: number
      rows: number
      label?: string
      aiTaskId?: string
      tmuxName?: string
      replay?: string
    }
  ): Promise<string> {
    const ws = this.workspaces.get(id)
    if (!ws) throw new Error('workspace not found')
    await this.waitForConnected(id, 15_000)
    const session = new TerminalSession({
      id: opts.id,
      wsId: id,
      conn: ws.conn,
      cwd: opts.cwd ?? ws.state.remotePath,
      cols: opts.cols,
      rows: opts.rows,
      label: opts.label,
      aiTaskId: opts.aiTaskId,
      tmuxName: opts.tmuxName?.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80),
      initialReplay: opts.replay,
      getSender: this.getSender,
      onClosed: (sessionId) => this.forgetTerminal(id, sessionId),
      onOutput: () => this.scheduleSessionPersist()
    })
    const isFirst = ws.terminals.size === 0
    await session.start(opts.cols, opts.rows)
    ws.terminals.set(session.id, session)
    ws.state.terminal.sessions.push({
      id: session.id,
      label: session.label,
      ...(session.aiTaskId ? { aiTaskId: session.aiTaskId } : {}),
      ...(session.tmuxName ? { tmuxName: session.tmuxName } : {})
    })
    if (!ws.state.terminal.activeSessionId) ws.state.terminal.activeSessionId = session.id
    if (isFirst && !session.tmuxName && !ws.startupCommandSent) {
      const host = this.hosts.get(ws.state.hostId)
      const cmd = host?.terminalStartup?.trim()
      if (cmd) {
        ws.startupCommandSent = true
        const line = cmd.endsWith('\n') ? cmd : `${cmd}\n`
        setTimeout(() => session.write(line), 500)
      }
    }

    this.broadcast(id)
    this.persistSession()
    return session.id
  }

  private async restoreTerminals(id: string): Promise<void> {
    const ws = this.workspaces.get(id)
    const restore = ws?.terminalRestore
    if (!ws || !restore || ws.terminalRestoreStarted) return
    // Claim once. Both the connection event and connect() continuation can arrive.
    ws.terminalRestoreStarted = true
    for (const entry of restore.entries) {
      try {
        await this.openTerminal(id, {
          id: entry.id,
          cwd: entry.cwd,
          cols: 100,
          rows: 28,
          label: entry.label,
          aiTaskId: entry.aiTaskId,
          tmuxName: entry.tmuxName,
          replay: entry.replay
        })
      } catch {
        // One stale shell descriptor must not prevent the other tabs restoring.
      }
    }
    ws.state.terminal.activeSessionId =
      restore.activeId && ws.terminals.has(restore.activeId)
        ? restore.activeId
        : (ws.state.terminal.sessions[0]?.id ?? null)
    ws.terminalRestore = null
    ws.state.terminal.restoring = false
    this.broadcast(id)
    this.persistSession()
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

  renameTerminal(id: string, sessionId: string, label: string): void {
    const ws = this.workspaces.get(id)
    const terminal = ws?.terminals.get(sessionId)
    const next = label.trim()
    if (!ws || !terminal || !next) return
    terminal.rename(next.slice(0, 80))
    ws.state.terminal.sessions = ws.state.terminal.sessions.map((session) =>
      session.id === sessionId ? { ...session, label: terminal.label } : session
    )
    this.broadcast(id)
    this.persistSession()
  }

  setActiveTerminal(id: string, sessionId: string): void {
    const ws = this.workspaces.get(id)
    if (!ws?.terminals.has(sessionId)) return
    ws.state.terminal.activeSessionId = sessionId
    this.scheduleSessionPersist()
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
    this.persistSession()
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

  async fsWriteFile(id: string, path: string, content: string): Promise<void> {
    const ws = this.require(id)
    await ws.fs.writeFile(path, content)
    ws.fileListCache = undefined
    ws.gitChangesCache = undefined
  }

  fsStat(id: string, path: string): Promise<FileStat> {
    return this.require(id).fs.stat(path)
  }

  async fsMkdir(id: string, path: string): Promise<void> {
    const ws = this.require(id)
    await ws.fs.mkdir(path)
    ws.fileListCache = undefined
    this.broadcast(id)
  }

  async fsRename(id: string, src: string, dst: string): Promise<void> {
    const ws = this.require(id)
    await ws.fs.rename(src, dst)
    ws.fileListCache = undefined
    ws.gitChangesCache = undefined
    this.broadcast(id)
  }

  async fsDelete(id: string, path: string, isDir: boolean): Promise<void> {
    const ws = this.require(id)
    await ws.fs.remove(path, isDir)
    ws.fileListCache = undefined
    ws.gitChangesCache = undefined
    this.broadcast(id)
  }

  async search(id: string, query: string): Promise<SearchHit[]> {
    if (!query.trim()) return []
    const ws = this.require(id)
    const hideGlobs = this.hideList(id)
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
    let paths = ws.fileListCache?.paths
    if (!paths || Date.now() - (ws.fileListCache?.loadedAt ?? 0) > 5000) {
      const hideGlobs = this.hideList(id)
        .map((h) => `--glob '!${h}' --glob '!${h}/**'`)
        .join(' ')
      const cmd = `cd ${shellQuote(ws.state.remotePath)} && (rg --files -g '!.git' ${hideGlobs} 2>/dev/null || find . -type f -not -path '*/.git/*' 2>/dev/null | sed 's|^\\./||') | head -n 3000`
      const { stdout } = await ws.conn.exec(cmd, { timeoutMs: 15_000 })
      paths = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((relative) => joinRemote(ws.state.remotePath, relative.replace(/^\.\//, '')))
      ws.fileListCache = { paths, loadedAt: Date.now() }
    }
    return fuzzySort(query, paths, (path) => path).slice(0, 200)
  }

  async gitChanges(id: string): Promise<GitChangesSnapshot> {
    const ws = this.require(id)
    const cached = ws.gitChangesCache
    if (cached && Date.now() - cached.loadedAt < 1500) return cached.snapshot
    if (ws.gitChangesPending) return ws.gitChangesPending

    const pending = (async (): Promise<GitChangesSnapshot> => {
      const execOptions = { timeoutMs: 15_000 }
      const [status, numstat] = await Promise.all([
        ws.conn.exec(
          `cd ${shellQuote(ws.state.remotePath)} && git -c core.quotepath=false status --porcelain=v1 -z --untracked-files=all`,
          execOptions
        ),
        ws.conn.exec(
          `cd ${shellQuote(ws.state.remotePath)} && git -c core.quotepath=false diff --numstat -z HEAD -- .`,
          execOptions
        )
      ])
      if (status.code !== 0) {
        throw new Error(status.stderr.trim() || 'Could not read git status')
      }

      const files = mergeGitStats(
        parseGitStatus(status.stdout),
        numstat.code === 0 ? parseGitNumStat(numstat.stdout) : new Map()
      )
      const snapshot = {
        branch: ws.state.derived.branch,
        files,
        additions: files.reduce((sum, file) => sum + (file.additions ?? 0), 0),
        deletions: files.reduce((sum, file) => sum + (file.deletions ?? 0), 0)
      }
      ws.gitChangesCache = { snapshot, loadedAt: Date.now() }
      return snapshot
    })()

    ws.gitChangesPending = pending
    try {
      return await pending
    } finally {
      if (ws.gitChangesPending === pending) ws.gitChangesPending = undefined
    }
  }

  async gitFileDiff(id: string, requestedPath: string): Promise<GitFileDiff> {
    const ws = this.require(id)
    const snapshot = await this.gitChanges(id)
    const change = snapshot.files.find((file) => file.path === requestedPath)
    if (!change) throw new Error('Changed file not found')

    let oldText = ''
    let newText = ''
    let binary = false
    let hunks: GitFileDiff['hunks'] = []

    if (change.unstaged && change.kind !== 'untracked') {
      const patch = await ws.conn.exec(
        `cd ${shellQuote(ws.state.remotePath)} && git -c core.quotepath=false diff --no-ext-diff --no-color --unified=3 -- ${shellQuote(change.path)}`,
        { timeoutMs: 15_000 }
      )
      if (patch.code === 0) hunks = parseGitHunks(patch.stdout)
    }

    if (change.kind !== 'added' && change.kind !== 'untracked') {
      const gitPath = change.oldPath ?? change.path
      const original = await ws.conn.exec(
        `cd ${shellQuote(ws.state.remotePath)} && git show ${shellQuote(`HEAD:${gitPath}`)}`
      )
      if (original.code !== 0) {
        throw new Error(original.stderr.trim() || `Could not read HEAD:${gitPath}`)
      }
      if (Buffer.byteLength(original.stdout, 'utf8') > MAX_DIFF_FILE_BYTES) {
        throw new Error('File is too large to display in the diff viewer')
      }
      binary = original.stdout.includes('\0')
      oldText = original.stdout
    }

    if (change.kind !== 'deleted') {
      const absolutePath = joinRemote(ws.state.remotePath, change.path)
      const info = await ws.fs.stat(absolutePath)
      if (info.isDirectory) binary = true
      if (info.size > MAX_DIFF_FILE_BYTES) {
        throw new Error('File is too large to display in the diff viewer')
      }
      if (!binary) {
        const current = await ws.fs.readFile(absolutePath)
        binary = current.encoding === 'base64'
        if (!binary) newText = current.content
      }
    }

    const additions =
      change.additions ?? (change.kind === 'untracked' && !binary ? countLines(newText) : null)
    const deletions = change.deletions ?? (change.kind === 'deleted' && !binary ? countLines(oldText) : null)

    return {
      ...change,
      additions,
      deletions,
      oldText: binary ? null : oldText,
      newText: binary ? null : newText,
      binary,
      hunks
    }
  }

  async gitStageFile(id: string, path: string): Promise<string> {
    const ws = this.require(id)
    await this.assertChangedPath(id, path)
    return this.runGitMutation(ws, `git add -- ${shellQuote(path)}`)
  }

  async gitUnstageFile(id: string, path: string): Promise<string> {
    const ws = this.require(id)
    await this.assertChangedPath(id, path)
    return this.runGitMutation(ws, `git reset -q HEAD -- ${shellQuote(path)}`)
  }

  async gitStageHunk(id: string, path: string, hunkId: string): Promise<string> {
    const ws = this.require(id)
    await this.assertChangedPath(id, path)
    const diff = await ws.conn.exec(
      `cd ${shellQuote(ws.state.remotePath)} && git -c core.quotepath=false diff --no-ext-diff --no-color --unified=3 -- ${shellQuote(path)}`,
      { timeoutMs: 15_000 }
    )
    if (diff.code !== 0) throw new Error(diff.stderr.trim() || 'Could not build hunk')
    const hunk = parseGitHunks(diff.stdout).find((candidate) => candidate.id === hunkId)
    if (!hunk) throw new Error('That hunk changed; refresh and try again')
    const encoded = Buffer.from(hunk.patch, 'utf8').toString('base64')
    return this.runGitMutation(
      ws,
      `printf %s ${shellQuote(encoded)} | base64 -d | git apply --cached --whitespace=nowarn -`
    )
  }

  async gitCommit(id: string, message: string): Promise<string> {
    const ws = this.require(id)
    const clean = message.trim()
    if (!clean) throw new Error('Commit message is required')
    if (clean.length > 500) throw new Error('Commit message is too long')
    return this.runGitMutation(ws, `git commit -m ${shellQuote(clean)}`, 60_000)
  }

  async gitPush(id: string): Promise<string> {
    const ws = this.require(id)
    const branchResult = await ws.conn.exec(
      `cd ${shellQuote(ws.state.remotePath)} && git branch --show-current`,
      { timeoutMs: 15_000 }
    )
    const branch = branchResult.stdout.trim()
    if (branchResult.code !== 0 || !branch) throw new Error('Could not determine the current branch')
    return this.runGitMutation(
      ws,
      `if git rev-parse --verify '@{upstream}' >/dev/null 2>&1; then git push; else git push -u origin ${shellQuote(branch)}; fi`,
      120_000
    )
  }

  async gitPullRequestUrl(id: string): Promise<string> {
    const ws = this.require(id)
    const result = await ws.conn.exec(
      `cd ${shellQuote(ws.state.remotePath)} && git remote get-url origin && git branch --show-current`,
      { timeoutMs: 15_000 }
    )
    if (result.code !== 0) throw new Error(result.stderr.trim() || 'Could not read Git remote')
    const [remote, branch] = result.stdout.trim().split('\n')
    if (!remote || !branch) throw new Error('Git remote or branch is missing')
    const parsed = parseGitRemote(remote)
    if (!parsed) throw new Error(`Unsupported Git remote: ${remote}`)
    const source = encodeURIComponent(branch)
    if (parsed.host.includes('github')) {
      return `${parsed.base}/compare/${source}?expand=1`
    }
    if (parsed.host.includes('gitlab')) {
      return `${parsed.base}/-/merge_requests/new?merge_request[source_branch]=${source}`
    }
    if (parsed.host.includes('bitbucket')) {
      return `${parsed.base}/pull-requests/new?source=${source}`
    }
    return parsed.base
  }

  private async assertChangedPath(id: string, path: string): Promise<void> {
    const snapshot = await this.gitChanges(id)
    if (!snapshot.files.some((file) => file.path === path)) {
      throw new Error('Changed file not found')
    }
  }

  private async runGitMutation(ws: Workspace, command: string, timeoutMs = 30_000): Promise<string> {
    const result = await ws.conn.exec(
      `cd ${shellQuote(ws.state.remotePath)} && ${command}`,
      { timeoutMs }
    )
    if (result.code !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || 'Git command failed')
    ws.gitChangesCache = undefined
    await this.refreshGit(ws.state.id)
    return [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n') || 'Done'
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
    const cmd = `cd ${shellQuote(ws.state.remotePath)} || exit 2; git rev-parse --abbrev-ref HEAD 2>/dev/null; git status --porcelain 2>/dev/null | head -1; git rev-list --left-right --count @{upstream}...HEAD 2>/dev/null`
    const { stdout } = await ws.conn.exec(cmd, { timeoutMs: 15_000 })
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

function parseGitRemote(remote: string): { host: string; base: string } | null {
  const scp = /^git@([^:]+):(.+)$/.exec(remote)
  if (scp) {
    const path = scp[2].replace(/\.git$/, '')
    return { host: scp[1].toLowerCase(), base: `https://${scp[1]}/${path}` }
  }
  try {
    const url = new URL(remote)
    const path = url.pathname.replace(/^\//, '').replace(/\.git$/, '')
    return { host: url.hostname.toLowerCase(), base: `https://${url.host}/${path}` }
  } catch {
    return null
  }
}

export { SshConnection, LocalConnection, createLocalHostConfig }
export type { Workspace, HostConfig }
