# mxwl-editor — Build Plan

## 1. Vision

A desktop app for building Zipper. Open a workspace = pick a host + a remote folder (`~/Workspaces/zipper-PLAT-1234`). One SSH connection fans out into a browser, an editor, and a terminal, all locked to that folder. The entire workspace is controllable from MCP clients via CDP + a workspace-MCP server.

## 2. Scope (v1)

| In | Out (v2+) |
|---|---|
| Multi-workspace tabs, one SSH host each | Multi-window / tear-out panes |
| Multiplexed ssh2 (shell + sftp + exec + forwardIn) | Local workspaces (no SSH) |
| SFTP-backed Monaco editor + lazy tree | Inotify-based live file watch (v1 = manual reload) |
| Chromium browser pane, multi-tab, DevTools, zoom, CDP | Custom browser extensions |
| Terminal pane, multiple sessions | Terminal splits inside the pane |
| Dev-server controls (start/stop/restart/logs via `z`) | Inline diff editor |
| Jira issue + Bitbucket PR modals | Full Jira/BB CRUD |
| Workspace-MCP server (navigate/click/read/run/start) + CDP bridge | Authenticated multi-user MCP |
| Persistence across restarts | Cloud sync |
| Linux-first packaging (.AppImage) | macOS/Windows signing |

## 3. Architecture

### Process model

```
Electron
├─ main process (Node)
│   ├─ HostManager          — saved hosts (safeStorage for secrets)
│   ├─ WorkspaceManager     — N workspaces, each:
│   │   ├─ SshConnection        ssh2.Client (one per workspace)
│   │   │   ├─ shell()  → TerminalSession(s)   (PTY → xterm over IPC)
│   │   │   ├─ sftp()   → SftpFs               (Monaco FileSystemProvider + tree)
│   │   │   ├─ exec()   → DevController        (z CLI: start/stop/logs/status, git)
│   │   │   └─ forwardIn()  → reverse CDP tunnel (localhost:9222 on host → us)
│   │   ├─ BrowserController    WebContentsView[] (one per browser tab)
│   │   └─ derive()             folder → {jiraKey, browserUrl, branch}
│   ├─ McpServer            — workspace-as-MCP (HTTP/SSE)
│   ├─ JiraClient / BitbucketClient
│   └─ StateStore           — userData/state.json
├─ preload (contextBridge)  — typed API surface
└─ renderer (React)
    ├─ WorkspaceTabs (global, one per workspace)
    └─ WorkspaceView
        ├─ Browser pane:  tab strip + chrome + (WebContentsView behind)
        └─ Right split:
            ├─ Editor:     FileTree | EditorTabs | Monaco
            └─ Bottom:     Terminal | Logs | Git   (tabbed)
    + Modals: Jira, PR, Settings, CommandPalette
```

### Data flow (example: open a file)

Renderer `FileTree.onClick(path)` → `window.api.fs.readFile(wsId, path)` (preload) → IPC `fs:readFile` → main `WorkspaceManager.get(wsId).sftpFs.readFile(path)` → ssh2 sftp `open/get` → bytes back → IPC reply → renderer sets Monaco model.

### SSH multiplexing

One `ssh2.Client` per workspace. All channels (shell/sftp/exec) and the reverse `forwardIn` ride this single TCP connection. Keepalives on; auto-reconnect on drop rebuilds sftp + active shells transparently.

### MCP / CDP bridge

- Electron starts with `--remote-debugging-port=9222` (loopback), exposing Chromium CDP.
- On workspace open with MCP enabled, `ssh2.forwardIn('127.0.0.1', 9222)` makes `localhost:9222` on the **host** tunnel back to the app. A playwright MCP in the terminal connects via `connectOverCDP('http://localhost:9222')` and drives the visible browser pane.
- Separately, the main process runs an MCP server (HTTP/SSE, reachable through the same reverse tunnel) exposing `browser.*`, `fs.*`, `terminal.*`, `dev.*`, `jira.*`, `workspace.*` tools so any MCP client orchestrates the whole workspace.

## 4. Component design

### 4.1 SshConnection (`main/workspace/SshConnection.ts`)
Wraps `ssh2.Client`. Methods: `connect()`, `shell(opts)→stream`, `sftp()→sftp`, `exec(cmd)→{stdout,stderr,code}`, `forwardIn(port)`, `status`, events (`connected|disconnected|reconnecting|error`). Reconnect with backoff; emits state for the renderer status dot.

