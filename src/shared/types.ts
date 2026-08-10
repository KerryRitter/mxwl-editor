export type HostKind = 'ssh' | 'local'

export type AuthConfig =
  | { kind: 'none' }
  | { kind: 'agent' }
  | { kind: 'key'; keyPath: string; encryptedPassphrase?: string }
  | { kind: 'password'; encryptedPassword: string }

export type TestLoginConfig = {
  username: string
  /** Encrypted at rest — never send plaintext to renderer */
  passwordEnc: string
  usernameSelector: string
  passwordSelector: string
  submitSelector: string
}

export type TestLoginInput = {
  username: string
  /** Plaintext; omit/blank keeps existing encrypted password */
  password?: string
  usernameSelector: string
  passwordSelector: string
  submitSelector: string
}

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
  /** Sent to the first terminal after connect (e.g. `claudey`) */
  terminalStartup?: string
  /** Browser auto-fill login for test accounts */
  testLogin?: TestLoginConfig
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
  terminalStartup?: string
  testLogin?: TestLoginInput | null
  auth: HostAuthInput
}

export type TaskProviderId = 'jira' | 'linear' | 'github-issues' | 'none'
export type ScmProviderId = 'bitbucket' | 'github' | 'gitlab' | 'none'
export type AiCliId =
  | 'claude'
  | 'codex'
  | 'cursor'
  | 'gemini'
  | 'kimi'
  | 'copilot'
  | 'qwen'
  | 'opencode'
  | 'goose'

/** An agent that speaks ACP over stdio — see `shared/acpAgents.ts` */
export type AgentId =
  | 'claude'
  | 'codex'
  | 'cursor'
  | 'gemini'
  | 'kimi'
  | 'copilot'
  | 'qwen'
  | 'opencode'
  | 'goose'
  | 'custom'

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
  groupId: string
}

/**
 * A set of tabs sharing one cookie jar. Tabs in different groups are logged in
 * independently — the group is the sandbox boundary.
 */
export type TabGroup = {
  id: string
  label: string
  /** Hex border colour that marks the group in the tab strip and viewport */
  color: string
  /** Electron session partition; empty means the app's default session */
  partition: string
}

export type OpenFile = {
  path: string
  dirty: boolean
  scrollTop: number
  cursor: { line: number; col: number }
}

export type TerminalInfo = {
  id: string
  label: string
  /** Set when the session was spawned by an AI run rather than by the user. */
  aiTaskId?: string
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
  terminal: { sessions: TerminalInfo[]; activeSessionId: string | null }
  dev: { servers: Record<string, DevServerState> }
  mcp: { cdpEnabled: boolean }
  createdAt: number
}

export type AiSettings = {
  /** CLI launched in each AI terminal */
  defaultCli: AiCliId
  /** Host used for AI runs when the modal has no explicit pick */
  defaultHostId: string | null
  /** Per-CLI binary override (blank → registry default) */
  commandOverrides: Partial<Record<AiCliId, string>>
  /** Per-CLI extra flags, e.g. `--permission-mode acceptEdits` */
  argsOverrides: Partial<Record<AiCliId, string>>
  /** Folder under host.workspacesRoot for a task. Vars: ${key} ${keyLower} ${keyNum} ${slug} */
  workspaceFolderTemplate: string
  /** Folder under host.workspacesRoot holding the base repo used to create branches */
  baseRepoFolder: string
  /** Shell command run in baseRepoFolder when the task folder is missing */
  initBranchCommand: string
  /** How long to wait for initBranchCommand to materialise the folder */
  initTimeoutSec: number
  /** Run the CLI headless first to rewrite each task prompt */
  refinePrompts: boolean
}

export type AgentSettings = {
  /** Agent the Agent tab connects to when a workspace has no pick yet */
  defaultAgent: AgentId
  /** Per-agent launcher override (blank → registry default) */
  commandOverrides: Partial<Record<AgentId, string>>
  /** Per-agent extra argv appended to the ACP launch line */
  argsOverrides: Partial<Record<AgentId, string>>
  /**
   * Start in the agent's most permissive mode and answer every permission
   * request with its allow option. The agent then edits and runs commands in the
   * workspace with no confirmation.
   */
  autoApprove: boolean
}

