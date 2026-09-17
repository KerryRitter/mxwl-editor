import { useCallback, useEffect, useState, type FC } from 'react'
import { Bot, Minus, Plus, Rocket, Server, Settings as SettingsIcon } from 'lucide-react'
import { useAppStore } from './store/app'
import { useHostsStore } from './store/hosts'
import { useWorkspacesStore } from './store/workspaces'
import { useEditorStore } from './store/editor'
import { useAiStore } from './store/ai'
import { useAgentStore } from './store/agent'
import { useNotificationsStore } from './store/notifications'
import { useNavigationStore } from './store/navigation'
import { usePluginsStore } from './store/plugins'
import { HostManager } from './components/HostManager'
import { WorkspaceTabs } from './components/WorkspaceTabs'
import { WorkspaceView } from './components/WorkspaceView'
import { SettingsModal } from './components/SettingsModal'
import { NewWorkspaceModal, NewWorkspaceButton } from './components/NewWorkspaceModal'
import { CommandPalette, type SpotlightMode } from './components/CommandPalette'
import { AiTaskModal } from './components/AiTaskModal'
import { TicketLaunchModal } from './components/TicketLaunchModal'
import { AgentNotificationBell } from './components/AgentNotificationBell'
import type { AiRunState } from '../../shared/types'

