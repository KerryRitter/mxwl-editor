import { contextBridge, ipcRenderer } from 'electron'
import type {
  BrowserTab,
  DirEntry,
  GitStatus,
  HostConfig,
  HostInput,
  JiraIssue,
  McpStatus,
  PresetService,
  PullRequest,
  SearchHit,
  SettingsSnapshot,
  TestResult,
  WorkspaceState
} from '../shared/types'

const api = {
  ping: (): Promise<{ pong: boolean; ts: number }> => ipcRenderer.invoke('app:ping'),
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, cb: (...args: unknown[]) => void) => {
    const wrapped = (_e: unknown, ...args: unknown[]) => cb(...args)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  },
  host: {
    list: (): Promise<HostConfig[]> => ipcRenderer.invoke('host:list'),
    get: (id: string): Promise<HostConfig | undefined> => ipcRenderer.invoke('host:get', id),
    save: (input: HostInput): Promise<HostConfig> => ipcRenderer.invoke('host:save', input),
    clone: (id: string): Promise<HostConfig> => ipcRenderer.invoke('host:clone', id),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('host:delete', id),
    test: (input: HostInput): Promise<TestResult> => ipcRenderer.invoke('host:test', input),
    ensureLocal: (workspacesRoot?: string): Promise<HostConfig> =>
      ipcRenderer.invoke('host:ensureLocal', workspacesRoot)
  },
  workspace: {
    list: (): Promise<WorkspaceState[]> => ipcRenderer.invoke('workspace:list'),
    discover: (hostId: string): Promise<DirEntry[]> =>
      ipcRenderer.invoke('workspace:discover', hostId),
    open: (hostId: string, remotePath: string): Promise<WorkspaceState> =>
      ipcRenderer.invoke('workspace:open', { hostId, remotePath }),
    close: (id: string): Promise<void> => ipcRenderer.invoke('workspace:close', id),
    git: (wsId: string): Promise<GitStatus | null> => ipcRenderer.invoke('workspace:git', wsId),
    search: (wsId: string, query: string): Promise<SearchHit[]> =>
      ipcRenderer.invoke('workspace:search', { wsId, query }),
    listFiles: (wsId: string, query?: string): Promise<string[]> =>
      ipcRenderer.invoke('workspace:listFiles', { wsId, query })
  },
  terminal: {
    open: (wsId: string, opts: { cwd?: string; cols: number; rows: number }): Promise<string> =>
      ipcRenderer.invoke('terminal:open', { wsId, ...opts }),
    input: (wsId: string, sessionId: string, data: string): Promise<void> =>
      ipcRenderer.invoke('terminal:input', { wsId, sessionId, data }),
    resize: (wsId: string, sessionId: string, cols: number, rows: number): Promise<void> =>
      ipcRenderer.invoke('terminal:resize', { wsId, sessionId, cols, rows }),
    close: (wsId: string, sessionId: string): Promise<void> =>
      ipcRenderer.invoke('terminal:close', { wsId, sessionId })
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
    newTab: (wsId: string, url?: string): Promise<string> =>
      ipcRenderer.invoke('browser:newTab', { wsId, url }),
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
        | { host: string; username: string; appPassword?: string; workspace: string; repo: string }
        | null
      defaultBrowserUrl?: string
      mcpAuthToken?: string
      taskProvider?: import('../shared/types').TaskProviderId
      scmProvider?: import('../shared/types').ScmProviderId
    }): Promise<SettingsSnapshot> => ipcRenderer.invoke('settings:update', input)
  },
  jira: {
    get: (key: string): Promise<JiraIssue | null> => ipcRenderer.invoke('jira:get', key)
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
