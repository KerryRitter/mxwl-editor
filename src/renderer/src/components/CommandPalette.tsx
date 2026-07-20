import { useCallback, useEffect, useMemo, useState, type FC, type ReactNode } from 'react'
import { FileCode2, Loader2, Terminal } from 'lucide-react'
import { Modal } from './Modal'
import { useWorkspacesStore } from '../store/workspaces'
import { useHostsStore } from '../store/hosts'
import { useEditorStore } from '../store/editor'
import { basename } from '../util'

export type SpotlightMode = 'files' | 'commands'

type SpotlightAction = {
  id: string
  label: string
  hint?: string
  group: string
  keywords?: string
  run: () => void | Promise<void>
}

type SpotlightProps = {
  mode: SpotlightMode
  onClose: () => void
  onOpenSettings: () => void
  hideBrowserWs?: string | null
}

export const CommandPalette: FC<SpotlightProps> = ({
  mode: initialMode,
  onClose,
  onOpenSettings,
  hideBrowserWs
}) => {
  const [mode, setMode] = useState<SpotlightMode>(initialMode)
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const [files, setFiles] = useState<string[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)

  const setNewModalOpen = useWorkspacesStore((s) => s.setNewModalOpen)
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const setActive = useWorkspacesStore((s) => s.setActive)
  const closeWs = useWorkspacesStore((s) => s.close)
  const hosts = useHostsStore((s) => s.hosts)
  const activeId = useWorkspacesStore((s) => s.activeId)
  const openFile = useEditorStore((s) => s.open)
  const clearEditorWs = useEditorStore((s) => s.clearWs)
  const activeWs = workspaces.find((w) => w.id === activeId)

  useEffect(() => {
    if (hideBrowserWs) void window.api.browser.setVisible(hideBrowserWs, false)
    return () => {
      if (hideBrowserWs) void window.api.browser.setVisible(hideBrowserWs, true)
    }
  }, [hideBrowserWs])

  useEffect(() => {
    if (mode !== 'files' || !activeId || activeWs?.status !== 'connected') {
      setFiles([])
      return
    }
    let cancelled = false
    setLoadingFiles(true)
    const t = setTimeout(() => {
      void window.api.workspace
        .listFiles(activeId, q)
        .then((paths) => {
          if (!cancelled) setFiles(paths)
        })
        .catch(() => {
          if (!cancelled) setFiles([])
        })
        .finally(() => {
          if (!cancelled) setLoadingFiles(false)
        })
    }, q ? 120 : 0)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [mode, activeId, activeWs?.status, q])

  const actions = useMemo<SpotlightAction[]>(() => {
    const list: SpotlightAction[] = [
      {
        id: 'new-ws',
        label: 'New workspace',
        hint: 'Ctrl+T',
        group: 'Workspace',
        keywords: 'open folder host',
        run: () => {
          setNewModalOpen(true)
          onClose()
        }
      },
      {
        id: 'settings',
        label: 'Open settings',
        hint: 'Ctrl+,',
        group: 'App',
        keywords: 'preferences config',
        run: () => {
          onOpenSettings()
          onClose()
        }
      },
      {
        id: 'hosts',
        label: 'Manage hosts',
        hint: 'Hosts tab',
        group: 'App',
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
        group: 'Editor',
        keywords: 'goto file find',
        run: () => {
          setMode('files')
          setQ('')
          setCursor(0)
        }
      },
      {
        id: 'mode-commands',
        label: 'Show commands…',
        hint: 'Ctrl+K',
        group: 'App',
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
          id: 'close-ws',
          label: 'Close active workspace',
          hint: 'Ctrl+W',
          group: 'Workspace',
          run: () => {
            clearEditorWs(activeId)
            void closeWs(activeId)
            onClose()
          }
        },
        {
          id: 'refresh-git',
          label: 'Refresh git status',
          group: 'Git',
          run: () => {
            void window.api.workspace.git(activeId)
            onClose()
          }
        },
        {
          id: 'reload-browser',
          label: 'Reload browser tab',
          group: 'Browser',
          run: async () => {
            const snap = await window.api.browser.snapshot(activeId)
            if (snap?.activeId) await window.api.browser.reload(activeId, snap.activeId)
            onClose()
          }
        }
      )
    }

    for (const w of workspaces) {
      list.push({
        id: `focus-${w.id}`,
        label: `Focus workspace: ${w.title}`,
        hint: w.remotePath,
        group: 'Workspace',
        keywords: w.title,
        run: () => {
          setActive(w.id)
          void window.api.browser.activate(w.id)
          onClose()
        }
      })
    }

    for (const h of hosts) {
      list.push({
        id: `host-${h.id}`,
        label: `New workspace on ${h.label}`,
        hint: h.kind === 'local' ? 'this machine' : `${h.username}@${h.host}`,
        group: 'Hosts',
        keywords: `${h.label} ${h.host}`,
        run: () => {
          setNewModalOpen(true, h.id)
          onClose()
        }
      })
    }

    return list
  }, [
    activeId,
    clearEditorWs,
    closeWs,
    hosts,
    onClose,
    onOpenSettings,
    setActive,
    setNewModalOpen,
    workspaces
  ])

  const filteredActions = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return actions
    return actions.filter((a) => {
      const hay = `${a.label} ${a.hint ?? ''} ${a.group} ${a.keywords ?? ''}`.toLowerCase()
      return hay.includes(needle)
    })
  }, [actions, q])

  const items = useMemo(() => {
    if (mode === 'files') {
      return files.map((path) => ({
        id: `file:${path}`,
        label: basename(path),
        hint: path,
        run: () => {
          if (activeId) openFile(activeId, path)
          onClose()
        }
      }))
    }
    return filteredActions.map((a) => ({
      id: a.id,
      label: a.label,
      hint: a.hint ?? a.group,
      run: () => void a.run()
    }))
  }, [mode, files, filteredActions, openFile, onClose, activeId])

  useEffect(() => {
    setCursor(0)
  }, [q, mode, items.length])

  const runSelected = useCallback(() => {
    const item = items[cursor]
    if (item) item.run()
  }, [items, cursor])

  const title =
    mode === 'files'
      ? activeId
        ? 'Quick open'
        : 'Quick open (open a workspace first)'
      : 'Command palette'

  return (
    <Modal title={title} onClose={onClose} width={560}>
      <div className="mb-2 flex gap-1">
        <ModeChip active={mode === 'files'} onClick={() => setMode('files')} icon={<FileCode2 size={12} />}>
          Files · Ctrl+P
        </ModeChip>
        <ModeChip
          active={mode === 'commands'}
          onClick={() => setMode('commands')}
          icon={<Terminal size={12} />}
        >
          Commands · Ctrl+K
        </ModeChip>
      </div>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setCursor((c) => Math.min(c + 1, Math.max(0, items.length - 1)))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setCursor((c) => Math.max(0, c - 1))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            runSelected()
          } else if (e.key === 'Tab') {
            e.preventDefault()
            setMode((m) => (m === 'files' ? 'commands' : 'files'))
            setQ('')
          }
        }}
        placeholder={
          mode === 'files' ? 'Search files by name…' : 'Type a command…'
        }
        className="mb-3 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
      />
      <div className="max-h-80 overflow-auto">
        {mode === 'files' && loadingFiles && (
          <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-neutral-500">
            <Loader2 size={14} className="animate-spin" /> Searching…
          </div>
        )}
        {mode === 'files' && !activeId && (
          <div className="px-3 py-6 text-center text-xs text-neutral-600">
            Open a workspace to search files
          </div>
        )}
        {!loadingFiles &&
          items.map((item, i) => (
            <button
              key={item.id}
              onClick={() => item.run()}
              onMouseEnter={() => setCursor(i)}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
                i === cursor
                  ? 'bg-emerald-600/20 text-neutral-100'
                  : 'text-neutral-200 hover:bg-neutral-800'
              }`}
            >
              <span className="truncate">{item.label}</span>
              {item.hint && (
                <span className="ml-3 max-w-[55%] truncate text-[11px] text-neutral-500">
                  {item.hint}
                </span>
              )}
            </button>
          ))}
        {!loadingFiles && items.length === 0 && mode === 'commands' && (
          <div className="px-3 py-6 text-center text-xs text-neutral-600">No matching commands</div>
        )}
        {!loadingFiles && items.length === 0 && mode === 'files' && activeId && (
          <div className="px-3 py-6 text-center text-xs text-neutral-600">No files found</div>
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