### 4.2 SftpFs (`main/workspace/SftpFs.ts`)
Implements a file-tree + read/write API (Monaco models loaded imperatively rather than vscode FileSystemProvider, since we're not embedding VS Code — Monaco alone).
- `readDir(path)→Entry[]` (lazy, no recursion), `readFile`/`writeFile`, `stat`, `mkdir`, `rename`, `delete`.
- Stat cache with short TTL; entry cache invalidated on expand/refresh. No recursive reads over SFTP.
- Paths: `~` expansion, normalize against workspace root.

### 4.3 TerminalSession (`main/workspace/TerminalSession.ts`)
`new TerminalSession(conn, {cwd, cols, rows})` → `conn.shell({cols,rows,term:'xterm-256color'})`. Streams data over IPC `terminal:output`; receives `terminal:input`. `resize(cols,rows)`. Default `cwd` = workspace path.

### 4.4 BrowserController (`main/workspace/BrowserController.ts`)
Owns N `WebContentsView`s per workspace (one per browser tab). Positioned to overlay the renderer's "browser pane" rect; repositioned on layout change; **hidden when a renderer modal opens** (z-order: native view sits above DOM). Forwards `did-navigate-in-page`, `did-navigate`, `page-title-updated`, `favicon-updated` to renderer for chrome sync. `goBack|goForward|reload|setZoom|loadURL`. DevTools: `webContents.openDevTools({mode:'detach'})`. CDP enabled globally via app switch.

### 4.5 DevController (`main/workspace/DevController.ts`)
`exec`-based: `start(app)`, `stop(app)`, `restart(app)`, `status()`. `tail(app)` opens a long-running `exec` and streams lines to `dev:logs`. Maps `app ∈ {web, api, multisite}` to `z` invocations run inside the workspace path.

### 4.6 derive (`main/workspace/derive.ts`)
`folder → {jiraKey, browserUrl, branch}`. Matches `zipper-PLAT-(\d+)` → `PLAT-XXXX`, `https://plat-XXXX__app.joinzipper.dev`. Branch via `git rev-parse --abbrev-ref HEAD`. Non-ticket folders get the configured default URL.

### 4.7 Integrations (`main/integrations/`)
`JiraClient.get(key)`, `BitbucketClient.prForBranch(repo, branch)` — REST + Basic auth (token/app password in safeStorage).

### 4.8 McpServer (`main/mcp/`)
`@modelcontextprotocol/sdk` HTTP/SSE server. Tool catalog:

| Tool | Effect |
|---|---|
| `browser.navigate` / `browser.click` / `browser.snapshot` | drive active WebContentsView (CDP) |
| `fs.read` / `fs.write` / `fs.list` | SftpFs ops |
| `terminal.run` | exec a command, return output |
| `dev.start` / `dev.stop` / `dev.status` | DevController |
| `jira.get` / `pr.get` | integrations |
| `workspace.list` / `workspace.activate` | tab management |

### 4.9 Renderer (`renderer/`)
Zustand stores; layout via `react-resizable-panels`; Tailwind for styling; `lucide-react` icons. Modal layer above everything; when a modal opens, renderer tells main to hide the active WebContentsView (avoids native-overlay showing through).

## 5. Data models

```ts
type AuthConfig =
  | { kind: 'agent' }
  | { kind: 'key'; keyPath: string; passphraseRef?: string }
  | { kind: 'password'; passwordRef: string }; // Ref = safeStorage key

interface HostConfig {
  id: string; label: string; host: string; port: number; username: string;
  auth: AuthConfig; workspacesRoot: string; addedAt: number;
}

interface WorkspaceState {
  id: string; hostId: string; remotePath: string; title: string;
  derived: { jiraKey: string | null; browserUrl: string; branch: string | null };
  browser: { tabs: BrowserTab[]; activeTabId: string | null };
  editor: { openFiles: OpenFile[]; activeFile: string | null };
  terminal: { sessions: TerminalSession[]; activeSessionId: string | null };
  dev: { servers: Record<'web'|'api'|'multisite', DevServerState> };
  mcp: { cdpEnabled: boolean };
  layout: Record<string, number>;
  createdAt: number;
}

interface BrowserTab { id: string; url: string; title: string; favicon?: string;
  loading: boolean; canGoBack: boolean; canGoForward: boolean; zoom: number; }
interface OpenFile { path: string; dirty: boolean; scrollTop: number;
  cursor: { line: number; col: number }; }
interface DevServerState { status: 'unknown'|'starting'|'running'|'stopped'|'error'; port?: number; }
interface AppSettings {
  jira: { host: string; email: string; apiTokenRef: string } | null;
  bitbucket: { host: string; username: string; appPasswordRef: string } | null;
  defaultBrowserUrl: string; cdpPort: number; theme: 'dark'|'light'|'system';
}
```

## 6. IPC contract (main ↔ preload ↔ renderer)

| Channel | Dir | Payload |
|---|---|---|
| `host:list/save/delete/test` | R↔M | HostConfig[] / HostConfig / {id} / {ok,error,latency} |
| `workspace:discover/open/close/list/activate` | R↔M | {hostId}→Entry[] ; {hostId,remotePath}→{wsId,derived} |
| `fs:readDir/readFile/writeFile/stat/mkdir/rename/delete/refresh` | R↔M | path ops |
| `terminal:open/close/input/resize` · `terminal:output`(M→R) | R↔M | sessions + data |
| `browser:newTab/closeTab/activate/navigate/back/forward/reload/zoom/devtools` | R↔M | tab ops |
| `browser:events` (M→R) | M→R | navigate/title/favicon/loading |
| `dev:start/stop/restart/status` · `dev:logs`(M→R) | R↔M | app + streams |
| `jira:get` · `pr:get` | R↔M | key / wsId |
| `mcp:setCdp` | R→M | per-workspace toggle |
| `layout:hideBrowserView/showBrowserView` | R→M | modal z-order |
| `state:persist` (debounced) | R→M | snapshot |

## 7. Project structure

```
mxwl-editor/
├─ package.json  vite.config / electron.vite.config  tsconfig*.json
├─ electron-builder.yml  tailwind.config  postcss.config
├─ src/
│  ├─ main/
│  │  ├─ index.ts  ipc.ts  window.ts
│  │  ├─ hosts/{HostManager,store}.ts
│  │  ├─ workspace/{WorkspaceManager,SshConnection,SftpFs,TerminalSession,BrowserController,DevController,derive}.ts
│  │  ├─ integrations/{JiraClient,BitbucketClient}.ts
│  │  ├─ mcp/{McpServer,tools/*}.ts
│  │  └─ persistence/StateStore.ts
│  ├─ preload/index.ts          (contextBridge → window.api)
│  └─ renderer/
│     ├─ index.html  main.tsx  App.tsx
│     ├─ store/*.ts  (Zustand)
│     ├─ components/{WorkspaceTabs,Browser,Editor,Terminal,DevPanel,modals}/*
│     └─ styles/global.css
└─ resources/  (icons)
```

## 8. Build phases & acceptance

| # | Phase | Acceptance | Effort |
|---|---|---|---|
| 0 | Scaffold | electron-vite dev runs; `ping` IPC returns pong; `build` + `package` produce AppImage | 0.5d |
| 1 | Host manager | CRUD hosts; agent/key auth; test-connect returns latency; secrets encrypted via safeStorage | 1d |
| 2 | SSH core | Open workspace from picker; ssh2 connected; reconnect on drop; status dot live | 1.5d |
| 3 | Terminal | xterm ↔ remote PTY; resize works; ≥2 sessions; correct colors/scroll | 1d |
| 4 | Editor | Lazy SFTP tree; open/save; editor tabs; dirty state; reload button | 2.5d |
| 5 | Browser | WebContentsView; tab strip; URL bar; back/fwd/reload; DevTools; zoom; URL sync | 2d |
| 6 | Derive/discovery | Folder→key/url/branch; `~/Workspaces` picker; one-click new tab | 0.5d |
| 7 | Dev controls | start/stop/restart web/api/multisite; streaming logs; status dots | 1.5d |
| 8 | Jira/PR modals | Fetch issue + PR; render; deep-link buttons | 1d |
| 9 | MCP | CDP reverse tunnel verified with playwright MCP; workspace MCP serves core tools | 2d |
| 10 | Persistence/settings | Tabs/files survive restart; settings UI; keybinds | 1d |
| 11 | Polish/package | Shortcuts, empty/error states, auto-update, signed-ish AppImage | 1.5d |

~16 dev-days solo. Realistic elapsed with unknowns: 3–4 weeks.

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Monaco workers under electron-vite | Use `@monaco-editor/react` (handles worker URL via Vite); spike in phase 0, not phase 4 |
| SFTP perf on huge repos | Lazy tree, stat cache + TTL, never recursive, debounce writes |
| WebContentsView overlays DOM | Hide the view from main when a renderer modal opens; documented z-order protocol |
| CDP exposes all webContents | Per-workspace toggle, loopback-only, UI warning |
| Reverse CDP tunnel reachability | `ssh2.forwardIn(9222)`; verify `curl 127.0.0.1:9222/json/version` from host |
| ssh2 idle drops | keepaliveInterval + keepaliveCountMax; transparent reconnect rebuilds sftp/shells |
| Jira/BB block iframing | REST-render in modal; "open in browser" deep-link |
| Secrets in logs | Redact auth payloads; safeStorage only; never persist plaintext |

## 10. Deferred decisions

- Layout lib: `react-resizable-panels` (chosen for v1 — lighter than react-mosaic)
- Auto-update: electron-updater + GitHub releases (phase 11)
- File watch: poll-mtime (v1.5) → remote inotify sidecar (v2)
- Workspace-MCP transport: HTTP/SSE (for reverse-tunnel reachability) vs stdio
