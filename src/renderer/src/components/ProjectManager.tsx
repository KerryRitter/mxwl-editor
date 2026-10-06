import { useEffect, useId, useState, type ReactNode } from 'react'
import {
  ChevronRight,
  FolderGit2,
  Monitor,
  Pencil,
  Plus,
  Server,
  Trash2
} from 'lucide-react'
import type {
  ProjectConfig,
  ProjectInput,
  ProjectLocation,
  ProjectLocationInput,
  PresetService
} from '../../../shared/types'
import { emptyProject } from '../../../shared/projects'
import { previewDerive } from '../../../shared/derive'
import { useProjectsStore } from '../store/projects'
import { useHostsStore } from '../store/hosts'
import { useWorkspacesStore } from '../store/workspaces'
import { usePluginsStore } from '../store/plugins'
import { ConnectionEditor, HostManager } from './HostManager'
import { useProjectNavigation } from '../store/projectNavigation'
import { Modal } from './Modal'

const inputClass =
  'w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-xs text-neutral-100 focus:border-emerald-500 focus:outline-none'
const buttonClass =
  'rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-emerald-500'
const primaryClass =
  'rounded-md bg-brand-accent px-3 py-1.5 text-xs font-medium text-brand-ink hover:bg-brand-hover disabled:opacity-40'
const projectSettingsTabs = [
  'General',
  'Browser',
  'Services',
  'Integrations',
  'Plugins'
] as const
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-xs text-neutral-400">
      <span>{label}</span>
      {children}
    </label>
  )
}
function Text({
  label,
  value,
  onChange,
  placeholder,
  type = 'text'
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <Field label={label}>
      <input
        type={type}
        className={inputClass}
        value={value}
        placeholder={placeholder}
        autoComplete={type === 'password' ? 'new-password' : 'off'}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  )
}

export function WorkspaceHome() {
  return <ProjectManager />
}

