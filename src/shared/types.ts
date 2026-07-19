export type HostKind = 'ssh' | 'local'

export type AuthConfig =
  | { kind: 'none' }
  | { kind: 'agent' }
  | { kind: 'key'; keyPath: string; encryptedPassphrase?: string }
  | { kind: 'password'; encryptedPassword: string }

export type HostConfig = {
  id: string
  kind: HostKind
  label: string
  host: string
  port: number
  username: string
  auth: AuthConfig
  workspacesRoot: string
  /** Regex named-groups → title / browser URL / issue key */
  derive: DeriveConfig
  /** Optional glob or /regex/ for folder discovery */
  folderFilter?: string
  /** Dev logs panel: start/stop/restart/logs commands */
  services: PresetService[]
  /** Extra names to hide in the file tree */
  hide?: string[]
  addedAt: number
}

export type HostAuthInput =
  | { kind: 'none' }
  | { kind: 'agent' }
  | { kind: 'key'; keyPath: string; passphrase?: string }
  | { kind: 'password'; password: string }

export type HostInput = {
  id?: string
  kind?: HostKind
  label: string
  host: string
  port: number
  username: string
  workspacesRoot: string
  derive?: DeriveConfig
  folderFilter?: string
  services?: PresetService[]
  hide?: string[]
  auth: HostAuthInput
}

export type TaskProviderId = 'jira' | 'linear' | 'github-issues' | 'none'
export type ScmProviderId = 'bitbucket' | 'github' | 'gitlab' | 'none'

export type TestResult = {
  ok: boolean
  error?: string
  latencyMs: number
}

export type DirEntry = {
  name: string
  path: string
  isDirectory: boolean
}

export type WorkspaceStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'

export type DeriveConfig = {
  folderPattern: string
  titleTemplate: string
  browserUrlTemplate: string
  issueKeyTemplate?: string
}

export type PresetService = {
  id: string
  label: string
  start: string
  stop: string
  restart: string
  logs: string
}

export type ProjectPreset = {
  id: string
  label: string
  workspacesRoot: string
  folderFilter?: string
  derive: DeriveConfig
  services: PresetService[]
  hide: string[]
  issueTracker?: 'jira' | 'linear' | 'github' | 'none'
  prProvider?: 'bitbucket' | 'github' | 'none'
}

export type DerivedWorkspace = {
  title: string
  issueKey: string | null
  browserUrl: string
  branch: string | null
  dirty: boolean
}

/** @deprecated use string service ids — kept for gradual migration */
export type DevApp = string

export type DevStatus = 'unknown' | 'starting' | 'running' | 'stopped' | 'error'

export type DevServerState = {
  status: DevStatus
  port?: number
}

export type BrowserTab = {
  id: string
  url: string
  title: string
  favicon?: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  zoom: number
}

export type OpenFile = {
  path: string
  dirty: boolean
  scrollTop: number
  cursor: { line: number; col: number }
}

export type WorkspaceState = {
  id: string
  hostId: string
  remotePath: string
  title: string
  status: WorkspaceStatus
  derived: DerivedWorkspace
  browser: { tabs: BrowserTab[]; activeTabId: string | null }
  editor: { openFiles: OpenFile[]; activeFile: string | null }
  terminal: { sessionIds: string[]; activeSessionId: string | null }
  dev: { servers: Record<string, DevServerState> }
  mcp: { cdpEnabled: boolean }
  createdAt: number
}

export type AppSettings = {
  taskProvider: TaskProviderId
  scmProvider: ScmProviderId
  jira: { host: string; email: string; apiTokenEnc: string } | null
  bitbucket: {
    host: string
    username: string
    appPasswordEnc: string
    workspace: string
    repo: string
  } | null
  defaultBrowserUrl: string
  cdpPort: number
  mcpAuthToken: string
  theme: 'dark' | 'light' | 'system'
  /** @deprecated prefer host.hide */
  hideExtra?: string[]
}

/** Runtime flags returned with settings:get (not persisted). */
export type SettingsSnapshot = AppSettings & {
  encryptionAvailable: boolean
}

export type JiraIssue = {
  key: string
  summary: string
  status: string
  labels: string[]
  assignee?: string
  url: string
}

export type PullRequest = {
  id: number
  title: string
  state: string
  url: string
  author?: string
}

export type McpStatus = {
  enabled: boolean
  cdpUrl: string
  mcpUrl: string
  error?: string
}

export type SearchHit = {
  path: string
  line: number
  text: string
}

export type GitStatus = {
  branch: string | null
  dirty: boolean
  ahead: number
  behind: number
}