const UI_ZOOM_LEVELS = [0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const
const UI_ZOOM_STORAGE_KEY = 'mxwl.uiZoom'

const savedUiZoom = (): number => {
  const saved = localStorage.getItem(UI_ZOOM_STORAGE_KEY)
  if (saved === null) return 1
  const requested = Number(saved)
  if (!Number.isFinite(requested)) return 1
  return UI_ZOOM_LEVELS.reduce((closest, level) =>
    Math.abs(level - requested) < Math.abs(closest - requested) ? level : closest
  )
}

const App: FC = () => {
  const pingResult = useAppStore((s) => s.pingResult)
  const setPingResult = useAppStore((s) => s.setPingResult)
  const loadHosts = useHostsStore((s) => s.load)
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const activeId = useWorkspacesStore((s) => s.activeId)
  const loadWorkspaces = useWorkspacesStore((s) => s.load)
  const closeWs = useWorkspacesStore((s) => s.close)
  const setActive = useWorkspacesStore((s) => s.setActive)
  const newModalOpen = useWorkspacesStore((s) => s.newModalOpen)
  const setNewModalOpen = useWorkspacesStore((s) => s.setNewModalOpen)
  const clearEditorWs = useEditorStore((s) => s.clearWs)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteMode, setPaletteMode] = useState<SpotlightMode>('all')
  const [ticketLaunchOpen, setTicketLaunchOpen] = useState(false)
  const aiOpen = useAiStore((s) => s.modalOpen)
  const setAiOpen = useAiStore((s) => s.setModalOpen)
  const applyRun = useAiStore((s) => s.applyRun)
  const loadRuns = useAiStore((s) => s.loadRuns)
  const liveRuns = useAiStore((s) => s.runs.filter((r) => r.status === 'running').length)
  const initAgents = useAgentStore((s) => s.init)
  const initNotifications = useNotificationsStore((s) => s.init)
  const initPlugins = usePluginsStore((s) => s.init)
  const focusPanel = useNavigationStore((s) => s.focus)
  const [uiZoom, setUiZoomState] = useState(savedUiZoom)

  const setUiZoom = useCallback((requested: number): void => {
    const next = UI_ZOOM_LEVELS.reduce((closest, level) =>
      Math.abs(level - requested) < Math.abs(closest - requested) ? level : closest
    )
    localStorage.setItem(UI_ZOOM_STORAGE_KEY, String(next))
    setUiZoomState(next)
  }, [])

  const stepUiZoom = useCallback((direction: -1 | 1): void => {
    setUiZoomState((current) => {
      const index = UI_ZOOM_LEVELS.findIndex((level) => level === current)
      const nextIndex = Math.min(UI_ZOOM_LEVELS.length - 1, Math.max(0, index + direction))
      const next = UI_ZOOM_LEVELS[nextIndex]
      localStorage.setItem(UI_ZOOM_STORAGE_KEY, String(next))
      return next
    })
  }, [])

  useEffect(() => {
    void window.api.setZoom(uiZoom).catch(console.error)
  }, [uiZoom])

  useEffect(() => {
    window.api.ping().then(setPingResult).catch(console.error)
    loadHosts()
    loadWorkspaces()
    void loadRuns()
  }, [setPingResult, loadHosts, loadWorkspaces, loadRuns])

  // Runs are driven from the main process; workspace/terminal changes arrive
  // separately on `workspace:event`.
  useEffect(() => {
    const off = window.api.on('ai:event', (...args: unknown[]) =>
      applyRun(args[0] as AiRunState)
    )
    return off
  }, [applyRun])

  // Agent transcripts stream from main whether or not the panel is on screen,
  // so the subscription belongs here rather than in the panel.
  useEffect(() => initAgents(), [initAgents])
  useEffect(() => initNotifications(), [initNotifications])
  useEffect(() => initPlugins(), [initPlugins])

  useEffect(() => {
    return window.api.on('control:focusAgent', (...args: unknown[]) => {
      const wsId = (args[0] as { wsId?: string } | undefined)?.wsId
      if (!wsId) return
      setActive(wsId)
      void window.api.browser.activate(wsId)
      focusPanel(wsId, 'agent')
    })
  }, [setActive, focusPanel])

  useEffect(() => {
    const openPalette = (mode: SpotlightMode): void => {
      setPaletteMode(mode)
      setPaletteOpen(true)
    }

    const onKey = (e: KeyboardEvent): void => {
      const cmd = e.metaKey || e.ctrlKey
      if (!cmd || e.altKey) return
      const key = e.key.toLowerCase()
      if (key === 'k' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        openPalette('all')
      } else if (key === 'p' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        openPalette('files')
      } else if (key === 'p' && e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        openPalette('commands')
      } else if (key === 't' && !e.shiftKey) {
        e.preventDefault()
        setNewModalOpen(true)
      } else if (key === 't' && e.shiftKey && activeId) {
        e.preventDefault()
        setTicketLaunchOpen(true)
      } else if (key === 'w' && !e.shiftKey && activeId) {
        e.preventDefault()
        clearEditorWs(activeId)
        void closeWs(activeId)
      } else if (key === 'a' && e.shiftKey) {
        e.preventDefault()
        setAiOpen(true)
      } else if (e.key === ',') {
        e.preventDefault()
        setSettingsOpen(true)
      }
    }

    // capture: true so Monaco/xterm don't swallow shortcuts
    window.addEventListener('keydown', onKey, true)
    const off = window.api.on('shortcut:palette', (...args: unknown[]) => {
      const payload = args[0] as { mode?: SpotlightMode } | undefined
      openPalette(payload?.mode ?? 'all')
    })
    const offZoom = window.api.on('shortcut:zoom', (...args: unknown[]) => {
      const action = (args[0] as { action?: 'in' | 'out' | 'reset' } | undefined)?.action
      if (action === 'in') stepUiZoom(1)
      else if (action === 'out') stepUiZoom(-1)
      else if (action === 'reset') setUiZoom(1)
    })
    return () => {
      window.removeEventListener('keydown', onKey, true)
      off()
      offZoom()
    }
  }, [setNewModalOpen, closeWs, clearEditorWs, activeId, setAiOpen, setUiZoom, stepUiZoom])

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center gap-3 border-b border-neutral-800 px-4 py-2">
        <span className="text-sm font-semibold tracking-tight">mxwl</span>
        <span className="text-xs text-neutral-500">SSH workspace · browser + editor + terminal</span>
        <div className="ml-auto flex items-center gap-3 text-xs text-neutral-400">
          <Server size={14} className="text-neutral-500" />
          {pingResult ? (
            <span className="text-emerald-400">ready</span>
          ) : (
            <span className="text-neutral-600">connecting…</span>
          )}
          <button
            onClick={() => {
              setPaletteMode('files')
              setPaletteOpen(true)
            }}
            title="Quick open (Ctrl+P)"
            className="rounded px-1.5 py-0.5 text-[11px] text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
          >
            ⌘P
          </button>
          <button
            onClick={() => {
              setPaletteMode('all')
              setPaletteOpen(true)
            }}
            title="Search everything (Ctrl+K)"
            className="rounded px-1.5 py-0.5 text-[11px] text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
          >
            ⌘K
          </button>
          <div
            className="flex items-center rounded border border-neutral-800 bg-neutral-900/70"
            title="App UI zoom"
          >
            <button
              type="button"
              aria-label="Zoom app out"
              onClick={() => stepUiZoom(-1)}
              disabled={uiZoom === UI_ZOOM_LEVELS[0]}
              className="rounded-l p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-30"
              title="Zoom app out (Ctrl+-)"
            >
              <Minus size={12} />
            </button>
            <button
              type="button"
              aria-label="Reset app zoom"
              onClick={() => setUiZoom(1)}
              className="min-w-12 px-1 py-0.5 font-mono text-[10px] text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
              title="Reset app zoom (Ctrl+0)"
            >
              UI {Math.round(uiZoom * 100)}%
            </button>
            <button
              type="button"
              aria-label="Zoom app in"
              onClick={() => stepUiZoom(1)}
              disabled={uiZoom === UI_ZOOM_LEVELS[UI_ZOOM_LEVELS.length - 1]}
              className="rounded-r p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-30"
              title="Zoom app in (Ctrl++)"
            >
              <Plus size={12} />
            </button>
          </div>
          <button
            onClick={() => setAiOpen(true)}
            title="Run AI tasks (Ctrl+Shift+A)"
            className={`relative rounded p-1 hover:bg-neutral-800 ${
              liveRuns > 0 ? 'text-emerald-400' : 'text-neutral-400 hover:text-neutral-100'
            }`}
          >
            <Bot size={15} />
            {liveRuns > 0 && (
              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
            )}
          </button>
          <AgentNotificationBell />
          <button
            onClick={() => setTicketLaunchOpen(true)}
            disabled={!activeId}
            title="Launch ticket worktree + browser sandbox + agent (Ctrl+Shift+T)"
            className="rounded p-1 text-violet-400 hover:bg-neutral-800 hover:text-violet-200 disabled:opacity-30"
          >
            <Rocket size={15} />
          </button>
          <button
            onClick={() => {
              if (activeId) void window.api.browser.setVisible(activeId, false)
              setActive(null)
            }}
            title="Manage hosts"
            className={`rounded p-1 hover:bg-neutral-800 ${
              !activeId && workspaces.length > 0
                ? 'text-emerald-400'
                : 'text-neutral-400 hover:text-neutral-100'
            }`}
          >
            <Server size={15} />
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            title="Settings (Ctrl+,)"
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            <SettingsIcon size={15} />
          </button>
        </div>
      </header>

      {workspaces.length > 0 && <WorkspaceTabs />}
      {workspaces.length === 0 && <EmptyTabStrip />}

      <div className="relative min-h-0 flex-1">
        {!activeId && <HostManager />}
        {workspaces.map((w) => (
          <div
            key={w.id}
            className={`absolute inset-0 ${
              w.id === activeId ? 'z-10' : 'invisible pointer-events-none z-0'
            }`}
          >
            <WorkspaceView ws={w} active={w.id === activeId} />
          </div>
        ))}
      </div>

      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} hideBrowserWs={activeId} />
      )}

      {newModalOpen && (
        <NewWorkspaceModal onClose={() => setNewModalOpen(false)} hideBrowserWs={activeId} />
      )}

      {aiOpen && <AiTaskModal onClose={() => setAiOpen(false)} hideBrowserWs={activeId} />}

      {ticketLaunchOpen && activeId && (
        <TicketLaunchModal wsId={activeId} onClose={() => setTicketLaunchOpen(false)} />
      )}

      {paletteOpen && (
        <CommandPalette
          mode={paletteMode}
          onClose={() => setPaletteOpen(false)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenAi={() => setAiOpen(true)}
          onLaunchTicket={() => setTicketLaunchOpen(true)}
          hideBrowserWs={activeId}
        />
      )}
    </div>
  )
}

const EmptyTabStrip: FC = () => (
  <div className="flex items-center gap-1 border-b border-neutral-800 bg-neutral-950 px-2 py-1">
    <span className="px-1 text-[11px] text-neutral-600">No workspaces open</span>
    <div className="ml-1">
      <NewWorkspaceButton />
    </div>
  </div>
)

export default App
