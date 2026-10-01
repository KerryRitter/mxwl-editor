import { contextBridge, ipcRenderer } from 'electron'
import type {
  AgentId,
  AgentNotificationRecord,
  AgentSessionState,
  AgentTranscript,
  AgentTranscriptMeta,
  AiCliId,
  AiPlan,
  AiRunState,
  BrowserTab,
  ControlStatus,
  DirEntry,
  GitChangesSnapshot,
  GitFileDiff,
  GitStatus,
  FleetAgent,
  HostConfig,
  HostInput,
  ProjectConfig,
  ProjectInput,
  ProjectLocation,
  ProjectLocationInput,
  JiraIssue,
  McpStatus,
  PresetService,
  PullRequest,
  SearchHit,
  SettingsSnapshot,
  TestResult,
  WorkspaceState
} from '../shared/types'
import type { PluginCatalogEntry, PluginHostMethod } from '../shared/plugins'
import type { TailscaleDiscovery } from '../shared/tailscale'

const api = {
  ping: (): Promise<{ pong: boolean; ts: number }> => ipcRenderer.invoke('app:ping'),
  setZoom: (factor: number): Promise<number> => ipcRenderer.invoke('app:setZoom', factor),
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, cb: (...args: unknown[]) => void) => {
    const wrapped = (_e: unknown, ...args: unknown[]) => cb(...args)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  },
  host: {
    discoverTailscale: (): Promise<TailscaleDiscovery> => ipcRenderer.invoke('host:discoverTailscale'),
    list: (): Promise<HostConfig[]> => ipcRenderer.invoke('host:list'),
    get: (id: string): Promise<HostConfig | undefined> => ipcRenderer.invoke('host:get', id),
    save: (input: HostInput): Promise<HostConfig> => ipcRenderer.invoke('host:save', input),
    clone: (id: string): Promise<HostConfig> => ipcRenderer.invoke('host:clone', id),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('host:delete', id),
    test: (input: HostInput): Promise<TestResult> => ipcRenderer.invoke('host:test', input),
    ensureLocal: (): Promise<HostConfig> =>
      ipcRenderer.invoke('host:ensureLocal')
  },
  project: {
    list: (): Promise<ProjectConfig[]> => ipcRenderer.invoke('project:list'),
    locations: (): Promise<ProjectLocation[]> => ipcRenderer.invoke('project:locations'),
    save: (input: ProjectInput): Promise<ProjectConfig> => ipcRenderer.invoke('project:save', input),
    saveLocation: (input: ProjectLocationInput): Promise<ProjectLocation> => ipcRenderer.invoke('project:saveLocation', input),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('project:delete', id),
    deleteLocation: (id: string): Promise<void> => ipcRenderer.invoke('project:deleteLocation', id)
  },
  workspace: {
    list: (): Promise<WorkspaceState[]> => ipcRenderer.invoke('workspace:list'),
    discover: (hostId: string, locationId?: string): Promise<DirEntry[]> =>
      ipcRenderer.invoke('workspace:discover', hostId, locationId),
    open: (hostId: string, remotePath: string, locationId?: string, browserProfileId?: string | null): Promise<WorkspaceState> =>
      ipcRenderer.invoke('workspace:open', { hostId, remotePath, locationId, browserProfileId }),
    createWorktree: (wsId: string, ticket: string, branch?: string): Promise<WorkspaceState> =>
      ipcRenderer.invoke('workspace:createWorktree', { wsId, ticket, branch }),
    close: (id: string): Promise<void> => ipcRenderer.invoke('workspace:close', id),
    rename: (wsId: string, title: string): Promise<void> =>
      ipcRenderer.invoke('workspace:rename', { wsId, title }),
    git: (wsId: string): Promise<GitStatus | null> => ipcRenderer.invoke('workspace:git', wsId),
    search: (wsId: string, query: string): Promise<SearchHit[]> =>
      ipcRenderer.invoke('workspace:search', { wsId, query }),
    listFiles: (wsId: string, query?: string): Promise<string[]> =>
      ipcRenderer.invoke('workspace:listFiles', { wsId, query }),
    changes: (wsId: string): Promise<GitChangesSnapshot> =>
      ipcRenderer.invoke('workspace:changes', wsId),
    fileDiff: (wsId: string, path: string): Promise<GitFileDiff> =>
      ipcRenderer.invoke('workspace:fileDiff', { wsId, path }),
    gitStageFile: (wsId: string, path: string): Promise<string> =>
      ipcRenderer.invoke('workspace:gitStageFile', { wsId, path }),
    gitUnstageFile: (wsId: string, path: string): Promise<string> =>
      ipcRenderer.invoke('workspace:gitUnstageFile', { wsId, path }),
    gitStageHunk: (wsId: string, path: string, hunkId: string): Promise<string> =>
      ipcRenderer.invoke('workspace:gitStageHunk', { wsId, path, hunkId }),
    gitCommit: (wsId: string, message: string): Promise<string> =>
      ipcRenderer.invoke('workspace:gitCommit', { wsId, message }),
    gitPush: (wsId: string): Promise<string> => ipcRenderer.invoke('workspace:gitPush', wsId),
    gitPullRequestUrl: (wsId: string): Promise<string> =>
      ipcRenderer.invoke('workspace:gitPullRequestUrl', wsId)
  },
  terminal: {
    open: (
      wsId: string,
      opts: { cwd?: string; cols: number; rows: number; label?: string; tmuxName?: string }
    ): Promise<string> => ipcRenderer.invoke('terminal:open', { wsId, ...opts }),
    replay: (wsId: string, sessionId: string): Promise<string> =>
      ipcRenderer.invoke('terminal:replay', { wsId, sessionId }),
    input: (wsId: string, sessionId: string, data: string): Promise<void> =>
      ipcRenderer.invoke('terminal:input', { wsId, sessionId, data }),
    resize: (wsId: string, sessionId: string, cols: number, rows: number): Promise<void> =>
      ipcRenderer.invoke('terminal:resize', { wsId, sessionId, cols, rows }),
    close: (wsId: string, sessionId: string): Promise<void> =>
      ipcRenderer.invoke('terminal:close', { wsId, sessionId }),
    rename: (wsId: string, sessionId: string, label: string): Promise<void> =>
      ipcRenderer.invoke('terminal:rename', { wsId, sessionId, label }),
    setActive: (wsId: string, sessionId: string): Promise<void> =>
      ipcRenderer.invoke('terminal:setActive', { wsId, sessionId })
  },
  fs: {
    readDir: (wsId: string, path: string): Promise<DirEntry[]> =>
      ipcRenderer.invoke('fs:readdir', { wsId, path }),
    readFile: (
      wsId: string,
      path: string
    ): Promise<{ content: string; encoding: 'utf8' | 'base64' }> =>
      ipcRenderer.invoke('fs:readfile', { wsId, path }),
    writeFile: (wsId: string, path: string, content: string): Promise<void> =>
      ipcRenderer.invoke('fs:writefile', { wsId, path, content }),
    stat: (
      wsId: string,
      path: string
    ): Promise<{ isDirectory: boolean; size: number; mtime: number }> =>
      ipcRenderer.invoke('fs:stat', { wsId, path }),
    mkdir: (wsId: string, path: string): Promise<void> =>
      ipcRenderer.invoke('fs:mkdir', { wsId, path }),
    rename: (wsId: string, src: string, dst: string): Promise<void> =>
      ipcRenderer.invoke('fs:rename', { wsId, src, dst }),
    delete: (wsId: string, path: string, isDir: boolean): Promise<void> =>
      ipcRenderer.invoke('fs:delete', { wsId, path, isDir })
  },
  browser: {
    ensureTab: (wsId: string, url?: string): Promise<string> =>
      ipcRenderer.invoke('browser:ensureTab', { wsId, url }),
    newTab: (wsId: string, url?: string, groupId?: string): Promise<string> =>
      ipcRenderer.invoke('browser:newTab', { wsId, url, groupId }),
    newGroup: (wsId: string, label?: string): Promise<string> =>
      ipcRenderer.invoke('browser:newGroup', { wsId, label }),
    updateGroup: (
      wsId: string,
      groupId: string,
      patch: { label?: string; color?: string }
    ): Promise<void> => ipcRenderer.invoke('browser:updateGroup', { wsId, groupId, ...patch }),
    closeGroup: (wsId: string, groupId: string): Promise<void> =>
      ipcRenderer.invoke('browser:closeGroup', { wsId, groupId }),
    clearGroup: (wsId: string, groupId: string): Promise<void> =>
      ipcRenderer.invoke('browser:clearGroup', { wsId, groupId }),
    moveTab: (wsId: string, tabId: string, groupId: string): Promise<string | null> =>
      ipcRenderer.invoke('browser:moveTab', { wsId, tabId, groupId }),
    closeTab: (wsId: string, tabId: string): Promise<void> =>
      ipcRenderer.invoke('browser:closeTab', { wsId, tabId }),
    setActive: (wsId: string, tabId: string): Promise<void> =>
      ipcRenderer.invoke('browser:setActive', { wsId, tabId }),
    navigate: (wsId: string, tabId: string, url: string): Promise<void> =>
      ipcRenderer.invoke('browser:navigate', { wsId, tabId, url }),
    back: (wsId: string, tabId: string): Promise<void> =>
      ipcRenderer.invoke('browser:back', { wsId, tabId }),
    forward: (wsId: string, tabId: string): Promise<void> =>
      ipcRenderer.invoke('browser:forward', { wsId, tabId }),
    reload: (wsId: string, tabId: string): Promise<void> =>
      ipcRenderer.invoke('browser:reload', { wsId, tabId }),
    testLogin: (wsId: string): Promise<void> => ipcRenderer.invoke('browser:testLogin', wsId),
    zoom: (wsId: string, tabId: string, factor: number): Promise<void> =>
      ipcRenderer.invoke('browser:zoom', { wsId, tabId, factor }),
    devtools: (wsId: string, tabId: string): Promise<void> =>
      ipcRenderer.invoke('browser:devtools', { wsId, tabId }),
    setDevtoolsBounds: (
      wsId: string,
      bounds: { x: number; y: number; width: number; height: number }
    ): Promise<void> => ipcRenderer.invoke('browser:setDevtoolsBounds', { wsId, ...bounds }),
    setDevtoolsVisible: (wsId: string, visible: boolean): Promise<void> =>
      ipcRenderer.invoke('browser:setDevtoolsVisible', { wsId, visible }),
    setBounds: (
      wsId: string,
      bounds: { x: number; y: number; width: number; height: number }
    ): Promise<void> => ipcRenderer.invoke('browser:setBounds', { wsId, ...bounds }),
    setVisible: (wsId: string, visible: boolean): Promise<void> =>
      ipcRenderer.invoke('browser:setVisible', { wsId, visible }),
    activate: (wsId: string): Promise<void> => ipcRenderer.invoke('browser:activate', wsId),
    snapshot: (
      wsId: string
    ): Promise<{ wsId: string; activeId: string | null; tabs: BrowserTab[] } | null> =>
      ipcRenderer.invoke('browser:snapshot', wsId)
  },
  dev: {
    services: (wsId: string): Promise<PresetService[]> => ipcRenderer.invoke('dev:services', wsId),
    run: (wsId: string, app: string, action: 'start' | 'stop' | 'restart'): Promise<void> =>
      ipcRenderer.invoke('dev:run', { wsId, app, action }),
    tail: (wsId: string, app: string): Promise<void> =>
      ipcRenderer.invoke('dev:tail', { wsId, app }),
    stopTail: (wsId: string, app: string): Promise<void> =>
      ipcRenderer.invoke('dev:stopTail', { wsId, app })
  },
  settings: {
    get: (): Promise<SettingsSnapshot> => ipcRenderer.invoke('settings:get'),
    update: (input: {
      jira?: { host: string; email: string; apiToken?: string } | null
      bitbucket?:
        | { host: string; username: string; appPassword?: string }
        | null
      mcpAuthToken?: string
      taskProvider?: import('../shared/types').TaskProviderId
      scmProvider?: import('../shared/types').ScmProviderId
      ai?: Partial<import('../shared/types').AiSettings>
      agent?: Partial<import('../shared/types').AgentSettings>
      notifications?: Partial<import('../shared/types').AgentNotificationSettings>
      control?: Partial<import('../shared/types').ControlSettings>
      runtime?: Partial<import('../shared/types').RuntimeSettings>
      plugins?: Partial<import('../shared/plugins').PluginSettings>
    }): Promise<SettingsSnapshot> => ipcRenderer.invoke('settings:update', input)
  },
  plugins: {
    list: (): Promise<PluginCatalogEntry[]> => ipcRenderer.invoke('plugins:list'),
    setEnabled: (id: string, enabled: boolean): Promise<PluginCatalogEntry[]> =>
      ipcRenderer.invoke('plugins:setEnabled', { id, enabled }),
    reload: (): Promise<PluginCatalogEntry[]> => ipcRenderer.invoke('plugins:reload'),
    openDirectory: (): Promise<void> => ipcRenderer.invoke('plugins:openDirectory'),
    chooseDirectory: (): Promise<string | null> => ipcRenderer.invoke('plugins:chooseDirectory'),
    installPath: (path: string): Promise<PluginCatalogEntry[]> =>
      ipcRenderer.invoke('plugins:installPath', { path }),
    unlink: (path: string): Promise<PluginCatalogEntry[]> =>
      ipcRenderer.invoke('plugins:unlink', { path }),
    call: (
      pluginId: string,
      wsId: string,
      method: PluginHostMethod,
      params?: Record<string, unknown>
    ): Promise<unknown> => ipcRenderer.invoke('plugins:call', { pluginId, wsId, method, params })
  },
  control: {
    status: (): Promise<ControlStatus> => ipcRenderer.invoke('control:status'),
    fleet: (): Promise<FleetAgent[]> => ipcRenderer.invoke('control:fleet')
  },
  ai: {
    plan: (req: {
      brief: string
      hostId: string
      locationId: string
      cli?: AiCliId
      refine?: boolean
    }): Promise<{ plan: AiPlan; refined: boolean; warning?: string }> =>
      ipcRenderer.invoke('ai:plan', req),
    run: (plan: AiPlan): Promise<AiRunState> => ipcRenderer.invoke('ai:run', plan),
    runs: (): Promise<AiRunState[]> => ipcRenderer.invoke('ai:runs'),
    cancel: (runId: string): Promise<void> => ipcRenderer.invoke('ai:cancel', runId)
  },
  agent: {
    catalog: (): Promise<
      { id: AgentId; label: string; hint: string; command: string; viaNpx: boolean }[]
    > => ipcRenderer.invoke('agent:catalog'),
    open: (wsId: string, agentId?: AgentId): Promise<AgentSessionState> =>
      ipcRenderer.invoke('agent:open', { wsId, agentId }),
    get: (wsId: string): Promise<AgentSessionState | null> => ipcRenderer.invoke('agent:get', wsId),
    list: (): Promise<AgentSessionState[]> => ipcRenderer.invoke('agent:list'),
    close: (wsId: string): Promise<void> => ipcRenderer.invoke('agent:close', wsId),
    restart: (wsId: string): Promise<AgentSessionState> => ipcRenderer.invoke('agent:restart', wsId),
    prompt: (wsId: string, text: string): Promise<void> =>
      ipcRenderer.invoke('agent:prompt', { wsId, text }),
    cancel: (wsId: string): Promise<void> => ipcRenderer.invoke('agent:cancel', wsId),
    clear: (wsId: string): Promise<void> => ipcRenderer.invoke('agent:clear', wsId),
    setMode: (wsId: string, modeId: string): Promise<void> =>
      ipcRenderer.invoke('agent:setMode', { wsId, modeId }),
    respond: (wsId: string, requestId: string, optionId: string | null): Promise<void> =>
      ipcRenderer.invoke('agent:respond', { wsId, requestId, optionId }),
    authenticate: (wsId: string, methodId: string): Promise<void> =>
      ipcRenderer.invoke('agent:authenticate', { wsId, methodId }),
    history: (cwd?: string, wsId?: string): Promise<AgentTranscriptMeta[]> =>
      ipcRenderer.invoke('agent:history', cwd, wsId),
    transcript: (id: string): Promise<AgentTranscript | null> =>
      ipcRenderer.invoke('agent:transcript', id),
    deleteTranscript: (id: string): Promise<void> =>
      ipcRenderer.invoke('agent:deleteTranscript', id)
  },
  attention: {
    list: (): Promise<AgentNotificationRecord[]> => ipcRenderer.invoke('attention:list'),
    markRead: (id: string): Promise<AgentNotificationRecord[]> =>
      ipcRenderer.invoke('attention:markRead', id),
    markAllRead: (): Promise<AgentNotificationRecord[]> =>
      ipcRenderer.invoke('attention:markAllRead'),
    clear: (): Promise<void> => ipcRenderer.invoke('attention:clear')
  },
  jira: {
    get: (key: string, wsId?: string): Promise<JiraIssue | null> => ipcRenderer.invoke('jira:get', key, wsId)
  },
  pr: {
    get: (wsId: string): Promise<PullRequest | null> => ipcRenderer.invoke('pr:get', wsId)
  },
  mcp: {
    status: (): Promise<McpStatus> => ipcRenderer.invoke('mcp:status'),
    enable: (wsId: string): Promise<McpStatus> => ipcRenderer.invoke('mcp:enable', wsId),
    disable: (wsId: string): Promise<McpStatus> => ipcRenderer.invoke('mcp:disable', wsId)
  }
}

export type Api = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error('Failed to expose api in contextBridge:', error)
  }
} else {
  // @ts-ignore allow direct attach when context isolation is off
  window.api = api
}