export type AppSettings = {
  taskProvider: TaskProviderId
  scmProvider: ScmProviderId
  ai: AiSettings
  agent: AgentSettings
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

/** One AI CLI invocation — becomes a terminal tab inside a workspace. */
export type AiPlanTask = {
  id: string
  /** Terminal tab label, e.g. `qa` */
  label: string
  /** Raw step text from the brief */
  instruction: string
  /** Fully rendered text handed to the CLI */
  prompt: string
}

/** One workspace the run touches — usually one ticket/epic. */
export type AiPlanTarget = {
  id: string
  /** Issue key when the brief had one */
  key: string | null
  title: string
  /** Folder name under the host workspaces root */
  folder: string
  tasks: AiPlanTask[]
}

/**
 * A one-off command the brief asks for before (or alongside) the per-ticket work
 * — typically a branch-init script run once in the base repo.
 */
export type AiPlanPrep = {
  /** Folder to run in, relative to the host's workspaces root, or absolute/`~` */
  cwd: string
  /** Verbatim command or CLI slash-command from the brief */
  command: string
  /** `cli` runs it as a prompt through the AI CLI; `shell` types it into the shell */
  kind: 'cli' | 'shell'
  /** Prompt sent when `kind === 'cli'` */
  prompt: string
  /** When false the ticket work starts immediately instead of waiting */
  blocking: boolean
}

export type AiPlan = {
  brief: string
  /** Non-list prose from the brief, passed to every task */
  context: string
  hostId: string
  cli: AiCliId
  prep: AiPlanPrep | null
  targets: AiPlanTarget[]
}

export type AiTaskStatus =
  | 'pending'
  | 'provisioning'
  | 'opening'
  | 'launching'
  | 'running'
  | 'done'
  | 'error'
  | 'skipped'

export type AiTaskRun = {
  targetId: string
  taskId: string
  label: string
  status: AiTaskStatus
  wsId?: string
  sessionId?: string
  message?: string
}

export type AiTargetRun = {
  targetId: string
  key: string | null
  title: string
  folder: string
  path: string
  status: AiTaskStatus
  wsId?: string
  message?: string
}

export type AiRunState = {
  runId: string
  cli: AiCliId
  hostId: string
  startedAt: number
  finishedAt?: number
  status: 'running' | 'done' | 'error' | 'cancelled'
  prep?: {
    command: string
    path: string
    status: AiTaskStatus
    blocking: boolean
    message?: string
    wsId?: string
    sessionId?: string
    /** When the setup command was launched, for the elapsed counter */
    startedAt?: number
    /** When it stopped, so the elapsed counter freezes instead of running on */
    finishedAt?: number
    /** Tail of the setup terminal, so a long setup isn't a blank wait */
    output?: string[]
  }
  targets: AiTargetRun[]
  tasks: AiTaskRun[]
  log: { ts: number; text: string }[]
}

// ── Agent panel (ACP) ────────────────────────────────────────────────────────

export type AgentConnStatus =
  | 'idle'
  | 'starting'
  | 'auth-required'
  | 'ready'
  | 'error'
  | 'exited'

export type AgentTurnStatus = 'idle' | 'running' | 'cancelling'

export type AgentToolStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

export type AgentToolContent =
  | { kind: 'text'; text: string }
  | { kind: 'diff'; path: string; oldText: string | null; newText: string }
  | { kind: 'terminal'; terminalId: string }

/**
 * One renderable unit inside a message. Tool calls live in the stream rather than
 * a sidebar so the transcript reads in the order things actually happened.
 */
export type AgentBlock =
  | { kind: 'text'; text: string }
  | { kind: 'thought'; text: string }
  | {
      kind: 'tool'
      toolCallId: string
      title: string
      name: string | null
      toolKind: string
      status: AgentToolStatus
      content: AgentToolContent[]
      locations: string[]
    }

export type AgentMessage = {
  id: string
  role: 'user' | 'agent'
  ts: number
  blocks: AgentBlock[]
}

export type AgentPlanEntry = {
  content: string
  priority: 'high' | 'medium' | 'low'
  status: 'pending' | 'in_progress' | 'completed'
}

export type AgentPermissionOption = {
  optionId: string
  name: string
  kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always'
}

export type AgentPermissionRequest = {
  /** mxwl-side id; the ACP request is held open in main until this is answered */
  requestId: string
  toolCallId: string
  title: string
  toolKind: string
  content: AgentToolContent[]
  options: AgentPermissionOption[]
}

/** One entry in the slash-command palette. See `shared/agentCommands.ts`. */
export type AgentCommand = {
  name: string
  description: string
  /** mxwl's cross-agent id for this command, when it maps to one */
  canonical: string | null
  /** `agent` runs over ACP; `client` is handled by mxwl itself */
  source: 'agent' | 'client'
  /** Other names that select this command — the cross-agent synonyms */
  aliases: string[]
  takesInput: boolean
}

/**
 * A conversation saved to disk. Keyed by `cwd` rather than `wsId`, since the
 * workspace id is new on every open but the folder is what the user recognises.
 */
export type AgentTranscriptMeta = {
  id: string
  agentId: AgentId
  agentLabel: string
  cwd: string
  startedAt: number
  updatedAt: number
  messageCount: number
  /** Opening words of the first user message — what makes the list scannable */
  title: string
}

export type AgentTranscript = AgentTranscriptMeta & { messages: AgentMessage[] }

export type AgentModeInfo = {
  id: string
  name: string
  description: string | null
  /** plan | ask | auto | full, when the agent's mode maps onto one */
  canonical: string | null
}

export type AgentAuthMethod = {
  id: string
  name: string
  description: string | null
}

export type AgentSessionState = {
  wsId: string
  agentId: AgentId
  agentLabel: string
  status: AgentConnStatus
  turn: AgentTurnStatus
  /** Last failure, kept until the next successful action */
  error: string | null
  /** `name vX.Y` reported at initialize, when the agent sends one */
  agentInfo: string | null
  sessionId: string | null
  cwd: string
  messages: AgentMessage[]
  plan: AgentPlanEntry[]
  commands: AgentCommand[]
  modes: { current: string | null; available: AgentModeInfo[] }
  authMethods: AgentAuthMethod[]
  permission: AgentPermissionRequest | null
  /** Context window fill, when the agent reports it */
  usage: { used: number; size: number } | null
  startedAt: number
}
