import { useCallback, useEffect, useMemo, useState, type FC, type ReactNode } from 'react'
import { Boxes, FileCode2, Loader2, Search, Terminal } from 'lucide-react'
import { Modal } from './Modal'
import { useWorkspacesStore } from '../store/workspaces'
import { useHostsStore } from '../store/hosts'
import { useEditorStore } from '../store/editor'
import { useAgentStore } from '../store/agent'
import { useNavigationStore } from '../store/navigation'
import { basename } from '../util'
import { fuzzySort } from '../../../shared/fuzzy'
import type { AgentId, BrowserTab } from '../../../shared/types'

export type SpotlightMode = 'all' | 'files' | 'commands'

type PaletteItem = {
  id: string
  label: string
  hint?: string
  group: string
  keywords?: string
  run: () => void | Promise<void>
}

type FileResult = { wsId: string; workspace: string; path: string }
type BrowserResult = { wsId: string; workspace: string; tab: BrowserTab }

type SpotlightProps = {
  mode: SpotlightMode
  onClose: () => void
  onOpenSettings: () => void
  onOpenAi: () => void
  onLaunchTicket: () => void
  hideBrowserWs?: string | null
}

export const CommandPalette: FC<SpotlightProps> = ({
  mode: initialMode,
  onClose,
  onOpenSettings,
  onOpenAi,
  onLaunchTicket,
  hideBrowserWs
}) => {
  const [mode, setMode] = useState<SpotlightMode>(initialMode)
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const [files, setFiles] = useState<FileResult[]>([])
  const [browserTabs, setBrowserTabs] = useState<BrowserResult[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)

  const setNewModalOpen = useWorkspacesStore((state) => state.setNewModalOpen)
  const workspaces = useWorkspacesStore((state) => state.workspaces)
  const setActive = useWorkspacesStore((state) => state.setActive)
  const closeWs = useWorkspacesStore((state) => state.close)
  const hosts = useHostsStore((state) => state.hosts)
  const activeId = useWorkspacesStore((state) => state.activeId)
  const editorByWs = useEditorStore((state) => state.byWs)
  const openFile = useEditorStore((state) => state.open)
  const clearEditorWs = useEditorStore((state) => state.clearWs)
  const agentCatalog = useAgentStore((state) => state.catalog)
  const agentSessions = useAgentStore((state) => state.sessions)
  const openAgent = useAgentStore((state) => state.open)
  const focusPanel = useNavigationStore((state) => state.focus)
  const activeWs = workspaces.find((workspace) => workspace.id === activeId)

  const focusWorkspace = useCallback(
    (wsId: string): void => {
      setActive(wsId)
      void window.api.browser.activate(wsId)
    },
    [setActive]
  )

  useEffect(() => {
    if (hideBrowserWs) void window.api.browser.setVisible(hideBrowserWs, false)
    return () => {
      if (hideBrowserWs && useWorkspacesStore.getState().activeId === hideBrowserWs) {
        void window.api.browser.setVisible(hideBrowserWs, true)
      }
    }
  }, [hideBrowserWs])

  useEffect(() => {
    if (mode !== 'all') {
      setBrowserTabs([])
      return
    }
    let cancelled = false
    void Promise.all(
      workspaces.map(async (workspace) => ({
        workspace,
        snapshot: await window.api.browser.snapshot(workspace.id).catch(() => null)
      }))
    ).then((results) => {
      if (cancelled) return
      setBrowserTabs(
        results.flatMap(({ workspace, snapshot }) =>
          (snapshot?.tabs ?? []).map((tab) => ({
            wsId: workspace.id,
            workspace: workspace.title,
            tab
          }))
        )
      )
    })
    return () => {
      cancelled = true
    }
  }, [mode, workspaces])

  useEffect(() => {
    const targets =
      mode === 'files'
        ? activeWs?.status === 'connected'
          ? [activeWs]
          : []
        : mode === 'all' && q.trim()
          ? workspaces.filter((workspace) => workspace.status === 'connected')
          : []
    if (targets.length === 0) {
      setFiles([])
      setLoadingFiles(false)
      return
    }

    let cancelled = false
    setLoadingFiles(true)
    const timer = setTimeout(() => {
      void Promise.all(
        targets.map(async (workspace) => ({
          workspace,
          paths: await window.api.workspace.listFiles(workspace.id, q).catch(() => [])
        }))
      )
        .then((results) => {
          if (cancelled) return
          setFiles(
            results.flatMap(({ workspace, paths }) =>
              paths.slice(0, mode === 'all' ? 80 : 200).map((path) => ({
                wsId: workspace.id,
                workspace: workspace.title,
                path
              }))
            )
          )
        })
        .finally(() => {
          if (!cancelled) setLoadingFiles(false)
        })
    }, q ? 100 : 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [mode, activeWs, q, workspaces])

  const actions = useMemo<PaletteItem[]>(() => {
    const list: PaletteItem[] = [
      {
        id: 'new-ws',
        label: 'New workspace',
        hint: 'Ctrl+T',
        group: 'Command',
        keywords: 'open folder host',
        run: () => {
          setNewModalOpen(true)
          onClose()
        }
      },
      {
        id: 'ai-run',
        label: 'Run multi-workspace AI tasks…',
        hint: 'Ctrl+Shift+A',
        group: 'Command',
        keywords: 'agent claude codex cursor prompt epic ticket',
        run: () => {
          onOpenAi()
          onClose()
        }
      },
      {
        id: 'settings',
        label: 'Open settings',
        hint: 'Ctrl+,',
        group: 'Command',
        keywords: 'preferences config',
        run: () => {
          onOpenSettings()
          onClose()
        }
      },
      {
        id: 'hosts',
        label: 'Manage hosts',
        group: 'Command',
        keywords: 'ssh local machine servers',
        run: () => {
          if (activeId) void window.api.browser.setVisible(activeId, false)
          setActive(null)
          onClose()
        }
      },
      {
        id: 'mode-files',
        label: 'Quick open file…',
        hint: 'Ctrl+P',
        group: 'Command',
        keywords: 'goto file find',
        run: () => {
          setMode('files')
          setQ('')
          setCursor(0)
        }
      },
      {
        id: 'mode-commands',
        label: 'Show commands only…',
        hint: 'Ctrl+Shift+P',
        group: 'Command',
        run: () => {
          setMode('commands')
          setQ('')
          setCursor(0)
        }
      }
    ]

    if (activeId) {
      list.push(
        {
          id: 'ticket-launch',
          label: 'Launch ticket worktree + sandbox + agent…',
          hint: 'Ctrl+Shift+T',
          group: 'Workflow',
          keywords: 'ticket jira worktree branch browser sandbox agent',
          run: () => {
            onLaunchTicket()
            onClose()
          }
        },
        {
          id: 'close-ws',
          label: 'Close active workspace',
          hint: 'Ctrl+W',
          group: 'Command',
          run: () => {
            clearEditorWs(activeId)
            void closeWs(activeId)
            onClose()
          }
        },
        {
          id: 'show-changes',
          label: 'Show working-tree changes',
          group: 'Command',
          keywords: 'git diff review',
          run: () => {
            focusPanel(activeId, 'changes')
            onClose()
          }
        },
        {
          id: 'refresh-git',
          label: 'Refresh Git status',
          group: 'Command',
          run: () => {
            void window.api.workspace.git(activeId)
            onClose()
          }
        },
        {
          id: 'reload-browser',
          label: 'Reload browser tab',
          group: 'Command',
          run: async () => {
            const snapshot = await window.api.browser.snapshot(activeId)
            if (snapshot?.activeId) await window.api.browser.reload(activeId, snapshot.activeId)
            onClose()
          }
        }
      )
    }

    for (const host of hosts) {
      list.push({
        id: `host-${host.id}`,
        label: `New workspace on ${host.label}`,
        hint: host.kind === 'local' ? 'this machine' : `${host.username}@${host.host}`,
        group: 'Host',
        keywords: `${host.label} ${host.host}`,
        run: () => {
          setNewModalOpen(true, host.id)
          onClose()
        }
      })
    }
    return list
  }, [
    activeId,
    clearEditorWs,
    closeWs,
    focusPanel,
    hosts,
    onClose,
    onLaunchTicket,
    onOpenAi,
    onOpenSettings,
    setActive,
    setNewModalOpen
  ])

  const resources = useMemo<PaletteItem[]>(() => {
    const list: PaletteItem[] = []
    for (const workspace of workspaces) {
      list.push({
        id: `workspace:${workspace.id}`,
        label: workspace.title,
        hint: workspace.remotePath,
        group: 'Workspace',
        keywords: workspace.derived.issueKey ?? '',
        run: () => {
          focusWorkspace(workspace.id)
          onClose()
        }
      })

      for (const file of editorByWs[workspace.id]?.files ?? []) {
        list.push({
          id: `editor:${workspace.id}:${file.path}`,
          label: basename(file.path),
          hint: `${workspace.title} · ${file.path}`,
          group: 'Editor tab',
          run: () => {
            focusWorkspace(workspace.id)
            openFile(workspace.id, file.path)
            focusPanel(workspace.id, 'code')
            onClose()
          }
        })
      }

      for (const terminal of workspace.terminal.sessions) {
        list.push({
          id: `terminal:${workspace.id}:${terminal.id}`,
          label: terminal.label,
          hint: `${workspace.title}${terminal.tmuxName ? ` · tmux:${terminal.tmuxName}` : ''}`,
          group: 'Terminal tab',
          run: () => {
            focusWorkspace(workspace.id)
            void window.api.terminal.setActive(workspace.id, terminal.id)
            focusPanel(workspace.id, 'terminal')
            onClose()
          }
        })
      }

      const session = agentSessions[workspace.id]
      if (session) {
        list.push({
          id: `agent-session:${workspace.id}`,
          label: `${session.agentLabel} · ${workspace.title}`,
          hint: session.status,
          group: 'Agent',
          keywords: session.agentId,
          run: () => {
            focusWorkspace(workspace.id)
            focusPanel(workspace.id, 'agent')
            onClose()
          }
        })
      }
    }

    for (const result of browserTabs) {
      list.push({
        id: `browser:${result.wsId}:${result.tab.id}`,
        label: result.tab.title || result.tab.url,
        hint: `${result.workspace} · ${result.tab.url}`,
        group: 'Browser tab',
        run: () => {
          focusWorkspace(result.wsId)
          void window.api.browser.setActive(result.wsId, result.tab.id)
          focusPanel(result.wsId, 'browser')
          onClose()
        }
      })
    }

    for (const file of files) {
      list.push({
        id: `file:${file.wsId}:${file.path}`,
        label: basename(file.path),
        hint: `${file.workspace} · ${file.path}`,
        group: 'File',
        run: () => {
          focusWorkspace(file.wsId)
          openFile(file.wsId, file.path)
          focusPanel(file.wsId, 'code')
          onClose()
        }
      })
    }

    if (activeId) {
      for (const agent of agentCatalog) {
        list.push({
          id: `agent-choice:${activeId}:${agent.id}`,
          label: `Use ${agent.label}`,
          hint: activeWs?.title,
          group: 'Agent',
          keywords: `${agent.id} ${agent.hint}`,
          run: () => {
            void openAgent(activeId, agent.id as AgentId)
            focusPanel(activeId, 'agent')
            onClose()
          }
        })
      }
    }
    return list
  }, [
    activeId,
    activeWs?.title,
    agentCatalog,
    agentSessions,
    browserTabs,
    editorByWs,
    files,
    focusPanel,
    focusWorkspace,
    onClose,
    openAgent,
    openFile,
    workspaces
  ])

  const items = useMemo(() => {
    const source =
      mode === 'commands'
        ? actions
        : mode === 'files'
          ? resources.filter((item) => item.group === 'File')
          : [...resources, ...actions]
    return fuzzySort(
      q,
      source,
      (item) => `${item.label} ${item.hint ?? ''} ${item.group} ${item.keywords ?? ''}`
    ).slice(0, 100)
  }, [actions, mode, q, resources])

  useEffect(() => setCursor(0), [q, mode, items.length])

  const runSelected = useCallback(() => {
    const item = items[cursor]
    if (item) void item.run()
  }, [items, cursor])

  const title =
    mode === 'all'
      ? 'Search everything'
      : mode === 'files'
        ? activeId
          ? 'Quick open'
          : 'Quick open (open a workspace first)'
        : 'Commands'

  return (
    <Modal title={title} onClose={onClose} width={660}>
      <div className="mb-2 flex gap-1">
        <ModeChip active={mode === 'all'} onClick={() => setMode('all')} icon={<Search size={12} />}>
          Everything · Ctrl+K
        </ModeChip>
        <ModeChip active={mode === 'files'} onClick={() => setMode('files')} icon={<FileCode2 size={12} />}>
          Files · Ctrl+P
        </ModeChip>
        <ModeChip active={mode === 'commands'} onClick={() => setMode('commands')} icon={<Terminal size={12} />}>
          Commands · Ctrl+Shift+P
        </ModeChip>
      </div>
      <div className="relative">
        <input
          autoFocus
          value={q}
          onChange={(event) => setQ(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setCursor((current) => Math.min(current + 1, Math.max(0, items.length - 1)))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setCursor((current) => Math.max(0, current - 1))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              runSelected()
            } else if (event.key === 'Tab') {
              event.preventDefault()
              setMode((current) =>
                current === 'all' ? 'files' : current === 'files' ? 'commands' : 'all'
              )
              setQ('')
            }
          }}
          placeholder={
            mode === 'all'
              ? 'Files, tabs, commands, agents, terminals…'
              : mode === 'files'
                ? 'Search files by name…'
                : 'Type a command…'
          }
          className="mb-3 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 pr-9 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
        />
        {loadingFiles && <Loader2 size={14} className="absolute right-3 top-2.5 animate-spin text-neutral-500" />}
      </div>
      <div className="max-h-[440px] overflow-auto">
        {items.map((item, index) => (
          <button
            key={item.id}
            onClick={() => void item.run()}
            onMouseEnter={() => setCursor(index)}
            className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm ${
              index === cursor
                ? 'bg-emerald-600/20 text-neutral-100'
                : 'text-neutral-200 hover:bg-neutral-800'
            }`}
          >
            <span className="w-20 shrink-0 truncate text-[9px] uppercase tracking-wide text-neutral-600">
              {item.group}
            </span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.hint && (
              <span className="max-w-[45%] truncate text-[11px] text-neutral-500">{item.hint}</span>
            )}
          </button>
        ))}
        {!loadingFiles && items.length === 0 && (
          <div className="grid place-items-center gap-2 px-3 py-8 text-xs text-neutral-600">
            <Boxes size={20} className="text-neutral-700" /> Nothing matched
          </div>
        )}
      </div>
    </Modal>
  )
}

const ModeChip: FC<{
  active: boolean
  onClick: () => void
  icon: ReactNode
  children: ReactNode
}> = ({ active, onClick, icon, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] ${
      active
        ? 'bg-neutral-800 text-neutral-100'
        : 'text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300'
    }`}
  >
    {icon}
    {children}
  </button>
)
