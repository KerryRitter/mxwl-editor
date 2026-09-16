import { useEffect, useState, type FC } from 'react'
import { Bot, Pencil, Server, X } from 'lucide-react'
import type { WorkspaceState, WorkspaceStatus } from '../../../shared/types'
import { useWorkspacesStore } from '../store/workspaces'
import { useEditorStore } from '../store/editor'
import { NewWorkspaceButton } from './NewWorkspaceModal'
import { useAgentStore } from '../store/agent'
import { agentActivity } from '../../../shared/agentActivity'

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
  const rename = useWorkspacesStore((s) => s.rename)
  const applyEvent = useWorkspacesStore((s) => s.applyEvent)
  const clearEditorWs = useEditorStore((s) => s.clearWs)
  const agentSessions = useAgentStore((s) => s.sessions)
  const hostsView = activeId === null
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

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

  function closeWorkspace(id: string): void {
    clearEditorWs(id)
    void close(id)
  }

  function startRename(workspace: WorkspaceState): void {
    setRenamingId(workspace.id)
    setDraft(workspace.title)
  }

  function finishRename(workspace: WorkspaceState): void {
    const next = draft.trim()
    setRenamingId(null)
    if (next && next !== workspace.title) void rename(workspace.id, next)
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
      {workspaces.map((w) => {
        const agent = agentSessions[w.id]
        const activity = agent ? agentActivity(agent) : null
        const agentState = activity?.state ?? null
        return (
        <div
          key={w.id}
          onClick={() => focusWorkspace(w.id)}
          onDoubleClick={(event) => {
            event.stopPropagation()
            startRename(w)
          }}
          onKeyDown={(event) => {
            if (event.key === 'F2') {
              event.preventDefault()
              startRename(w)
            }
          }}
          tabIndex={0}
          title={
            activity
              ? `${activity.summary} · Double-click or press F2 to rename`
              : 'Double-click or press F2 to rename'
          }
          className={`group flex cursor-pointer items-center gap-2 rounded-md px-3 py-1 text-xs ${
            activeId === w.id
              ? 'bg-neutral-800 text-neutral-100'
              : 'text-neutral-400 hover:bg-neutral-900'
          }`}
          >
          <span className={`h-1.5 w-1.5 rounded-full ${statusColor[w.status]}`} />
          {renamingId === w.id ? (
            <input
              autoFocus
              value={draft}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onChange={(event) => setDraft(event.currentTarget.value)}
              onBlur={() => finishRename(w)}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Enter') event.currentTarget.blur()
                if (event.key === 'Escape') setRenamingId(null)
              }}
              className="h-5 w-36 rounded border border-violet-500/60 bg-neutral-950 px-1.5 text-xs text-neutral-100 outline-none"
              aria-label="Workspace tab name"
            />
          ) : (
            <span className="max-w-[160px] truncate">{w.title}</span>
          )}
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
          {agentState && (
            <span
              title={`Agent ${agentState === 'attention' ? 'needs attention' : agentState}`}
              className={`flex items-center ${
                agentState === 'attention'
                  ? 'text-amber-300'
                  : agentState === 'error'
                    ? 'text-red-400'
                    : agentState === 'working'
                      ? 'animate-pulse text-sky-400'
                      : 'text-neutral-600'
              }`}
            >
              <Bot size={11} />
            </span>
          )}
          {activity && activeId === w.id && (
            <span className="max-w-32 truncate text-[9px] text-neutral-500">
              {activity.summary}
            </span>
          )}
          {renamingId !== w.id && (
            <button
              onClick={(event) => {
                event.stopPropagation()
                startRename(w)
              }}
              title="Rename tab"
              className="text-neutral-600 opacity-0 hover:text-violet-300 group-hover:opacity-100"
            >
              <Pencil size={11} />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              closeWorkspace(w.id)
            }}
            className="text-neutral-600 opacity-0 hover:text-red-400 group-hover:opacity-100"
          >
            <X size={12} />
          </button>
        </div>
        )
      })}
      <div className="ml-1">
        <NewWorkspaceButton />
      </div>
    </div>
  )
}
