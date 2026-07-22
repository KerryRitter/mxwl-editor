/// <reference types="vite/client" />
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
} from '../../shared/types'

declare global {
  interface Window {
    api: {
      ping: () => Promise<{ pong: boolean; ts: number }>
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      on: (channel: string, cb: (...args: unknown[]) => void) => () => void
      host: {
        list: () => Promise<HostConfig[]>
        get: (id: string) => Promise<HostConfig | undefined>
        save: (input: HostInput) => Promise<HostConfig>
        clone: (id: string) => Promise<HostConfig>
        delete: (id: string) => Promise<void>
        test: (input: HostInput) => Promise<TestResult>
        ensureLocal: (workspacesRoot?: string) => Promise<HostConfig>
      }
      workspace: {
        list: () => Promise<WorkspaceState[]>
        discover: (hostId: string) => Promise<DirEntry[]>
        open: (hostId: string, remotePath: string) => Promise<WorkspaceState>
        close: (id: string) => Promise<void>
        git: (wsId: string) => Promise<GitStatus | null>
        search: (wsId: string, query: string) => Promise<SearchHit[]>
        listFiles: (wsId: string, query?: string) => Promise<string[]>
      }
      terminal: {
        open: (wsId: string, opts: { cwd?: string; cols: number; rows: number }) => Promise<string>
        input: (wsId: string, sessionId: string, data: string) => Promise<void>
        resize: (wsId: string, sessionId: string, cols: number, rows: number) => Promise<void>
        close: (wsId: string, sessionId: string) => Promise<void>
      }
      fs: {
        readDir: (wsId: string, path: string) => Promise<DirEntry[]>
        readFile: (
          wsId: string,
          path: string
        ) => Promise<{ content: string; encoding: 'utf8' | 'base64' }>
        writeFile: (wsId: string, path: string, content: string) => Promise<void>
        stat: (
          wsId: string,
          path: string
        ) => Promise<{ isDirectory: boolean; size: number; mtime: number }>
        mkdir: (wsId: string, path: string) => Promise<void>
        rename: (wsId: string, src: string, dst: string) => Promise<void>
        delete: (wsId: string, path: string, isDir: boolean) => Promise<void>
      }
      browser: {
        newTab: (wsId: string, url?: string) => Promise<string>
        closeTab: (wsId: string, tabId: string) => Promise<void>
        setActive: (wsId: string, tabId: string) => Promise<void>
        navigate: (wsId: string, tabId: string, url: string) => Promise<void>
        back: (wsId: string, tabId: string) => Promise<void>
        forward: (wsId: string, tabId: string) => Promise<void>
        reload: (wsId: string, tabId: string) => Promise<void>
        testLogin: (wsId: string) => Promise<void>
        zoom: (wsId: string, tabId: string, factor: number) => Promise<void>
        devtools: (wsId: string, tabId: string) => Promise<void>
        setDevtoolsBounds: (
          wsId: string,
          bounds: { x: number; y: number; width: number; height: number }
        ) => Promise<void>
        setDevtoolsVisible: (wsId: string, visible: boolean) => Promise<void>
        setBounds: (
          wsId: string,
          bounds: { x: number; y: number; width: number; height: number }
        ) => Promise<void>
        setVisible: (wsId: string, visible: boolean) => Promise<void>
        activate: (wsId: string) => Promise<void>
        snapshot: (
          wsId: string
        ) => Promise<{ wsId: string; activeId: string | null; tabs: BrowserTab[] } | null>
      }
      dev: {
        services: (wsId: string) => Promise<PresetService[]>
        run: (wsId: string, app: string, action: 'start' | 'stop' | 'restart') => Promise<void>
        tail: (wsId: string, app: string) => Promise<void>
        stopTail: (wsId: string, app: string) => Promise<void>
      }
      settings: {
        get: () => Promise<SettingsSnapshot>
        update: (input: {
          jira?: { host: string; email: string; apiToken?: string } | null
          bitbucket?:
            | {
                host: string
                username: string
                appPassword?: string
                workspace: string
                repo: string
              }
            | null
          defaultBrowserUrl?: string
          mcpAuthToken?: string
          taskProvider?: import('../../shared/types').TaskProviderId
          scmProvider?: import('../../shared/types').ScmProviderId
        }) => Promise<SettingsSnapshot>
      }
      jira: { get: (key: string) => Promise<JiraIssue | null> }
      pr: { get: (wsId: string) => Promise<PullRequest | null> }
      mcp: {
        status: () => Promise<McpStatus>
        enable: (wsId: string) => Promise<McpStatus>
        disable: (wsId: string) => Promise<McpStatus>
      }
    }
  }
}

export {}
