import { useEffect, useState, type FC } from 'react'
import { Bot, ChevronRight, FolderGit2, Pencil, Server, X } from 'lucide-react'
import type { WorkspaceState, WorkspaceStatus } from '../../../shared/types'
import { useWorkspacesStore } from '../store/workspaces'
import { useEditorStore } from '../store/editor'
import { NewWorkspaceButton } from './NewWorkspaceModal'
import { useAgentStore } from '../store/agent'
import { agentActivity } from '../../../shared/agentActivity'
import { useProjectsStore } from '../store/projects'
import { useHostsStore } from '../store/hosts'
import { useProjectNavigation } from '../store/projectNavigation'

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
  const {
    projectId: selectedProjectId,
    hostId: selectedHostId,
    select
  } = useProjectNavigation()
  const active = workspaces.find((w) => w.id === activeId)
  const projectId = active?.projectId ?? selectedProjectId
  const hostId = active?.hostId ?? selectedHostId
  const projects = useProjectsStore((s) => s.projects)
  const hosts = useHostsStore((s) => s.hosts)
  const project = projects.find((p) => p.id === projectId)
  const host = hosts.find((h) => h.id === hostId)
  const scopedWorkspaces = workspaces.filter(
    (w) => w.projectId === projectId && w.hostId === hostId
  )
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

  function navigate(projectId: string | null, hostId?: string | null): void {
    if (activeId) void window.api.browser.setVisible(activeId, false)
    select(projectId, hostId)
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
        onClick={() => navigate(null)}
        title="All projects"
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${
          !projectId && !activeId
            ? 'bg-neutral-800 text-neutral-100'
            : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
        }`}
      >
        <FolderGit2 size={12} />
        Projects
      </button>
      {project && (
        <>
          <ChevronRight size={12} className="shrink-0 text-neutral-600" />
          <button
            className="shrink-0 rounded px-2 py-1 text-xs text-emerald-400 hover:bg-neutral-900"
            title={`Hosts for ${project.label}`}
            onClick={() => navigate(projectId)}
          >
            {project.label}
          </button>
        </>
      )}
      {host && (
        <>
          <ChevronRight size={12} className="shrink-0 text-neutral-600" />
          <button
            className="flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-900"
            title={`Workspaces on ${host.label}`}
            onClick={() => navigate(projectId, hostId)}
          >
            <Server size={12} />
            {host.label}
          </button>
        </>
      )}
      <span className="mx-1 h-4 w-px bg-neutral-800" />
      {scopedWorkspaces.map((w) => {
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
                ? `${w.projectLabel || 'Unassigned'} · ${w.hostLabel} · ${w.remotePath} · ${activity.summary} · Double-click or press F2 to rename`
                : `${w.projectLabel || 'Unassigned'} · ${w.hostLabel} · ${w.remotePath} · Double-click or press F2 to rename`
            }
            className={`group flex cursor-pointer items-center gap-2 rounded-md px-3 py-1 text-xs ${
              activeId === w.id
                ? 'bg-neutral-800 text-neutral-100'
                : 'text-neutral-400 hover:bg-neutral-900'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${statusColor[w.status]}`}
            />
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
              title={`Close workspace ${w.title}`}
              aria-label={`Close workspace ${w.title}`}
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
      {hostId && (
        <div className="ml-1">
          <NewWorkspaceButton />
        </div>
      )}
    </div>
  )
}
