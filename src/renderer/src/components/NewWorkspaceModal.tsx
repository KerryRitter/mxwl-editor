import { useEffect, useState } from 'react'
import { Folder, Loader2, Plus, X } from 'lucide-react'
import type { HostConfig } from '../../../shared/types'
import { useHostsStore } from '../store/hosts'
import { useWorkspacesStore } from '../store/workspaces'

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
  const [hostId, setHostId] = useState<string | null>(
    preferredHostId ?? hosts[0]?.id ?? null
  )
  const discovered = useWorkspacesStore((s) => s.discovered)
  const discovering = useWorkspacesStore((s) => s.discovering)
  const discoverError = useWorkspacesStore((s) => s.discoverError)
  const discover = useWorkspacesStore((s) => s.discover)
  const open = useWorkspacesStore((s) => s.open)

  const [filter, setFilter] = useState('')

  useEffect(() => {
    loadHosts()
  }, [loadHosts])

  useEffect(() => {
    if (preferredHostId) setHostId(preferredHostId)
  }, [preferredHostId])

  useEffect(() => {
    if (!hostId && hosts[0]) setHostId(hosts[0].id)
  }, [hosts, hostId])

  useEffect(() => {
    if (hideBrowserWs) void window.api.browser.setVisible(hideBrowserWs, false)
    return () => {
      if (hideBrowserWs) void window.api.browser.setVisible(hideBrowserWs, true)
    }
  }, [hideBrowserWs])

  useEffect(() => {
    if (hostId) discover(hostId)
  }, [hostId, discover])

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

  const selectedHost: HostConfig | undefined = hosts.find((h) => h.id === hostId)
  const filtered = discovered.filter((d) =>
    d.name.toLowerCase().includes(filter.toLowerCase())
  )

  async function pick(path: string): Promise<void> {
    if (!hostId) return
    await open(hostId, path)
    onClose()
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

        <div className="flex items-center gap-2 border-b border-neutral-800 px-4 py-2">
          <select
            value={hostId ?? ''}
            onChange={(e) => setHostId(e.target.value)}
            className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100 focus:border-emerald-500 focus:outline-none"
          >
            {hosts.length === 0 && <option value="">No hosts configured</option>}
            {hosts.map((h) => (
              <option key={h.id} value={h.id}>
                {h.kind === 'local'
                  ? `${h.label} (this machine)`
                  : `${h.label} (${h.username}@${h.host})`}
              </option>
            ))}
          </select>
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
              {selectedHost?.workspacesRoot ?? '~/Workspaces'}…
            </div>
          )}
          {!discovering && discoverError && (
            <div className="p-4 text-sm text-red-400">{discoverError}</div>
          )}
          {!discovering && !discoverError && filtered.length === 0 && (
            <div className="flex h-full items-center justify-center text-sm text-neutral-600">
              No folders found
            </div>
          )}
          {!discovering &&
            !discoverError &&
            filtered.map((entry) => (
              <button
                key={entry.path}
                onDoubleClick={() => pick(entry.path)}
                onClick={() => pick(entry.path)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800"
              >
                <Folder size={15} className="text-amber-400" />
                <span className="truncate">{entry.name}</span>
              </button>
            ))}
        </div>

        <div className="border-t border-neutral-800 px-4 py-2 text-[11px] text-neutral-600">
          Click a folder to open it in a new workspace tab.
        </div>
      </div>
    </div>
  )
}

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
