import { useEffect, useState, type FC } from 'react'
import { Server, Settings as SettingsIcon } from 'lucide-react'
import { useAppStore } from './store/app'
import { useHostsStore } from './store/hosts'
import { useWorkspacesStore } from './store/workspaces'
import { useEditorStore } from './store/editor'
import { HostManager } from './components/HostManager'
import { WorkspaceTabs } from './components/WorkspaceTabs'
import { WorkspaceView } from './components/WorkspaceView'
import { SettingsModal } from './components/SettingsModal'
import { NewWorkspaceModal, NewWorkspaceButton } from './components/NewWorkspaceModal'
import { CommandPalette } from './components/CommandPalette'

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
  const [paletteMode, setPaletteMode] = useState<'files' | 'commands'>('commands')

  useEffect(() => {
    window.api.ping().then(setPingResult).catch(console.error)
    loadHosts()
    loadWorkspaces()
  }, [setPingResult, loadHosts, loadWorkspaces])

  useEffect(() => {
    const openPalette = (mode: 'files' | 'commands'): void => {
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
        openPalette('commands')
      } else if (key === 'p' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        openPalette('files')
      } else if (key === 't' && !e.shiftKey) {
        e.preventDefault()
        setNewModalOpen(true)
      } else if (key === 'w' && !e.shiftKey && activeId) {
        e.preventDefault()
        clearEditorWs(activeId)
        void closeWs(activeId)
      } else if (e.key === ',') {
        e.preventDefault()
        setSettingsOpen(true)
      }
    }

    // capture: true so Monaco/xterm don't swallow shortcuts
    window.addEventListener('keydown', onKey, true)
    const off = window.api.on('shortcut:palette', (...args: unknown[]) => {
      const payload = args[0] as { mode?: 'files' | 'commands' } | undefined
      openPalette(payload?.mode === 'files' ? 'files' : 'commands')
    })
    return () => {
      window.removeEventListener('keydown', onKey, true)
      off()
    }
  }, [setNewModalOpen, closeWs, clearEditorWs, activeId])

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
              setPaletteMode('commands')
              setPaletteOpen(true)
            }}
            title="Command palette (Ctrl+K)"
            className="rounded px-1.5 py-0.5 text-[11px] text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
          >
            ⌘K
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

      {paletteOpen && (
        <CommandPalette
          mode={paletteMode}
          onClose={() => setPaletteOpen(false)}
          onOpenSettings={() => setSettingsOpen(true)}
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
