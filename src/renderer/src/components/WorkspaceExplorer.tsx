import { useEffect, useState } from 'react'
import {
  ChevronDown,
  Bot,
  ChevronRight,
  FolderGit2,
  Layers,
  Loader2,
  Monitor,
  PanelLeftClose,
  Plus,
  Pencil,
  Search,
  Server,
  X
} from 'lucide-react'
import { useProjectsStore } from '../store/projects'
import { useHostsStore } from '../store/hosts'
import { useWorkspacesStore } from '../store/workspaces'
import { useProjectNavigation } from '../store/projectNavigation'
import { useEditorStore } from '../store/editor'
import { useAgentStore } from '../store/agent'
import { agentActivity } from '../../../shared/agentActivity'
import type { WorkspaceState } from '../../../shared/types'

export function WorkspaceExplorer({
  onCollapse
}: {
  onCollapse: () => void
}): JSX.Element {
  const { projects, locations } = useProjectsStore()
  const hosts = useHostsStore((s) => s.hosts)
  const { workspaces, activeId, setActive, setNewModalOpen } =
    useWorkspacesStore()
  const { projectId, hostId, select, requestSetup, recentWorkspaces } =
    useProjectNavigation()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')
  useEffect(() => {
    const active = workspaces.find((w) => w.id === activeId)
    if (active) {
      setCollapsed((previous) => {
        const next = new Set(previous)
        next.delete(`project:${active.projectId}`)
        next.delete(`host:${active.projectId}:${active.hostId}`)
        return next
      })
    }
  }, [activeId, workspaces.find((w) => w.id === activeId)?.hostId])
  function toggle(key: string): void {
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  function overview(project: string | null, host?: string): void {
    if (activeId) void window.api.browser.setVisible(activeId, false)
    select(project, host)
    setActive(null)
  }
  function focus(id: string): void {
    const workspace = workspaces.find((w) => w.id === id)
    if (!workspace) return
    select(workspace.projectId, workspace.hostId)
    setActive(id)
    void window.api.browser.activate(id)
  }
  const query = filter.trim().toLowerCase()
  return (
    <nav
      aria-label="Workspace explorer"
      className="flex w-60 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900/40"
    >
      <div className="flex items-center gap-2 px-3 py-3">
        <button
          onClick={() => overview(null)}
          className="flex flex-1 items-center gap-2 text-xs font-semibold text-neutral-200"
        >
          <Layers size={14} /> Projects
        </button>
        <button
          onClick={onCollapse}
          title="Hide workspace explorer"
          className="text-neutral-500 hover:text-neutral-200"
        >
          <PanelLeftClose size={14} />
        </button>
      </div>
      <label className="mx-2 mb-2 flex items-center gap-2 rounded border border-neutral-800 bg-neutral-950 px-2 text-neutral-500">
        <Search size={12} />
        <input
          aria-label="Filter projects and workspaces"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Find a workspace…"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-xs text-neutral-200 outline-none"
        />
      </label>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {projects.map((project) => {
          const projectLocations = locations.filter(
            (l) => l.projectId === project.id
          )
          const projectMatches = project.label.toLowerCase().includes(query)
          const projectHosts = hosts
            .filter((h) => projectLocations.some((l) => l.hostId === h.id))
            .sort(
              (a, b) =>
                Number(
                  projectLocations.some(
                    (l) => l.hostId === b.id && l.builtinLocal
                  )
                ) -
                  Number(
                    projectLocations.some(
                      (l) => l.hostId === a.id && l.builtinLocal
                    )
                  ) || a.label.localeCompare(b.label)
            )
          const matchingHosts = projectHosts.filter(
            (h) =>
              projectMatches ||
              h.label.toLowerCase().includes(query) ||
              workspaces.some(
                (w) =>
                  w.projectId === project.id &&
                  w.hostId === h.id &&
                  `${w.title} ${w.remotePath}`.toLowerCase().includes(query)
              )
          )
          if (query && !projectMatches && !matchingHosts.length) return null
          const expanded = !!query || !collapsed.has(`project:${project.id}`)
          return (
            <div key={project.id} className="mb-2">
              <div
                className={`group flex items-center rounded ${projectId === project.id && !hostId ? 'bg-neutral-800' : 'hover:bg-neutral-800/60'}`}
              >
                <button
                  aria-label={`Toggle project ${project.label}`}
                  aria-expanded={expanded}
                  onClick={() => toggle(`project:${project.id}`)}
                  className="p-1 text-neutral-500"
                >
                  {expanded ? (
                    <ChevronDown size={12} />
                  ) : (
                    <ChevronRight size={12} />
                  )}
                </button>
                <button
                  aria-label={`Overview of ${project.label}`}
                  onClick={() => {
                    overview(project.id)
                    setCollapsed((previous) => {
                      const next = new Set(previous)
                      next.delete(`project:${project.id}`)
                      return next
                    })
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left text-xs font-medium text-neutral-200"
                >
                  <FolderGit2 size={13} className="shrink-0 text-emerald-400" />
                  <span className="truncate">{project.label}</span>
                </button>
                <button
                  title={`Add host to ${project.label}`}
                  onClick={() => {
                    overview(project.id)
                    requestSetup(project.id)
                  }}
                  className="p-1 text-neutral-500 opacity-0 hover:text-emerald-300 group-hover:opacity-100 focus:opacity-100"
                >
                  <Plus size={12} />
                </button>
              </div>
              {expanded &&
                matchingHosts.map((host) => {
                  const tabs = workspaces.filter(
                    (w) => w.projectId === project.id && w.hostId === host.id
                  )
                  const hostLocations = projectLocations.filter(
                    (l) => l.hostId === host.id
                  )
                  const configured = hostLocations.find((l) => l.checkoutPath)
                  const hostKey = `host:${project.id}:${host.id}`
                  const hostExpanded = !!query || !collapsed.has(hostKey)
                  return (
                    <div
                      key={host.id}
                      className="ml-3 border-l border-neutral-800 pl-1"
                    >
                      <div
                        className={`group flex items-center rounded ${projectId === project.id && hostId === host.id ? 'bg-neutral-800/70' : 'hover:bg-neutral-800/50'}`}
                      >
                        <button
                          aria-label={`Toggle host ${host.label} in ${project.label}`}
                          aria-expanded={hostExpanded}
                          onClick={() => toggle(hostKey)}
                          className="p-1 text-neutral-600"
                        >
                          {hostExpanded ? (
                            <ChevronDown size={11} />
                          ) : (
                            <ChevronRight size={11} />
                          )}
                        </button>
                        <button
                          aria-label={`Switch to ${host.label} in ${project.label}`}
                          onClick={() => {
                            const previous =
                              tabs.find(
                                (w) =>
                                  w.id ===
                                  recentWorkspaces[`${project.id}:${host.id}`]
                              ) ?? tabs[0]
                            if (previous) focus(previous.id)
                            else overview(project.id, host.id)
                          }}
                          className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-[11px] text-neutral-400"
                        >
                          {host.kind === 'local' ? (
                            <Monitor
                              size={12}
                              className="shrink-0 text-sky-400"
                            />
                          ) : (
                            <Server
                              size={12}
                              className="shrink-0 text-sky-400"
                            />
                          )}
                          <span className="truncate">
                            {hostLocations.some((l) => l.builtinLocal)
                              ? 'This machine'
                              : host.label}
                          </span>
                          <span className="ml-auto text-[10px] text-neutral-600">
                            {tabs.length || ''}
                          </span>
                        </button>
                        <button
                          title={`${configured ? 'Open workspace' : 'Configure checkout'} on ${host.label} in ${project.label}`}
                          onClick={() => {
                            if (configured)
                              setNewModalOpen(true, host.id, configured.id)
                            else {
                              overview(project.id, host.id)
                              requestSetup(project.id, hostLocations[0]?.id)
                            }
                          }}
                          className="p-1 text-neutral-500 hover:text-emerald-300"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                      {hostExpanded &&
                        tabs
                          .filter(
                            (w) =>
                              !query ||
                              projectMatches ||
                              host.label.toLowerCase().includes(query) ||
                              `${w.title} ${w.remotePath}`
                                .toLowerCase()
                                .includes(query)
                          )
                          .map((workspace) => (
                            <WorkspaceRow
                              key={workspace.id}
                              workspace={workspace}
                              label={`Open ${workspace.title} on ${host.label} in ${project.label}`}
                              onFocus={() => focus(workspace.id)}
                            />
                          ))}
                      {hostExpanded && !tabs.length && (
                        <button
                          onClick={() => {
                            overview(project.id, host.id)
                            if (configured)
                              setNewModalOpen(true, host.id, configured.id)
                            else requestSetup(project.id, hostLocations[0]?.id)
                          }}
                          className="ml-4 px-2 py-2 text-[10px] text-neutral-600 hover:text-emerald-300"
                        >
                          {configured
                            ? 'Open a workspace…'
                            : 'Set up checkout…'}
                        </button>
                      )}
                    </div>
                  )
                })}
            </div>
          )
        })}
        {workspaces.some((w) => !w.projectId) && (
          <div className="mt-4">
            <p className="mb-1 px-2 text-[10px] text-neutral-600">
              Other open workspaces
            </p>
            {workspaces
              .filter(
                (w) =>
                  !w.projectId &&
                  (!query ||
                    `${w.title} ${w.hostLabel} ${w.remotePath}`
                      .toLowerCase()
                      .includes(query))
              )
              .map((workspace) => (
                <WorkspaceRow
                  key={workspace.id}
                  workspace={workspace}
                  label={`Open ${workspace.title} on ${workspace.hostLabel}`}
                  onFocus={() => focus(workspace.id)}
                />
              ))}
          </div>
        )}
        {!projects.length && (
          <p className="px-2 py-4 text-xs text-neutral-500">
            Create a project to get started.
          </p>
        )}
      </div>
      <button
        onClick={() => overview(null)}
        className="border-t border-neutral-800 px-4 py-3 text-left text-[11px] text-neutral-500 hover:text-neutral-200"
      >
        Manage projects & connections
      </button>
    </nav>
  )
}

function WorkspaceRow({
  workspace,
  label,
  onFocus
}: {
  workspace: WorkspaceState
  label: string
  onFocus: () => void
}): JSX.Element {
  const active = useWorkspacesStore((s) => s.activeId === workspace.id)
  const rename = useWorkspacesStore((s) => s.rename)
  const close = useWorkspacesStore((s) => s.close)
  const clearEditor = useEditorStore((s) => s.clearWs)
  const agent = useAgentStore((s) => s.sessions[workspace.id])
  const activity = agent ? agentActivity(agent) : null
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const busy = workspace.terminal.sessions.some((session) => session.busy)
  function startRename(): void {
    setDraft(workspace.title)
    setEditing(true)
  }
  function finishRename(): void {
    setEditing(false)
    const title = draft.trim()
    if (title && title !== workspace.title) void rename(workspace.id, title)
  }
  return (
    <div
      data-workspace-id={workspace.id}
      className={`group ml-4 flex items-center gap-1 rounded px-2 py-1 text-[11px] ${active ? 'bg-emerald-500/10 text-emerald-300' : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200'}`}
    >
      {busy ? (
        <Loader2
          size={11}
          className="shrink-0 animate-spin text-sky-400"
          aria-label="Terminal working"
        />
      ) : (
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${workspace.status === 'connected' ? 'bg-emerald-500' : workspace.status === 'error' ? 'bg-red-400' : workspace.status === 'connecting' || workspace.status === 'reconnecting' ? 'bg-amber-400' : 'bg-neutral-600'}`}
        />
      )}
      {editing ? (
        <input
          autoFocus
          aria-label="Workspace name"
          className="min-w-0 flex-1 rounded border border-emerald-600 bg-neutral-950 px-1 py-0.5 text-[11px] text-neutral-100 outline-none"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={finishRename}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              event.preventDefault()
              setEditing(false)
            }
          }}
        />
      ) : (
        <button
          aria-label={label}
          aria-current={active ? 'page' : undefined}
          title={`${workspace.remotePath}${activity ? ` · ${activity.summary}` : ''} · Double-click or press F2 to rename`}
          tabIndex={0}
          onClick={onFocus}
          onDoubleClick={startRename}
          onKeyDown={(event) => {
            if (event.key === 'F2') {
              event.preventDefault()
              startRename()
            }
          }}
          className="min-w-0 flex-1 truncate py-0.5 text-left"
        >
          {workspace.title}
        </button>
      )}
      {workspace.derived.dirty && (
        <span title="Uncommitted changes" className="text-amber-400">
          •
        </span>
      )}
      {activity && (
        <span
          title={`Agent ${activity.state === 'attention' ? 'needs attention' : activity.state}: ${activity.summary}`}
          className={`shrink-0 ${activity.state === 'attention' ? 'text-amber-300' : activity.state === 'error' ? 'text-red-400' : activity.state === 'working' || activity.state === 'starting' ? 'animate-pulse text-sky-400' : 'text-neutral-600'}`}
        >
          <Bot size={11} />
        </span>
      )}
      {!editing && (
        <button
          title={`Rename workspace ${workspace.title}`}
          aria-label={`Rename workspace ${workspace.title}`}
          onClick={startRename}
          className="shrink-0 text-neutral-600 opacity-0 hover:text-emerald-300 group-hover:opacity-100 focus:opacity-100"
        >
          <Pencil size={11} />
        </button>
      )}
      <button
        title={`Close workspace ${workspace.title}`}
        aria-label={`Close workspace ${workspace.title}`}
        onClick={() => {
          clearEditor(workspace.id)
          void close(workspace.id)
        }}
        className="shrink-0 text-neutral-600 opacity-0 hover:text-red-400 group-hover:opacity-100 focus:opacity-100"
      >
        <X size={11} />
      </button>
    </div>
  )
}
