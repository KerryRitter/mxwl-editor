import { useEffect, useState } from 'react'
import { Check, ChevronDown, FolderGit2, Loader2, Server } from 'lucide-react'
import { useHostsStore } from '../store/hosts'
import { useProjectsStore } from '../store/projects'
import { useProjectNavigation } from '../store/projectNavigation'
import { useWorkspacesStore } from '../store/workspaces'
import { Modal } from './Modal'

export function HostWorkspaceSwitcher({ projectId, hostId, label, inHeader = false }: {
  projectId: string | null
  hostId: string
  label: string
  inHeader?: boolean
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const hosts = useHostsStore((s) => s.hosts)
  const locations = useProjectsStore((s) => s.locations)
  const projects = useProjectsStore((s) => s.projects)
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const activeId = useWorkspacesStore((s) => s.activeId)
  const setActive = useWorkspacesStore((s) => s.setActive)
  const select = useProjectNavigation((s) => s.select)
  const setNewModalOpen = useWorkspacesStore((s) => s.setNewModalOpen)
  const projectHosts = hosts.filter((host) => host.id === hostId ||
    locations.some((l) => l.projectId === projectId && l.hostId === host.id))

  useEffect(() => {
    if (!open || !activeId) return
    void window.api.browser.setVisible(activeId, false)
    return () => {
      const current = useWorkspacesStore.getState()
      if (current.activeId && !current.newModalOpen) void window.api.browser.activate(current.activeId)
    }
  }, [open, activeId])

  function focus(host: string, workspaceId: string | null): void {
    select(projectId, host)
    setActive(workspaceId)
    setOpen(false)
    if (workspaceId) void window.api.browser.activate(workspaceId)
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        title="Switch host workspace"
        aria-label={inHeader ? `Switch host workspace from ${label}` : undefined}
        aria-haspopup="dialog" aria-expanded={open}
        className="flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200">
        <Server size={12} />{label}<ChevronDown size={10} />
      </button>
      {open && (
        <Modal title="Switch host workspace" onClose={() => setOpen(false)} width={460}>
          <p className="mb-3 text-xs text-neutral-500">
            {projects.find((project) => project.id === projectId)?.label || 'Unassigned'}
          </p>
          <div className="space-y-2" aria-label="Project hosts and workspaces">
            {projectHosts.map((host) => {
              const children = workspaces.filter((w) => w.projectId === projectId && w.hostId === host.id)
              const location = locations.find((l) => l.projectId === projectId && l.hostId === host.id && l.checkoutPath)
              return (
                <details key={host.id} open className="rounded border border-neutral-800">
                  <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs text-neutral-300">
                    <ChevronDown size={12} /><Server size={13} />{host.label}
                    <span className="ml-auto text-neutral-500">{children.length}</span>
                  </summary>
                  <div className="ml-5 space-y-1 border-l border-neutral-800 pb-2 pl-2 pr-2">
                    {children.map((workspace) => (
                      <button key={workspace.id} type="button"
                        aria-label={`Switch to ${workspace.title} on ${host.label}`}
                        onClick={() => focus(host.id, workspace.id)}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-neutral-300 hover:bg-neutral-800">
                        {workspace.terminal.sessions.some((s) => s.busy)
                          ? <Loader2 size={12} className="animate-spin text-sky-400" />
                          : <FolderGit2 size={12} className="text-emerald-400" />}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{workspace.title}</span>
                          <span className="block truncate text-[10px] text-neutral-600">{workspace.remotePath}</span>
                        </span>
                        {workspace.id === activeId && <Check size={12} className="text-emerald-400" />}
                      </button>
                    ))}
                    {!children.length && <p className="px-2 py-1 text-[11px] text-neutral-600">No open workspaces</p>}
                    <button type="button" onClick={() => focus(host.id, null)}
                      className="block w-full rounded px-2 py-1 text-left text-[11px] text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200">
                      Browse workspaces on {host.label}
                    </button>
                    <button type="button" disabled={!location} onClick={() => {
                      setOpen(false)
                      setNewModalOpen(true, host.id, location?.id)
                    }} className="block w-full rounded px-2 py-1 text-left text-[11px] text-emerald-400 hover:bg-neutral-800 disabled:text-neutral-600">
                      Open workspace on {host.label}…
                    </button>
                  </div>
                </details>
              )
            })}
          </div>
        </Modal>
      )}
    </>
  )
}