export function ProjectManager() {
  const {
    projects,
    locations,
    load,
    remove,
    removeLocation,
    error: loadError
  } = useProjectsStore()
  const { hosts, load: loadHosts } = useHostsStore()
  const open = useWorkspacesStore((s) => s.setNewModalOpen)
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const setActive = useWorkspacesStore((s) => s.setActive)
  const { projectId, hostId, select } = useProjectNavigation()
  const selectedProject = projects.find((p) => p.id === projectId)
  const selectedHost = hosts.find((h) => h.id === hostId)
  const projectLocations = locations.filter((l) => l.projectId === projectId)
  const projectHosts = [...new Set(projectLocations.map((l) => l.hostId))]
  const [connectionsOpen, setConnectionsOpen] = useState(false)
  const [connectionEditor, setConnectionEditor] = useState<
    (typeof hosts)[number] | null
  >(null)
  const [editing, setEditing] = useState<ProjectConfig | null | undefined>()
  const [locationEditor, setLocationEditor] = useState<{
    project: ProjectConfig
    location?: ProjectLocation
  } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    void load()
    void loadHosts()
  }, [load, loadHosts])
  useEffect(() => {
    if (projectId && !loadError && projects.length && !selectedProject)
      select(null)
    else if (
      selectedProject &&
      hostId &&
      !projectLocations.some((l) => l.hostId === hostId)
    )
      select(projectId)
  }, [
    projectId,
    hostId,
    projects,
    locations,
    selectedProject,
    loadError,
    select
  ])
  async function act(action: () => Promise<void>) {
    try {
      await action()
      setError('')
    } catch (e) {
      setError(String(e))
    }
  }
  return (
    <div className="workspace-home flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-neutral-800 px-5 py-3">
        <FolderGit2 size={18} className="text-emerald-400" />
        <h1 className="text-sm font-semibold">
          {selectedProject
            ? selectedHost && hostId
              ? 'Workspaces'
              : 'Hosts'
            : 'Projects'}
        </h1>
        <span className="text-xs text-neutral-500">
          {selectedProject
            ? `${selectedProject.label}${selectedHost && hostId ? ` · ${selectedHost.label}` : ' · choose a host'}`
            : 'Projects → Hosts → Workspaces'}
        </span>
        <button
          className={`${buttonClass} ml-auto`}
          onClick={() => setConnectionsOpen(true)}
        >
          Manage connections
        </button>
        <button
          className={primaryClass}
          onClick={() =>
            selectedProject
              ? setLocationEditor({ project: selectedProject })
              : setEditing(null)
          }
        >
          {selectedProject ? '+ Add host' : '+ Add project'}
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-5">
        {(error || loadError) && (
          <p role="alert" className="mb-3 text-xs text-red-400">
            {error || loadError}
          </p>
        )}
        {!selectedProject && projects.length === 0 && (
          <div className="workspace-home-intro mx-auto mt-8 max-w-lg text-center">
            <FolderGit2 size={32} className="mx-auto text-emerald-400" />
            <h2 className="mt-4 text-base font-medium">
              A home for your whole workflow.
            </h2>
            <p className="mt-2 text-sm text-neutral-500">
              Create a project in mxwl, add local, SSH, or Tailscale hosts
              beneath it, then open workspaces as tabs within a host. Your
              source files stay on those machines.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <button className={primaryClass} onClick={() => setEditing(null)}>
                Create your first project
              </button>
            </div>
          </div>
        )}
        <div className="grid gap-4">
          {!selectedProject &&
            projects.map((project) => (
              <section
                key={project.id}
                className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4"
              >
                <div className="flex items-center gap-3">
                  <FolderGit2 size={18} className="text-emerald-400" />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold">{project.label}</h2>
                    <p className="truncate text-xs text-neutral-500">
                      {project.repositoryUrl ||
                        'Project configuration saved in mxwl'}
                    </p>
                  </div>
                  <button
                    className={buttonClass}
                    onClick={() => select(project.id)}
                  >
                    Hosts ·{' '}
                    {
                      new Set(
                        locations
                          .filter((l) => l.projectId === project.id)
                          .map((l) => l.hostId)
                      ).size
                    }
                  </button>
                  <button
                    title={`Edit ${project.label}`}
                    className={buttonClass}
                    onClick={() => setEditing(project)}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    title={`Delete ${project.label}`}
                    className={buttonClass}
                    onClick={() => {
                      if (
                        confirm(
                          `Delete ${project.label} configuration? Source files are never deleted.`
                        )
                      )
                        void act(() => remove(project.id))
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <p className="mt-3 text-xs text-neutral-500">
                  {workspaces.filter((w) => w.projectId === project.id).length}{' '}
                  open workspace tabs
                </p>
              </section>
            ))}
          {selectedProject &&
            !hostId &&
            projectHosts.map((projectHostId) => {
              const hostLocations = projectLocations.filter(
                (l) => l.hostId === projectHostId
              )
              const host = hosts.find((h) => h.id === projectHostId)
              const tabs = workspaces.filter(
                (w) => w.projectId === projectId && w.hostId === projectHostId
              )
              return (
                <section
                  key={projectHostId}
                  className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4"
                >
                  <div className="flex items-center gap-3">
                    {host?.kind === 'local' ? (
                      <Monitor size={18} className="text-sky-400" />
                    ) : (
                      <Server size={18} className="text-emerald-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <h2 className="text-sm font-semibold">
                        {hostLocations.some((l) => l.builtinLocal)
                          ? 'This machine'
                          : host?.label || 'Host unavailable'}
                      </h2>
                      {hostLocations.some((l) => l.builtinLocal) && (
                        <span className="text-[10px] text-sky-400">
                          Always available
                        </span>
                      )}
                      <p className="text-xs text-neutral-500">
                        {host?.kind === 'local'
                          ? 'This machine'
                          : host
                            ? `${host.username}@${host.host}:${host.port}`
                            : 'Connection missing'}{' '}
                        · {tabs.length} open workspace tabs
                      </p>
                    </div>
                    <button
                      disabled={!host}
                      className={primaryClass}
                      onClick={() => select(projectId, projectHostId)}
                    >
                      Workspaces <ChevronRight size={12} className="inline" />
                    </button>
                    {host && (
                      <button
                        title={`Edit connection ${host.label}`}
                        className={buttonClass}
                        onClick={() => setConnectionEditor(host)}
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                  </div>
                  <div className="mt-3 grid gap-2">
                    {hostLocations.map((location) => {
                      const host = hosts.find((h) => h.id === location.hostId)
                      return (
                        <div
                          key={location.id}
                          className="flex items-center gap-3 rounded-lg border border-neutral-800 px-3 py-2"
                        >
                          {host?.kind === 'local' ? (
                            <Monitor size={14} className="text-sky-400" />
                          ) : (
                            <Server size={14} className="text-neutral-500" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs">
                              {location.label}{' '}
                              <span className="text-neutral-500">
                                · {host?.label || 'Host unavailable'}
                              </span>
                            </p>
                            <p className="truncate font-mono text-[10px] text-neutral-500">
                              {location.checkoutPath ||
                                'Choose a repository checkout path to get started'}
                            </p>
                          </div>
                          <button
                            title={`Edit host checkout ${location.label}`}
                            className={buttonClass}
                            onClick={() =>
                              setLocationEditor({
                                project: selectedProject,
                                location
                              })
                            }
                          >
                            {location.checkoutPath ? (
                              <Pencil size={13} />
                            ) : (
                              'Configure checkout'
                            )}
                          </button>
                          {!location.builtinLocal && (
                            <button
                              title={`Remove host checkout ${location.label}`}
                              className={buttonClass}
                              onClick={() => {
                                if (
                                  confirm(
                                    'Remove this project host checkout? Files are never deleted.'
                                  )
                                )
                                  void act(() => removeLocation(location.id))
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          {selectedProject && !projectHosts.length && (
            <div className="py-12 text-center text-sm text-neutral-500">
              This project is saved. Add a host to choose where its workspaces
              live.
            </div>
          )}
          {selectedProject &&
            hostId &&
            projectLocations
              .filter((l) => l.hostId === hostId)
              .map((location) => (
                <section
                  key={location.id}
                  className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-sm font-semibold">
                        {location.label}
                      </h2>
                      <p className="truncate font-mono text-xs text-neutral-500">
                        {location.checkoutPath ||
                          'Choose a repository checkout path to get started'}
                      </p>
                    </div>
                    <button
                      className={buttonClass}
                      title={`Edit host checkout ${location.label}`}
                      onClick={() =>
                        setLocationEditor({
                          project: selectedProject,
                          location
                        })
                      }
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      className={primaryClass}
                      onClick={() =>
                        location.checkoutPath
                          ? open(true, hostId, location.id)
                          : setLocationEditor({
                              project: selectedProject,
                              location
                            })
                      }
                    >
                      {location.checkoutPath
                        ? 'Open workspaces'
                        : 'Configure checkout'}
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-neutral-500">
                    Each workspace opens as a tab above. Other projects and
                    hosts keep running when you switch.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {workspaces
                      .filter((w) => w.locationId === location.id)
                      .map((w) => (
                        <button
                          key={w.id}
                          className={buttonClass}
                          onClick={() => {
                            setActive(w.id)
                            void window.api.browser.activate(w.id)
                          }}
                        >
                          {w.title}
                        </button>
                      ))}
                  </div>
                </section>
              ))}
        </div>
      </div>
      {editing !== undefined && (
        <ProjectEditor
          project={editing}
          onClose={() => setEditing(undefined)}
          onSaved={(saved) => {
            setEditing(undefined)
            select(saved.id)
          }}
        />
      )}
      {locationEditor && (
        <LocationEditor
          {...locationEditor}
          onClose={() => setLocationEditor(null)}
          onSaved={(saved) => {
            select(saved.projectId, saved.hostId)
            setLocationEditor(null)
          }}
        />
      )}
      {connectionsOpen && (
        <Modal
          title="Reusable machine connections"
          width={900}
          onClose={() => setConnectionsOpen(false)}
        >
          <p className="mb-3 text-xs text-neutral-500">
            Save connection details once, then attach the machine beneath any
            project. Workspaces are opened from the project's hosts.
          </p>
          <div className="h-[60vh]">
            <HostManager />
          </div>
        </Modal>
      )}
      {connectionEditor && (
        <ConnectionEditor
          initial={connectionEditor}
          onClose={() => setConnectionEditor(null)}
          onSaved={() => setConnectionEditor(null)}
        />
      )}
    </div>
  )
}

function projectInput(project: ProjectConfig | null): ProjectInput {
  if (!project) return emptyProject()
  return {
    ...project,
    browserProfiles: project.browserProfiles.map((p) => ({
      ...p,
      testLogin: p.testLogin
        ? {
            username: p.testLogin.username,
            usernameSelector: p.testLogin.usernameSelector,
            passwordSelector: p.testLogin.passwordSelector,
            submitSelector: p.testLogin.submitSelector
          }
        : undefined
    }))
  }
}

function ProjectEditor({
  project,
  onClose,
  onSaved
}: {
  project: ProjectConfig | null
  onClose: () => void
  onSaved: (project: ProjectConfig) => void
}) {
  const [form, setForm] = useState(() => projectInput(project))
  const [tab, setTab] = useState('General')
  const tabsId = useId()
  const [previewName, setPreviewName] = useState('myapp-PROJ-42')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const save = useProjectsStore((s) => s.save)
  const catalog = usePluginsStore((s) => s.catalog)
  const set = <K extends keyof ProjectInput>(key: K, value: ProjectInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))
  const preview = previewDerive(previewName, form.derive)
  const profile = (
    id: string,
    patch: Partial<ProjectInput['browserProfiles'][number]>
  ) =>
    set(
      'browserProfiles',
      form.browserProfiles.map((p) => (p.id === id ? { ...p, ...patch } : p))
    )
  async function submit() {
    setBusy(true)
    try {
      onSaved(await save(form))
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title={project ? `Edit Project · ${project.label}` : 'Add Project'}
      onClose={onClose}
      width={720}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div
          className="mb-4 flex gap-5 overflow-x-auto border-b border-neutral-800"
          role="tablist"
          aria-label="Project settings"
        >
          {projectSettingsTabs.map((name, index) => (
            <button
              role="tab"
              id={`${tabsId}-${name}`}
              aria-controls={`${tabsId}-panel`}
              aria-selected={tab === name}
              tabIndex={tab === name ? 0 : -1}
              key={name}
              type="button"
              className={`-mb-px shrink-0 border-b-2 px-1 pb-2.5 pt-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-400 ${tab === name ? 'border-emerald-400 text-emerald-300' : 'border-transparent text-neutral-500 hover:border-neutral-600 hover:text-neutral-200'}`}
              onClick={() => setTab(name)}
              onKeyDown={(event) => {
                let next = index
                if (event.key === 'ArrowRight')
                  next = (index + 1) % projectSettingsTabs.length
                else if (event.key === 'ArrowLeft')
                  next =
                    (index + projectSettingsTabs.length - 1) %
                    projectSettingsTabs.length
                else if (event.key === 'Home') next = 0
                else if (event.key === 'End')
                  next = projectSettingsTabs.length - 1
                else return
                event.preventDefault()
                setTab(projectSettingsTabs[next])
                event.currentTarget.parentElement
                  ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                  [next]?.focus()
              }}
            >
              {name}
            </button>
          ))}
        </div>
        <div
          className="grid max-h-[60vh] gap-3 overflow-auto pr-1"
          role="tabpanel"
          id={`${tabsId}-panel`}
          aria-labelledby={`${tabsId}-${tab}`}
        >
          {tab === 'General' && (
            <>
              <Text
                label="Project name"
                value={form.label}
                onChange={(v) => set('label', v)}
                placeholder="Example App"
              />
              <Text
                label="Repository URL (optional)"
                value={form.repositoryUrl}
                onChange={(v) => set('repositoryUrl', v)}
                placeholder="git@github.com:team/app.git"
              />
              <p className="mt-2 text-xs text-neutral-500">
                Folder → workspace mapping. Shared by this project's hosts.
              </p>
              <Text
                label="Folder pattern (named-group regex)"
                value={form.derive.folderPattern}
                onChange={(v) =>
                  set('derive', { ...form.derive, folderPattern: v })
                }
              />
              <div className="grid grid-cols-2 gap-3">
                <Text
                  label="Workspace title template"
                  value={form.derive.titleTemplate}
                  onChange={(v) =>
                    set('derive', { ...form.derive, titleTemplate: v })
                  }
                />
                <Text
                  label="Issue key template"
                  value={form.derive.issueKeyTemplate ?? ''}
                  onChange={(v) =>
                    set('derive', { ...form.derive, issueKeyTemplate: v })
                  }
                />
              </div>
              <Text
                label="Preview URL template (optional)"
                value={form.derive.browserUrlTemplate}
                onChange={(v) =>
                  set('derive', { ...form.derive, browserUrlTemplate: v })
                }
                placeholder="https://preview.example.com/${ticket}"
              />
              <Text
                label="Try a folder name"
                value={previewName}
                onChange={setPreviewName}
              />
              <p
                className={`text-xs ${preview.ok ? 'text-emerald-400' : 'text-amber-400'}`}
              >
                {preview.ok
                  ? `${preview.title} → ${preview.browserUrl || 'profile URL'}`
                  : 'No match / invalid regex'}
              </p>
              <Text
                label="Hide in file tree (comma-separated)"
                value={form.hide.join(', ')}
                onChange={(v) =>
                  set(
                    'hide',
                    v
                      .split(',')
                      .map((x) => x.trim())
                      .filter(Boolean)
                  )
                }
              />
              <Text
                label="Terminal startup command (optional)"
                value={form.terminalStartup}
                onChange={(v) => set('terminalStartup', v)}
              />
              <Text
                label="AI workspace folder template"
                value={form.ai.workspaceFolderTemplate}
                onChange={(v) =>
                  set('ai', { ...form.ai, workspaceFolderTemplate: v })
                }
              />
              <Text
                label="AI branch initialization command (optional)"
                value={form.ai.initBranchCommand}
                onChange={(v) =>
                  set('ai', { ...form.ai, initBranchCommand: v })
                }
              />
            </>
          )}
          {tab === 'Browser' && (
            <>
              <p className="text-xs text-neutral-500">
                Named environments/accounts, with isolated cookie jars per
                profile and working folder. Passwords stay encrypted on this
                machine.
              </p>
              <Field label="Default browser profile">
                <select
                  className={inputClass}
                  value={form.defaultBrowserProfileId ?? ''}
                  onChange={(e) =>
                    set('defaultBrowserProfileId', e.target.value || null)
                  }
                >
                  <option value="">None</option>
                  {form.browserProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>
              {form.browserProfiles.map((p) => (
                <section
                  key={p.id}
                  className="grid gap-2 rounded-lg border border-neutral-800 p-3"
                >
                  <Text
                    label="Profile name"
                    value={p.label}
                    onChange={(v) => profile(p.id, { label: v })}
                  />
                  <Text
                    label="Browser URL"
                    value={p.url}
                    onChange={(v) => profile(p.id, { url: v })}
                    placeholder="http://localhost:3000"
                  />
                  <label className="flex gap-2 text-xs text-neutral-400">
                    <input
                      type="checkbox"
                      checked={Boolean(p.testLogin)}
                      onChange={(e) =>
                        profile(p.id, {
                          testLogin: e.target.checked
                            ? {
                                username: '',
                                usernameSelector: '',
                                passwordSelector: '',
                                submitSelector: ''
                              }
                            : null
                        })
                      }
                    />
                    Login as test user
                  </label>
                  {p.testLogin && (
                    <>
                      {(
                        [
                          'username',
                          'password',
                          'usernameSelector',
                          'passwordSelector',
                          'submitSelector'
                        ] as const
                      ).map((key) => (
                        <Text
                          key={key}
                          label={
                            key === 'password'
                              ? 'Test password (blank keeps existing)'
                              : `Test ${key}`
                          }
                          type={key === 'password' ? 'password' : 'text'}
                          value={p.testLogin?.[key] ?? ''}
                          onChange={(v) =>
                            profile(p.id, {
                              testLogin: { ...p.testLogin!, [key]: v }
                            })
                          }
                        />
                      ))}
                    </>
                  )}
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => {
                      set(
                        'browserProfiles',
                        form.browserProfiles.filter((x) => x.id !== p.id)
                      )
                      if (form.defaultBrowserProfileId === p.id)
                        set('defaultBrowserProfileId', null)
                    }}
                  >
                    Remove profile
                  </button>
                </section>
              ))}
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  const id = crypto.randomUUID()
                  set('browserProfiles', [
                    ...form.browserProfiles,
                    { id, label: 'Local QA', url: '' }
                  ])
                  if (!form.defaultBrowserProfileId)
                    set('defaultBrowserProfileId', id)
                }}
              >
                + Add browser profile
              </button>
            </>
          )}
          {tab === 'Services' && (
            <>
              <p className="text-xs text-neutral-500">
                Commands run from the app subdirectory configured on each
                project host. Optional service directories support monorepos.
              </p>
              <ServiceEditor
                services={form.services}
                onChange={(v) => set('services', v)}
              />
            </>
          )}
          {tab === 'Integrations' && (
            <>
              <p className="text-xs text-neutral-500">
                Account credentials live in mxwl Settings → Accounts. Choose
                this project’s tracker and repository here.
              </p>
              <Field label="Task provider">
                <select
                  className={inputClass}
                  value={form.integrations.taskProvider}
                  onChange={(e) =>
                    set('integrations', {
                      ...form.integrations,
                      taskProvider: e.target
                        .value as ProjectInput['integrations']['taskProvider']
                    })
                  }
                >
                  {['none', 'jira', 'linear', 'github-issues'].map((p) => (
                    <option key={p} value={p}>{({ none: 'None', jira: 'Jira', linear: 'Linear', 'github-issues': 'GitHub Issues' } as Record<string, string>)[p]}</option>
                  ))}
                </select>
              </Field>
              <Text
                label="Task project / team key"
                value={form.integrations.taskProject}
                onChange={(v) =>
                  set('integrations', { ...form.integrations, taskProject: v })
                }
              />
              <Field label="Source control provider">
                <select
                  className={inputClass}
                  value={form.integrations.scmProvider}
                  onChange={(e) =>
                    set('integrations', {
                      ...form.integrations,
                      scmProvider: e.target
                        .value as ProjectInput['integrations']['scmProvider']
                    })
                  }
                >
                  {['none', 'bitbucket', 'github', 'gitlab'].map((p) => (
                    <option key={p} value={p}>{({ none: 'None', bitbucket: 'Bitbucket', github: 'GitHub', gitlab: 'GitLab' } as Record<string, string>)[p]}</option>
                  ))}
                </select>
              </Field>
              <Text
                label="Repository workspace / owner"
                value={form.integrations.repositoryWorkspace}
                onChange={(v) =>
                  set('integrations', {
                    ...form.integrations,
                    repositoryWorkspace: v
                  })
                }
              />
              <Text
                label="Repository slug"
                value={form.integrations.repositorySlug}
                onChange={(v) =>
                  set('integrations', {
                    ...form.integrations,
                    repositorySlug: v
                  })
                }
              />
              <p className="text-[11px] text-neutral-500">
                GitHub, Jira, and Bitbucket have built-in API cards. GitLab uses
                Git remote PR links; other tracker adapters can be plugins.
                GitHub can infer the repository from the project URL or checkout’s
                origin remote when both repository fields are blank.
              </p>
            </>
          )}
          {tab === 'Plugins' && (
            <>
              <p className="text-xs text-neutral-500">
                Disable tools for this project. Globally disabled or unapproved
                plugins cannot be enabled here.
              </p>
              {catalog
                .filter((p) => !('error' in p))
                .map((p) => (
                  <Field key={p.id} label={p.name}>
                    <select
                      className={inputClass}
                      value={form.plugins[p.id] === false ? 'off' : 'inherit'}
                      onChange={(e) => {
                        const plugins = { ...form.plugins }
                        if (e.target.value === 'off') plugins[p.id] = false
                        else delete plugins[p.id]
                        set('plugins', plugins)
                      }}
                    >
                      <option value="inherit">
                        Use global setting ({p.enabled ? 'enabled' : 'disabled'}
                        )
                      </option>
                      <option value="off">Disabled for this project</option>
                    </select>
                  </Field>
                ))}
            </>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-3 text-xs text-red-400">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={buttonClass} onClick={onClose}>
            Cancel
          </button>
          <button
            disabled={busy || !form.label.trim()}
            className={primaryClass}
            type="submit"
          >
            {busy ? 'Saving…' : 'Save project'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function LocationEditor({
  project,
  location,
  onClose,
  onSaved
}: {
  project: ProjectConfig
  location?: ProjectLocation
  onClose: () => void
  onSaved: (location: ProjectLocation) => void
}) {
  const hosts = useHostsStore((s) => s.hosts)
  const currentProject =
    useProjectsStore((s) => s.projects.find((p) => p.id === project.id)) ??
    project
  const save = useProjectsStore((s) => s.saveLocation)
  const [form, setForm] = useState<ProjectLocationInput>(
    () =>
      location ?? {
        projectId: project.id,
        hostId: hosts[0]?.id ?? '',
        label: '',
        checkoutPath: '',
        workspacesRoot: '~/Workspaces',
        folderFilter: '',
        appSubdirectory: '',
        browserProfileId: null,
        overrides: {}
      }
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [addingConnection, setAddingConnection] = useState(false)
  const [addingProfile, setAddingProfile] = useState(false)
  const set = <K extends keyof ProjectLocationInput>(
    key: K,
    value: ProjectLocationInput[K]
  ) => setForm((f) => ({ ...f, [key]: value }))
  const override = (patch: ProjectLocationInput['overrides']) =>
    set('overrides', { ...form.overrides, ...patch })
  async function submit() {
    setBusy(true)
    try {
      onSaved(
        await save({
          ...form,
          label:
            form.label.trim() ||
            hosts.find((h) => h.id === form.hostId)?.label ||
            'Development'
        })
      )
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }
  if (addingConnection)
    return (
      <ConnectionEditor
        onClose={() => setAddingConnection(false)}
        onSaved={(host) => {
          set('hostId', host.id)
          setAddingConnection(false)
        }}
      />
    )
  if (addingProfile)
    return (
      <NewBrowserProfile
        project={currentProject}
        onClose={() => setAddingProfile(false)}
        onSaved={(id) => {
          set('browserProfileId', id)
          setAddingProfile(false)
        }}
      />
    )
  return (
    <Modal
      title={`${location ? 'Edit' : 'Add'} Project Host · ${project.label}`}
      width={640}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="grid max-h-[62vh] gap-3 overflow-auto pr-1">
          <Field label="Machine connection">
            <div className="flex items-center gap-2">
              <select
                aria-label="Machine connection"
                className={inputClass}
                disabled={location?.builtinLocal}
                value={form.hostId}
                onChange={(e) => set('hostId', e.target.value)}
              >
                {hosts.length === 0 && (
                  <option value="">Create a connection</option>
                )}
                {hosts.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.label}
                  </option>
                ))}
              </select>
              {!location?.builtinLocal && (
                <button
                  type="button"
                  aria-label="New machine connection"
                  className={`${buttonClass} shrink-0`}
                  onClick={() => setAddingConnection(true)}
                >
                  <Plus size={12} className="mr-1 inline" />
                  New
                </button>
              )}
            </div>
          </Field>
          {location?.builtinLocal && (
            <p className="text-xs text-sky-400">
              This machine is always available for this project and cannot be
              removed.
            </p>
          )}
          <Text
            label="Repository checkout path"
            value={form.checkoutPath}
            onChange={(v) => set('checkoutPath', v)}
            placeholder="~/Workspaces/myapp"
          />
          <Text
            label="Worktrees / workspaces root"
            value={form.workspacesRoot}
            onChange={(v) => set('workspacesRoot', v)}
            placeholder="~/Workspaces"
          />
          <Text
            label="Folder filter (optional glob or /regex/)"
            value={form.folderFilter}
            onChange={(v) => set('folderFilter', v)}
            placeholder="myapp-*"
          />
          <Text
            label="App subdirectory (optional, relative)"
            value={form.appSubdirectory}
            onChange={(v) => set('appSubdirectory', v)}
            placeholder="apps/web"
          />
          <Field label="Browser profile">
            <div className="flex items-center gap-2">
              <select
                aria-label="Browser profile"
                className={inputClass}
                value={form.browserProfileId ?? ''}
                onChange={(e) =>
                  set('browserProfileId', e.target.value || null)
                }
              >
                <option value="">Project default</option>
                {currentProject.browserProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label="New browser profile"
                className={`${buttonClass} shrink-0`}
                onClick={() => setAddingProfile(true)}
              >
                <Plus size={12} className="mr-1 inline" />
                New
              </button>
            </div>
          </Field>
          <p className="text-xs text-neutral-500">
            Profiles are named environments/accounts with their own URL and
            isolated browser cookies. Manage them in Project settings → Browser.
          </p>
          <Text
            label="Checkout label (optional)"
            value={form.label}
            onChange={(v) => set('label', v)}
            placeholder="Defaults to the machine name"
          />
          <p className="text-xs text-neutral-500">
            A display label only, useful for multiple checkouts on one machine
            (e.g. Main or Staging).
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            Machine-specific overrides (blank inherits project settings)
          </p>
          <Text
            label="Browser URL override"
            value={form.overrides.browserUrl ?? ''}
            onChange={(v) => override({ browserUrl: v || undefined })}
          />
          <Text
            label="Terminal startup override"
            value={form.overrides.terminalStartup ?? ''}
            onChange={(v) => override({ terminalStartup: v || undefined })}
          />
          <label className="flex gap-2 text-xs text-neutral-400">
            <input
              type="checkbox"
              checked={form.overrides.services !== undefined}
              onChange={(e) =>
                override({
                  services: e.target.checked
                    ? structuredClone(currentProject.services)
                    : undefined
                })
              }
            />
            Override service commands on this machine
          </label>
          {form.overrides.services && (
            <ServiceEditor
              services={form.overrides.services}
              onChange={(v) => override({ services: v })}
            />
          )}
        </div>
        {error && (
          <p role="alert" className="mt-3 text-xs text-red-400">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={buttonClass} onClick={onClose}>
            Cancel
          </button>
          <button
            className={primaryClass}
            type="submit"
            disabled={busy || !form.hostId || !form.checkoutPath.trim()}
          >
            Save project host
          </button>
        </div>
      </form>
    </Modal>
  )
}

function NewBrowserProfile({
  project,
  onClose,
  onSaved
}: {
  project: ProjectConfig
  onClose: () => void
  onSaved: (id: string) => void
}) {
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const save = useProjectsStore((s) => s.save)
  async function submit() {
    setBusy(true)
    try {
      // Read the latest project so adding a profile does not overwrite other edits.
      const latest = useProjectsStore
        .getState()
        .projects.find((p) => p.id === project.id)
      if (!latest) throw new Error('Project not found')
      const input = projectInput(latest)
      const id = crypto.randomUUID()
      await save({
        ...input,
        browserProfiles: [
          ...input.browserProfiles,
          { id, label: label.trim(), url: url.trim() }
        ]
      })
      onSaved(id)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title={`New Browser Profile · ${project.label}`}
      width={480}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="grid gap-3">
          <p className="text-xs text-neutral-500">
            Create a named environment or account with its own URL and isolated
            browser cookies. Test-login credentials can be added in Project
            settings → Browser.
          </p>
          <Text
            label="Profile name"
            value={label}
            onChange={setLabel}
            placeholder="Local QA or Staging"
          />
          <Text
            label="Browser URL"
            value={url}
            onChange={setUrl}
            placeholder="http://localhost:3000 (optional)"
          />
        </div>
        {error && (
          <p role="alert" className="mt-3 text-xs text-red-400">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={buttonClass} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className={primaryClass}
            disabled={busy || !label.trim()}
          >
            {busy ? 'Saving…' : 'Create profile'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ServiceEditor({
  services,
  onChange
}: {
  services: PresetService[]
  onChange: (services: PresetService[]) => void
}) {
  const patch = (index: number, key: keyof PresetService, value: string) =>
    onChange(services.map((s, i) => (i === index ? { ...s, [key]: value } : s)))
  return (
    <div className="grid gap-3">
      {services.map((service, i) => (
        <section
          key={i}
          className="grid gap-2 rounded-lg border border-neutral-800 p-3"
        >
          {(
            ['id', 'label', 'cwd', 'start', 'stop', 'restart', 'logs'] as const
          ).map((key) => (
            <Text
              key={key}
              label={`Service ${key}`}
              value={service[key] ?? ''}
              onChange={(v) => patch(i, key, v)}
            />
          ))}
          <button
            type="button"
            className={buttonClass}
            onClick={() => onChange(services.filter((_, index) => index !== i))}
          >
            Remove service
          </button>
        </section>
      ))}
      <button
        type="button"
        className={buttonClass}
        onClick={() =>
          onChange([
            ...services,
            {
              id: crypto.randomUUID(),
              label: 'Web',
              start: '',
              stop: '',
              restart: '',
              logs: ''
            }
          ])
        }
      >
        <Plus size={12} className="mr-1 inline" />
        Add service
      </button>
    </div>
  )
}
