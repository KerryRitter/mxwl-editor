import { useEffect, useState } from 'react'
import { Check, Folder, Loader2, Plus, X } from 'lucide-react'
import { useProjectsStore } from '../store/projects'
import { useHostsStore } from '../store/hosts'
import { useWorkspacesStore } from '../store/workspaces'
import { useProjectNavigation } from '../store/projectNavigation'

export function NewWorkspaceModal({
  onClose,
  hideBrowserWs
}: {
  onClose: () => void
  hideBrowserWs?: string | null
}): JSX.Element {
  const hosts = useHostsStore((s) => s.hosts)
  const loadHosts = useHostsStore((s) => s.load)
  const preferredHostId = useWorkspacesStore((s) => s.newModalHostId)
  const preferredLocation = useWorkspacesStore((s) => s.newModalLocationId)
  const navigation = useProjectNavigation()
  const activeWorkspace = useWorkspacesStore((s) =>
    s.workspaces.find((w) => w.id === s.activeId)
  )
  const preferredProjectId = activeWorkspace?.projectId ?? navigation.projectId
  const preferredProjectHostId =
    preferredHostId ?? activeWorkspace?.hostId ?? navigation.hostId
  const { projects, locations, load: loadProjects } = useProjectsStore()
  const [projectId, setProjectId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [selectedHostId, setSelectedHostId] = useState('')
  const [browserProfileId, setBrowserProfileId] = useState('')
  const project = projects.find((p) => p.id === projectId)
  const projectLocations = locations.filter((l) => l.projectId === projectId)
  const hostChoices = hosts.filter((h) =>
    projectLocations.some((l) => l.hostId === h.id)
  )
  const choices = projectLocations.filter((l) => l.hostId === selectedHostId)
  const location = choices.find((l) => l.id === locationId)
  const hostId = location?.checkoutPath ? location.hostId : undefined
  const discovered = useWorkspacesStore((s) => s.discovered)
  const discovering = useWorkspacesStore((s) => s.discovering)
  const discoverError = useWorkspacesStore((s) => s.discoverError)
  const discover = useWorkspacesStore((s) => s.discover)
  const open = useWorkspacesStore((s) => s.open)
  const openMany = useWorkspacesStore((s) => s.openMany)
  const workspaces = useWorkspacesStore((s) => s.workspaces)

  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState('')

  useEffect(() => {
    void loadHosts()
    void loadProjects()
  }, [loadHosts, loadProjects])
  useEffect(() => {
    if (projectId && projects.some((p) => p.id === projectId)) return
    const preferred =
      locations.find((l) => l.id === preferredLocation) ??
      locations.find((l) => l.projectId === preferredProjectId) ??
      locations.find((l) => l.hostId === preferredProjectHostId)
    setProjectId(
      preferred?.projectId ?? preferredProjectId ?? projects[0]?.id ?? ''
    )
  }, [
    projects,
    locations,
    preferredLocation,
    preferredProjectId,
    preferredProjectHostId,
    projectId
  ])
  useEffect(() => {
    const matches = locations.filter((l) => l.projectId === projectId)
    setSelectedHostId((prev) =>
      matches.some((l) => l.hostId === prev)
        ? prev
        : (matches.find((l) => l.id === preferredLocation)?.hostId ??
          matches.find((l) => l.hostId === preferredProjectHostId)?.hostId ??
          matches[0]?.hostId ??
          '')
    )
  }, [projectId, locations, preferredLocation, preferredProjectHostId])
  useEffect(() => {
    const matches = locations.filter(
      (l) => l.projectId === projectId && l.hostId === selectedHostId
    )
    setLocationId((prev) =>
      matches.some((l) => l.id === prev)
        ? prev
        : (matches.find((l) => l.id === preferredLocation)?.id ??
          matches[0]?.id ??
          '')
    )
    setBrowserProfileId('')
    setSelected(new Set())
  }, [projectId, selectedHostId, locations, preferredLocation])

  useEffect(() => {
    if (hideBrowserWs) void window.api.browser.setVisible(hideBrowserWs, false)
    return () => {
      if (
        hideBrowserWs &&
        useWorkspacesStore.getState().activeId === hideBrowserWs
      )
        void window.api.browser.setVisible(hideBrowserWs, true)
    }
  }, [hideBrowserWs])

  useEffect(() => {
    if (hostId) {
      setSelected(new Set())
      void discover(hostId, locationId)
    }
  }, [hostId, locationId, discover])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const filtered = discovered.filter((d) =>
    d.name.toLowerCase().includes(filter.toLowerCase())
  )
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((e) => selected.has(e.path))

  function toggle(path: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function toggleAllFiltered(): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        for (const e of filtered) next.delete(e.path)
      } else {
        for (const e of filtered) next.add(e.path)
      }
      return next
    })
  }

  async function openOne(path: string): Promise<void> {
    if (!hostId || opening) return
    setOpening(true)
    try {
      await open(hostId, path, locationId, browserProfileId || undefined)
      onClose()
    } catch (error) {
      setOpenError(String(error))
    } finally {
      setOpening(false)
    }
  }

  async function openSelected(): Promise<void> {
    if (!hostId || selected.size === 0 || opening) return
    setOpening(true)
    try {
      await openMany(
        hostId,
        [...selected],
        locationId,
        browserProfileId || undefined
      )
      onClose()
    } catch (error) {
      setOpenError(String(error))
    } finally {
      setOpening(false)
    }
  }

  const alreadyOpen = (path: string): boolean => {
    const resolvedProfileId =
      browserProfileId ||
      location?.browserProfileId ||
      project?.defaultBrowserProfileId ||
      null
    return workspaces.some(
      (w) =>
        w.locationId === locationId &&
        w.remotePath === path &&
        w.browserProfileId === resolvedProfileId
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex h-[560px] w-[560px] flex-col rounded-xl border border-neutral-800 bg-neutral-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <h2 className="text-sm font-semibold">Open Workspace</h2>
          <button
            type="button"
            onClick={onClose}
            title="Close (Esc)"
            className="text-neutral-500 hover:text-neutral-200"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-neutral-800 px-4 py-2">
          <label className="grid gap-1 text-xs text-neutral-400">
            Project
            <select
              aria-label="Workspace project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs"
            >
              {!projects.length && (
                <option value="">Create a project first</option>
              )}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-neutral-400">
            Host
            <select
              aria-label="Workspace host"
              value={selectedHostId}
              onChange={(e) => setSelectedHostId(e.target.value)}
              className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs"
            >
              {!hostChoices.length && (
                <option value="">Add a host to this project</option>
              )}
              {hostChoices.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-neutral-400">
            Host checkout
            <select
              aria-label="Workspace location"
              value={locationId}
              onChange={(e) => {
                setLocationId(e.target.value)
                setBrowserProfileId('')
              }}
              className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs"
            >
              {!choices.length && (
                <option value="">Configure a project host</option>
              )}
              {choices.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-neutral-400">
            Browser profile
            <select
              aria-label="Workspace browser profile"
              value={browserProfileId}
              onChange={(e) => setBrowserProfileId(e.target.value)}
              className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs"
            >
              <option value="">Host / project default</option>
              {project?.browserProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <input
            placeholder="Filter folders…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="ml-auto w-48 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100 placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-2">
          {discovering && (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-neutral-500">
              <Loader2 size={16} className="animate-spin" /> Listing{' '}
              {location?.workspacesRoot ?? ''}…
            </div>
          )}
          {!discovering && discoverError && (
            <div className="p-4 text-sm text-red-400">{discoverError}</div>
          )}
          {!hostId && (
            <div className="p-4 text-xs text-neutral-400">
              {location && !location.checkoutPath
                ? 'Configure this host’s repository checkout path in Projects before opening workspaces.'
                : 'Create a project and configure its host in Projects before opening workspaces.'}
            </div>
          )}
          {!!hostId &&
            !discovering &&
            !discoverError &&
            filtered.length === 0 && (
              <div className="flex h-full items-center justify-center text-sm text-neutral-600">
                No folders found
              </div>
            )}
          {!discovering && !discoverError && filtered.length > 0 && (
            <button
              type="button"
              onClick={toggleAllFiltered}
              className="mb-1 flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-[11px] text-neutral-500 hover:bg-neutral-800/60 hover:text-neutral-300"
            >
              <Box checked={allFilteredSelected} />
              {allFilteredSelected ? 'Deselect all' : 'Select all'} (
              {filtered.length})
            </button>
          )}
          {!discovering &&
            !discoverError &&
            filtered.map((entry) => {
              const on = selected.has(entry.path)
              const opened = alreadyOpen(entry.path)
              return (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() => toggle(entry.path)}
                  onDoubleClick={() => void openOne(entry.path)}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-neutral-800 ${
                    on
                      ? 'bg-neutral-800/80 text-neutral-100'
                      : 'text-neutral-200'
                  }`}
                >
                  <Box checked={on} />
                  <Folder size={15} className="text-amber-400" />
                  <span className="truncate">{entry.name}</span>
                  {opened && (
                    <span className="ml-auto shrink-0 text-[10px] text-emerald-500">
                      open
                    </span>
                  )}
                </button>
              )
            })}
        </div>

        {openError && (
          <p role="alert" className="px-4 py-2 text-xs text-red-400">
            {openError}
          </p>
        )}
        <div className="flex items-center gap-2 border-t border-neutral-800 px-4 py-2">
          <span className="text-[11px] text-neutral-600">
            {selected.size === 0
              ? 'Select folders · double-click to open one'
              : `${selected.size} selected`}
          </span>
          <button
            type="button"
            disabled={selected.size === 0 || opening || !hostId}
            onClick={() => void openSelected()}
            className="ml-auto flex items-center gap-1.5 rounded-md bg-brand-accent px-3 py-1.5 text-xs font-medium text-brand-ink hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {opening ? <Loader2 size={13} className="animate-spin" /> : null}
            Open {selected.size > 0 ? selected.size : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

const Box = ({ checked }: { checked: boolean }): JSX.Element => (
  <span
    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
      checked
        ? 'border-emerald-500 bg-emerald-500 text-neutral-950'
        : 'border-neutral-600 bg-neutral-950'
    }`}
  >
    {checked ? <Check size={10} strokeWidth={3} /> : null}
  </span>
)

export function NewWorkspaceButton(): JSX.Element {
  const setNewModalOpen = useWorkspacesStore((s) => s.setNewModalOpen)
  return (
    <button
      onClick={() => setNewModalOpen(true)}
      title="Open workspace (⌘T)"
      className="flex items-center gap-1 rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
    >
      <Plus size={13} /> New
    </button>
  )
}
