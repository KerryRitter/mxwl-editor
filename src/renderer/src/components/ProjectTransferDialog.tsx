import { useState } from 'react'
import { Download, FileJson, Upload } from 'lucide-react'
import type { ProjectSettingsBundle, ProjectSettingsImport } from '../../../shared/projectTransfer'
import { useProjectsStore } from '../store/projects'
import { useHostsStore } from '../store/hosts'
import { Modal } from './Modal'

const button =
  'rounded-md border border-neutral-700 px-3 py-2 text-xs text-neutral-300 hover:border-emerald-500 disabled:opacity-40'
const primary =
  'rounded-md bg-brand-accent px-3 py-2 text-xs font-medium text-brand-ink hover:bg-brand-hover disabled:opacity-40'

export function ProjectTransferDialog({
  projectId,
  onClose
}: {
  projectId: string | null
  onClose: () => void
}) {
  const { projects, locations, load } = useProjectsStore()
  const hosts = useHostsStore((s) => s.hosts)
  const [mode, setMode] = useState<'export' | 'import'>('export')
  const [selected, setSelected] = useState<string[]>(
    projectId ? [projectId] : projects.map((p) => p.id)
  )
  const [source, setSource] = useState<{ filename: string; bundle: ProjectSettingsBundle } | null>(
    null
  )
  const [importIds, setImportIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [imported, setImported] = useState<ProjectSettingsImport | null>(null)
  function toggle(id: string, ids: string[], set: (value: string[]) => void) {
    set(ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id])
  }
  async function act(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (error) {
      setError(String(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title="Share project and host settings"
      onClose={() => {
        if (!busy) onClose()
      }}
      width={680}
    >
      <p className="mb-4 text-xs leading-relaxed text-neutral-400">
        Share project preferences, machine connections, and checkout paths in a JSON file. SSH
        passwords, passphrases, private key contents, and test-login passwords are omitted. URLs,
        paths, and commands are included; review those before sharing.
      </p>
      <div
        role="tablist"
        aria-label="Settings transfer"
        className="mb-4 flex gap-2 border-b border-neutral-800 pb-3"
      >
        {(['export', 'import'] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={mode === value}
            disabled={busy}
            className={mode === value ? primary : button}
            onClick={() => {
              setMode(value)
              setError('')
            }}
          >
            {value === 'export' ? (
              <Download size={13} className="mr-2 inline" />
            ) : (
              <Upload size={13} className="mr-2 inline" />
            )}
            {value === 'export' ? 'Export' : 'Import'}
          </button>
        ))}
      </div>
      {mode === 'export' ? (
        <div role="tabpanel" aria-label="Export settings">
          <p className="mb-3 text-xs text-neutral-400">
            Choose the projects to share. Each includes its attached hosts and checkout settings.
          </p>
          {!projects.length && (
            <p className="mb-4 text-xs text-neutral-500">
              Create a project first, or use Import to load a shared setup.
            </p>
          )}
          <div className="mb-4 max-h-72 space-y-2 overflow-auto">
            {projects.map((project) => {
              const hostIds = new Set(
                locations.filter((l) => l.projectId === project.id).map((l) => l.hostId)
              )
              return (
                <label
                  key={project.id}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3"
                >
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={selected.includes(project.id)}
                    onChange={() => {
                      toggle(project.id, selected, setSelected)
                      setSaved('')
                    }}
                    aria-label={`Export ${project.label}`}
                    className="mt-0.5 accent-brand-accent"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm text-neutral-200">{project.label}</span>
                    <span className="mt-1 block text-xs text-neutral-500">
                      {hosts
                        .filter((h) => hostIds.has(h.id))
                        .map((h) => h.label)
                        .join(', ') || 'No configured hosts'}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
          {saved && (
            <p role="status" className="mb-3 break-all text-xs text-emerald-400">
              Settings saved to {saved}
            </p>
          )}
          <button
            className={primary}
            disabled={busy || !selected.length}
            onClick={() =>
              void act(async () => {
                setSaved('')
                const path = await window.api.project.exportSettings(selected)
                if (path) setSaved(path)
              })
            }
          >
            {busy
              ? 'Saving…'
              : `Export ${selected.length} ${selected.length === 1 ? 'project' : 'projects'}…`}
          </button>
        </div>
      ) : (
        <div role="tabpanel" aria-label="Import settings">
          <p className="mb-3 text-xs leading-relaxed text-neutral-400">
            Import creates new project copies. Matching machine connections are reused without
            changing their credentials. This machine maps to your computer. Check folder paths and
            add any missing passwords after importing.
          </p>
          <button
            className={button}
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const file = await window.api.project.readSettingsImport()
                if (file) {
                  setSource(file)
                  setImportIds(file.bundle.projects.map((p) => p.id))
                  setImported(null)
                }
              })
            }
          >
            <FileJson size={13} className="mr-2 inline" />
            {source ? 'Choose another file…' : 'Choose settings file…'}
          </button>
          {source && (
            <div className="mt-4">
              <p className="mb-2 break-all text-xs text-neutral-500">{source.filename}</p>
              <div className="max-h-72 space-y-2 overflow-auto">
                {source.bundle.projects.map((project) => (
                  <label
                    key={project.id}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3"
                  >
                    <input
                      type="checkbox"
                      disabled={busy || Boolean(imported)}
                      checked={importIds.includes(project.id)}
                      onChange={() => toggle(project.id, importIds, setImportIds)}
                      aria-label={`Import ${project.label}`}
                      className="mt-0.5 accent-brand-accent"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-neutral-200">
                        {project.label}
                        {projects.some((p) => p.label.toLowerCase() === project.label.toLowerCase())
                          ? ' · imported as a copy'
                          : ''}
                      </span>
                      {source.bundle.locations
                        .filter((l) => l.projectId === project.id)
                        .map((location) => {
                          const host = source.bundle.hosts.find((h) => h.id === location.hostId)!
                          return (
                            <span key={location.id} className="mt-2 block text-xs text-neutral-400">
                              <span className="block">
                                {location.builtinLocal ? 'This machine' : host.label}
                                {host.kind === 'ssh'
                                  ? ` · ${host.username}@${host.host}:${host.port}`
                                  : ''}
                              </span>
                              <span className="block break-all font-mono text-[11px] text-neutral-500">
                                {location.checkoutPath || 'Checkout not configured'} · workspaces:{' '}
                                {location.workspacesRoot}
                              </span>
                            </span>
                          )
                        })}
                    </span>
                  </label>
                ))}
              </div>
              {imported ? (
                <p role="status" className="mt-3 text-xs text-emerald-400">
                  Imported {imported.projectsAdded}{' '}
                  {imported.projectsAdded === 1 ? 'project' : 'projects'}, added{' '}
                  {imported.hostsAdded} connections, and reused {imported.hostsReused}.
                </p>
              ) : (
                <button
                  className={`${primary} mt-4`}
                  disabled={busy || !importIds.length}
                  onClick={() =>
                    void act(async () => {
                      const result = await window.api.project.importSettings(
                        source.bundle,
                        importIds
                      )
                      await load()
                      setImported(result)
                    })
                  }
                >
                  {busy
                    ? 'Importing…'
                    : `Import ${importIds.length} ${importIds.length === 1 ? 'project' : 'projects'}`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-xs text-red-400">
          {error}
        </p>
      )}
    </Modal>
  )
}
