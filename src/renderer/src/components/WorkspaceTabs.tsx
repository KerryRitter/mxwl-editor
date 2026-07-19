import { useEffect, type FC } from 'react'
import { Server, X } from 'lucide-react'
import type { WorkspaceState, WorkspaceStatus } from '../../../shared/types'
import { useWorkspacesStore } from '../store/workspaces'
import { NewWorkspaceButton } from './NewWorkspaceModal'

const statusColor: Record<WorkspaceStatus, string> = {
  connected: 'bg-emerald-500',
  connecting: 'bg-amber-400',
  reconnecting: 'bg-amber-400',
  disconnected: 'bg-neutral-600',
  error: 'bg-red-500'
}

export const WorkspaceTabs: FC = () => {
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const activeId = useWorkspacesStore((s) => s.activeId)
  const setActive = useWorkspacesStore((s) => s.setActive)
  const close = useWorkspacesStore((s) => s.close)
  const applyEvent = useWorkspacesStore((s) => s.applyEvent)
  const hostsView = activeId === null

  useEffect(() => {
    const off = window.api.on('workspace:event', (...args: unknown[]) => {
      const payload = args[0] as {
        id: string
        status: WorkspaceStatus
        state?: WorkspaceState
      }
      if (payload?.id) applyEvent(payload.id, payload.status, payload.state)
    })
    return off
  }, [applyEvent])

  function showHosts(): void {
    if (activeId) void window.api.browser.setVisible(activeId, false)
    setActive(null)
  }

  function focusWorkspace(id: string): void {
    setActive(id)
    void window.api.browser.activate(id)
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-neutral-800 bg-neutral-950 px-2 py-1">
      <button
        type="button"
        onClick={showHosts}
        title="Manage hosts"
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${
          hostsView
            ? 'bg-neutral-800 text-neutral-100'
            : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
        }`}
      >
        <Server size={12} />
        Hosts
      </button>
      <span className="mx-1 h-4 w-px bg-neutral-800" />
      {workspaces.map((w) => (
        <div
          key={w.id}
          onClick={() => focusWorkspace(w.id)}
          className={`group flex cursor-pointer items-center gap-2 rounded-md px-3 py-1 text-xs ${
            activeId === w.id
              ? 'bg-neutral-800 text-neutral-100'
              : 'text-neutral-400 hover:bg-neutral-900'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${statusColor[w.status]}`} />
          <span className="max-w-[160px] truncate">{w.title}</span>
          {w.derived.issueKey && (
            <span className="rounded bg-neutral-700/60 px-1 text-[10px] text-neutral-300">
              {w.derived.issueKey}
            </span>
          )}
          {w.derived.dirty && (
            <span className="text-amber-400" title="Uncommitted changes">
              •
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              void close(w.id)
            }}
            className="text-neutral-600 opacity-0 hover:text-red-400 group-hover:opacity-100"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <div className="ml-1">
        <NewWorkspaceButton />
      </div>
    </div>
  )
}
