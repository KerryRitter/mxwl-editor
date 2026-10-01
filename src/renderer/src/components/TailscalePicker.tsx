import { useEffect, useState, type FC } from 'react'
import { Network, RefreshCw, X } from 'lucide-react'
import type { HostConfig } from '../../../shared/types'
import type { TailscaleDevice, TailscaleDiscovery } from '../../../shared/tailscale'

export const TailscalePicker: FC<{
  hosts: HostConfig[]
  embedded?: boolean
  onSelect: (device: TailscaleDevice, username: string) => void
  onClose: () => void
}> = ({ hosts, embedded = false, onSelect, onClose }) => {
  const [snapshot, setSnapshot] = useState<TailscaleDiscovery | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const refresh = async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      setSnapshot(await window.api.host.discoverTailscale())
    } catch {
      setError('Could not discover Tailscale devices. Try refreshing.')
      setSnapshot(null)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void refresh()
  }, [])
  useEffect(() => {
    if (embedded) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [embedded, onClose])

  const search = query.trim().toLowerCase()
  const devices = (snapshot?.devices ?? []).filter((device) =>
    (showAll || device.sshAdvertised) &&
    `${device.name} ${device.dnsName} ${device.ips.join(' ')} ${device.tags.join(' ')}`.toLowerCase().includes(search)
  )

  const content = (
      <section
        role={embedded ? 'region' : 'dialog'}
        aria-modal={embedded ? undefined : true}
        aria-label="Tailscale devices"
        className={embedded
          ? 'flex flex-col rounded-lg border border-neutral-800 bg-neutral-950/40 p-3 text-neutral-100'
          : 'flex max-h-[85vh] w-[640px] flex-col rounded-xl border border-neutral-800 bg-neutral-900 p-5 text-neutral-100 shadow-2xl'}
      >
        <div className="mb-3 flex items-center gap-2">
          <Network size={18} className="text-sky-400" />
          <h2 className="text-sm font-semibold">Tailscale devices</h2>
          {!embedded && <button
            type="button"
            onClick={onClose}
            aria-label="Close Tailscale discovery"
            className="ml-auto text-neutral-500 hover:text-neutral-200"
          >
            <X size={16} />
          </button>}
        </div>
        <p className="mb-3 text-xs text-neutral-400">
          Discover machines from this computer’s Tailscale connection. Select one to configure its SSH username and workspace folder.
        </p>
        <div className="mb-3 flex gap-2">
          <input
            aria-label="Search Tailscale devices"
            placeholder="Search names, addresses, or tags…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs focus:border-sky-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md border border-neutral-700 px-3 text-xs disabled:opacity-40"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
        <label className="mb-3 flex items-center gap-2 text-xs text-neutral-400">
          <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />
          Show all devices (including ordinary SSH servers)
        </label>
        {snapshot?.tailnet && (
          <p className="mb-2 truncate text-[11px] text-neutral-500">
            {snapshot.tailnet} · {devices.length} devices
          </p>
        )}
        <div className={embedded ? 'max-h-64 overflow-auto' : 'min-h-0 overflow-auto'} aria-busy={loading}>
          {loading ? (
            <p role="status" className="py-6 text-center text-xs text-neutral-400">
              Reading Tailscale devices…
            </p>
          ) : error || snapshot?.message ? (
            <p role="status" className="rounded-md border border-amber-800/50 bg-amber-950/20 p-3 text-xs text-amber-200">
              {error || snapshot?.message}
            </p>
          ) : devices.length === 0 ? (
            <p role="status" className="py-6 text-center text-xs text-neutral-400">
              {search ? 'No devices match your search.' : showAll
                ? 'No other devices are visible in your tailnet.'
                : 'No devices advertise Tailscale SSH access. Enable Tailscale SSH and allow access in your tailnet policy, or show all devices for ordinary SSH.'}
            </p>
          ) : (
            <div className="grid gap-2">
              {devices.map((device) => {
                const configured = hosts.some((host) => host.kind === 'ssh' && (
                  device.ips.includes(host.host) || (device.dnsName &&
                    host.host.replace(/\.$/, '').toLowerCase() === device.dnsName.toLowerCase())
                ))
                return (
                  <button
                    type="button"
                    key={device.id}
                    disabled={configured}
                    onClick={() => onSelect(device, snapshot?.suggestedUsername ?? '')}
                    className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3 text-left hover:border-sky-700 disabled:cursor-default disabled:opacity-50"
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${device.online ? 'bg-emerald-400' : 'bg-neutral-600'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{device.name}</div>
                      <div className="truncate font-mono text-[11px] text-neutral-500">{device.dnsName || device.address} · {device.address}</div>
                      {device.tags.length > 0 && (
                        <div className="truncate text-[10px] text-neutral-500">{device.tags.join(' · ')}</div>
                      )}
                    </div>
                    <div className="shrink-0 text-right text-[10px] text-neutral-400">
                      <div>{configured ? 'Already configured' : device.sshAdvertised ? 'Tailscale SSH' : 'SSH access unknown'}</div>
                      <div className="text-neutral-500">{device.os} · {device.online ? 'Online' : 'Offline'}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <p className="mt-4 border-t border-neutral-800 pt-3 text-[10px] text-neutral-500">
          SSH availability is advertised by Tailscale. Login access depends on your chosen username
          and policy; check mode may require browser approval. Ordinary SSH devices require your
          usual key, agent, or password.
        </p>
      </section>
  )
  return embedded ? content : (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">{content}</div>
  )
}
