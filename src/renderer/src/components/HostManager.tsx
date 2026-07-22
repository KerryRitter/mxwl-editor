import { useEffect, useMemo, useState, type FC, type ReactNode } from 'react'
import {
  CheckCircle2,
  Copy,
  Monitor,
  Pencil,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  XCircle,
  X
} from 'lucide-react'
import { previewDerive } from '../../../shared/derive'
import { DEFAULT_DERIVE, DEFAULT_HIDE } from '../../../shared/hostDefaults'
import type {
  AuthConfig,
  DeriveConfig,
  HostConfig,
  HostInput,
  HostKind,
  PresetService
} from '../../../shared/types'
import { useHostsStore } from '../store/hosts'
import { useWorkspacesStore } from '../store/workspaces'

type AuthKind = AuthConfig['kind']

type HostFormState = {
  kind: HostKind
  label: string
  host: string
  port: number
  username: string
  workspacesRoot: string
  folderFilter: string
  derive: DeriveConfig
  services: PresetService[]
  hide: string
  authKind: AuthKind
  keyPath: string
  passphrase: string
  password: string
  previewFolder: string
  terminalStartup: string
  testUser: string
  testPass: string
  testUserSel: string
  testPassSel: string
  testSubmitSel: string
  testPassConfigured: boolean
}

const emptyForm = (): HostFormState => ({
  kind: 'ssh',
  label: '',
  host: '',
  port: 22,
  username: '',
  workspacesRoot: '~/Workspaces',
  folderFilter: '',
  derive: { ...DEFAULT_DERIVE },
  services: [],
  hide: DEFAULT_HIDE.join(', '),
  authKind: 'agent',
  keyPath: '',
  passphrase: '',
  password: '',
  previewFolder: 'myapp-PROJ-42',
  terminalStartup: '',
  testUser: '',
  testPass: '',
  testUserSel: '',
  testPassSel: '',
  testSubmitSel: '',
  testPassConfigured: false
})

function toForm(host: HostConfig): HostFormState {
  return {
    kind: host.kind ?? 'ssh',
    label: host.label,
    host: host.host,
    port: host.port,
    username: host.username,
    workspacesRoot: host.workspacesRoot,
    folderFilter: host.folderFilter ?? '',
    derive: { ...host.derive },
    services: host.services.map((s) => ({ ...s })),
    hide: (host.hide ?? DEFAULT_HIDE).join(', '),
    authKind: host.auth.kind,
    keyPath: host.auth.kind === 'key' ? host.auth.keyPath : '',
    passphrase: '',
    password: '',
    previewFolder: 'myapp-PROJ-42',
    terminalStartup: host.terminalStartup ?? '',
    testUser: host.testLogin?.username ?? '',
    testPass: '',
    testUserSel: host.testLogin?.usernameSelector ?? '',
    testPassSel: host.testLogin?.passwordSelector ?? '',
    testSubmitSel: host.testLogin?.submitSelector ?? '',
    testPassConfigured: Boolean(host.testLogin?.passwordEnc)
  }
}

function parseHide(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
}

function toInput(form: HostFormState, id?: string): HostInput {
  const shared = {
    id,
    label: form.label,
    workspacesRoot: form.workspacesRoot || '~/Workspaces',
    folderFilter: form.folderFilter.trim() || undefined,
    derive: form.derive,
    services: form.services,
    hide: parseHide(form.hide),
    terminalStartup: form.terminalStartup.trim() || undefined,
    testLogin:
      form.testUser.trim() ||
      form.testUserSel.trim() ||
      form.testPassSel.trim() ||
      form.testSubmitSel.trim() ||
      form.testPass
        ? {
            username: form.testUser.trim(),
            password: form.testPass || undefined,
            usernameSelector: form.testUserSel.trim(),
            passwordSelector: form.testPassSel.trim(),
            submitSelector: form.testSubmitSel.trim()
          }
        : null
  }
  if (form.kind === 'local') {
    return {
      ...shared,
      kind: 'local',
      label: form.label || 'This machine',
      host: form.host || 'localhost',
      port: 0,
      username: form.username || 'local',
      auth: { kind: 'none' }
    }
  }
  const auth: HostInput['auth'] =
    form.authKind === 'key'
      ? { kind: 'key', keyPath: form.keyPath, passphrase: form.passphrase || undefined }
      : form.authKind === 'password'
        ? { kind: 'password', password: form.password }
        : { kind: 'agent' }
  return {
    ...shared,
    kind: 'ssh',
    host: form.host,
    port: form.port,
    username: form.username,
    auth
  }
}

export const HostManager: FC = () => {
  const { hosts, load, save, remove, clone, test, testState } = useHostsStore()
  const setNewModalOpen = useWorkspacesStore((s) => s.setNewModalOpen)
  const [editing, setEditing] = useState<HostConfig | null>(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="flex h-full flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center gap-3 border-b border-neutral-800 px-5 py-3">
        <Server size={18} className="text-emerald-400" />
        <h1 className="text-sm font-semibold">Hosts</h1>
        <span className="text-xs text-neutral-500">{hosts.length} configured</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => {
              setEditing(null)
              setShowForm(true)
            }}
            className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
          >
            <Plus size={14} /> Add host
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        {hosts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-neutral-600">
            <Server size={40} />
            <p className="text-sm">No hosts yet.</p>
            <button
              onClick={() => setShowForm(true)}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-500"
            >
              Add host
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {hosts.map((host) => {
              const ts = testState[host.id]
              const local = host.kind === 'local'
              return (
                <div
                  key={host.id}
                  className="flex items-center gap-4 rounded-lg border border-neutral-800 bg-neutral-900/60 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {local ? (
                        <Monitor size={14} className="text-sky-400" />
                      ) : (
                        <Server size={14} className="text-neutral-500" />
                      )}
                      <span className="truncate text-sm font-medium">{host.label}</span>
                      <AuthBadge kind={local ? 'none' : host.auth.kind} local={local} />
                      {host.services.length > 0 && (
                        <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-500">
                          {host.services.length} svc
                        </span>
                      )}
                    </div>
                    <div className="truncate font-mono text-xs text-neutral-500">
                      {local
                        ? `${host.workspacesRoot} · local FS + terminal`
                        : `${host.username}@${host.host}:${host.port}`}
                    </div>
                    {host.derive.browserUrlTemplate && (
                      <div className="truncate font-mono text-[10px] text-neutral-600">
                        browser: {host.derive.browserUrlTemplate}
                      </div>
                    )}
                  </div>
                  <TestStatus state={ts} />
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setNewModalOpen(true, host.id)}
                      className="mr-1 rounded-md bg-emerald-600/90 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-500"
                    >
                      Open
                    </button>
                    <IconButton
                      label="Test"
                      disabled={ts?.testing}
                      onClick={() => test(toInput(toForm(host), host.id))}
                    >
                      <RefreshCw size={14} className={ts?.testing ? 'animate-spin' : ''} />
                    </IconButton>
                    <IconButton
                      label="Clone"
                      onClick={() => void clone(host.id)}
                    >
                      <Copy size={14} />
                    </IconButton>
                    <IconButton
                      label="Edit"
                      onClick={() => {
                        setEditing(host)
                        setShowForm(true)
                      }}
                    >
                      <Pencil size={14} />
                    </IconButton>
                    <IconButton label="Delete" danger onClick={() => remove(host.id)}>
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showForm && (
        <HostForm
          initial={editing}
          onClose={() => setShowForm(false)}
          onSave={async (form) => {
            await save(toInput(form, editing?.id))
            setShowForm(false)
          }}
        />
      )}
    </div>
  )
}

const AuthBadge: FC<{ kind: AuthKind; local?: boolean }> = ({ kind, local }) => {
  const label = local
    ? 'local'
    : kind === 'agent'
      ? 'agent'
      : kind === 'key'
        ? 'key'
        : kind === 'none'
          ? 'local'
          : 'password'
  return (
    <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
      {label}
    </span>
  )
}

const TestStatus: FC<{
  state?: { result?: { ok: boolean; error?: string; latencyMs: number }; testing: boolean }
}> = ({ state }) => {
  if (!state) return <span className="w-24 text-xs text-neutral-600">untested</span>
  if (state.testing) return <span className="w-24 text-xs text-neutral-400">testing…</span>
  if (state.result?.ok)
    return (
      <span className="flex w-24 items-center gap-1 text-xs text-emerald-400">
        <CheckCircle2 size={13} /> {state.result.latencyMs}ms
      </span>
    )
  return (
    <span className="flex w-24 items-center gap-1 text-xs text-red-400" title={state.result?.error}>
      <XCircle size={13} /> failed
    </span>
  )
}

const IconButton: FC<{
  children: ReactNode
  onClick: () => void
  label: string
  disabled?: boolean
  danger?: boolean
}> = ({ children, onClick, label, disabled, danger }) => (
  <button
    title={label}
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
    className={`rounded p-1.5 text-neutral-400 hover:bg-neutral-800 disabled:opacity-40 ${
      danger ? 'hover:text-red-400' : 'hover:text-neutral-100'
    }`}
  >
    {children}
  </button>
)

const HostForm: FC<{
  initial: HostConfig | null
  onSave: (form: HostFormState) => void
  onClose: () => void
}> = ({ initial, onSave, onClose }) => {
  const [form, setForm] = useState<HostFormState>(initial ? toForm(initial) : emptyForm())
  const [encryptionOk, setEncryptionOk] = useState(true)
  const set = <K extends keyof HostFormState>(key: K, value: HostFormState[K]): void =>
    setForm((f) => ({ ...f, [key]: value }))
  const patchDerive = (patch: Partial<DeriveConfig>): void =>
    setForm((f) => ({ ...f, derive: { ...f.derive, ...patch } }))

  const preview = useMemo(
    () => previewDerive(form.previewFolder.trim() || 'folder', form.derive),
    [form.previewFolder, form.derive]
  )

  useEffect(() => {
    void window.api.settings.get().then((s) => setEncryptionOk(s.encryptionAvailable !== false))
  }, [])

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

  const local = form.kind === 'local'
  const valid = local
    ? Boolean(form.label.trim() && form.workspacesRoot.trim())
    : Boolean(form.label.trim() && form.host.trim() && form.username.trim())

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!valid) return
          onSave(form)
        }}
        className="max-h-[92vh] w-[560px] overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{initial ? 'Edit Host' : 'Add Host'}</h2>
          <button type="button" onClick={onClose} className="text-neutral-500 hover:text-neutral-200">
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-3">
          {!encryptionOk && !local && (form.authKind === 'password' || form.authKind === 'key') && (
            <div className="rounded-md border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-[10px] text-amber-200">
              OS secret encryption unavailable — prefer SSH agent. Passphrases/passwords may be
              stored insecurely.
            </div>
          )}
          {!initial && (
            <Field label="Type">
              <div className="flex gap-2">
                {(['ssh', 'local'] as HostKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        kind: k,
                        authKind: k === 'local' ? 'none' : 'agent',
                        label: k === 'local' && !f.label ? 'This machine' : f.label
                      }))
                    }
                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs capitalize ${
                      form.kind === k
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                        : 'border-neutral-700 text-neutral-400'
                    }`}
                  >
                    {k === 'local' ? 'This machine' : 'SSH'}
                  </button>
                ))}
              </div>
            </Field>
          )}

          <Field label="Label">
            <input
              className={inputCls}
              value={form.label}
              onChange={(e) => set('label', e.target.value)}
              placeholder={local ? 'This machine' : 'my-build-box'}
            />
          </Field>

          {!local && (
            <>
              <div className="grid grid-cols-[1fr_90px] gap-3">
                <Field label="Host">
                  <input
                    className={inputCls}
                    value={form.host}
                    onChange={(e) => set('host', e.target.value)}
                    placeholder="build.example.com"
                  />
                </Field>
                <Field label="Port">
                  <input
                    type="number"
                    className={inputCls}
                    value={form.port}
                    onChange={(e) => set('port', Number(e.target.value))}
                  />
                </Field>
              </div>
              <Field label="Username">
                <input
                  className={inputCls}
                  value={form.username}
                  onChange={(e) => set('username', e.target.value)}
                />
              </Field>
            </>
          )}

          <Field label={local ? 'Workspaces root (local path)' : 'Workspaces root (remote)'}>
            <input
              className={inputCls}
              value={form.workspacesRoot}
              onChange={(e) => set('workspacesRoot', e.target.value)}
              placeholder="~/Workspaces"
            />
          </Field>

          <Field label="Folder filter (optional)">
            <input
              className={inputCls}
              value={form.folderFilter}
              onChange={(e) => set('folderFilter', e.target.value)}
              placeholder="myapp-* or /regex/"
            />
          </Field>

          <Field label="Terminal startup command (optional)">
            <input
              className={`${inputCls} font-mono`}
              value={form.terminalStartup}
              onChange={(e) => set('terminalStartup', e.target.value)}
              placeholder="claudey"
              spellCheck={false}
            />
            <p className="mt-1 text-[10px] text-neutral-600">
              Runs once in the first shell when a workspace connects.
            </p>
          </Field>

          <section className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Test credentials
            </h3>
            <p className="mb-2 text-[10px] text-neutral-600">
              Used by “Login as test user” in the browser toolbar. CSS selectors for the login form.
            </p>
            <div className="grid gap-2">
              <div className="grid grid-cols-2 gap-2">
                <input
                  className={inputCls}
                  value={form.testUser}
                  onChange={(e) => set('testUser', e.target.value)}
                  placeholder="Username / email"
                  autoComplete="off"
                />
                <input
                  className={inputCls}
                  type="password"
                  value={form.testPass}
                  onChange={(e) => set('testPass', e.target.value)}
                  placeholder={
                    form.testPassConfigured ? 'Password (leave blank to keep)' : 'Password'
                  }
                  autoComplete="new-password"
                />
              </div>
              <input
                className={`${inputCls} font-mono text-xs`}
                value={form.testUserSel}
                onChange={(e) => set('testUserSel', e.target.value)}
                placeholder="Username selector — e.g. input[name=email]"
                spellCheck={false}
              />
              <input
                className={`${inputCls} font-mono text-xs`}
                value={form.testPassSel}
                onChange={(e) => set('testPassSel', e.target.value)}
                placeholder="Password selector — e.g. input[type=password]"
                spellCheck={false}
              />
              <input
                className={`${inputCls} font-mono text-xs`}
                value={form.testSubmitSel}
                onChange={(e) => set('testSubmitSel', e.target.value)}
                placeholder="Submit selector — e.g. button[type=submit]"
                spellCheck={false}
              />
            </div>
          </section>

          <section className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Folder → workspace mapping
            </h3>
            <p className="mb-2 text-[10px] text-neutral-600">
              Per-host. Ideal for git worktrees / one folder per ticket. Named regex groups → URL
              templates.
            </p>
            <div className="grid gap-2">
              <input
                className={`${inputCls} font-mono text-xs`}
                value={form.derive.folderPattern}
                onChange={(e) => patchDerive({ folderPattern: e.target.value })}
                placeholder="^(?<ticket>[A-Z]+-\\d+)$"
                spellCheck={false}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  className={inputCls}
                  value={form.derive.titleTemplate}
                  onChange={(e) => patchDerive({ titleTemplate: e.target.value })}
                  placeholder="Title ${ticket}"
                />
                <input
                  className={inputCls}
                  value={form.derive.issueKeyTemplate ?? ''}
                  onChange={(e) => patchDerive({ issueKeyTemplate: e.target.value })}
                  placeholder="Issue ${ticket}"
                />
              </div>
              <input
                className={inputCls}
                value={form.derive.browserUrlTemplate}
                onChange={(e) => patchDerive({ browserUrlTemplate: e.target.value })}
                placeholder="https://preview.example.com/${ticketNum}"
              />
              <div className="flex items-center gap-2">
                <input
                  className={`${inputCls} flex-1`}
                  value={form.previewFolder}
                  onChange={(e) => set('previewFolder', e.target.value)}
                  placeholder="Try a folder name (live preview, not saved)"
                  spellCheck={false}
                />
                <span
                  className={`shrink-0 text-[10px] ${preview.ok ? 'text-emerald-400' : 'text-amber-400'}`}
                >
                  {preview.ok
                    ? `${preview.vars.ticket || preview.vars.name} → ${preview.browserUrl || '—'}`
                    : 'no match'}
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Dev services
            </h3>
            <p className="mb-2 text-[10px] text-neutral-600">
              Optional start/stop/logs commands for the Dev logs panel. Empty = hide that tab.
            </p>
            <div className="grid gap-2">
              {form.services.map((s, i) => (
                <div key={i} className="grid gap-1 rounded border border-neutral-800 p-2">
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
                    <input
                      className={inputCls}
                      placeholder="id"
                      value={s.id}
                      onChange={(e) =>
                        set(
                          'services',
                          form.services.map((x, j) =>
                            j === i ? { ...x, id: e.target.value } : x
                          )
                        )
                      }
                    />
                    <input
                      className={inputCls}
                      placeholder="Label"
                      value={s.label}
                      onChange={(e) =>
                        set(
                          'services',
                          form.services.map((x, j) =>
                            j === i ? { ...x, label: e.target.value } : x
                          )
                        )
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        set(
                          'services',
                          form.services.filter((_, j) => j !== i)
                        )
                      }
                      className="rounded px-2 text-xs text-neutral-500 hover:text-red-400"
                    >
                      Remove
                    </button>
                  </div>
                  {(['start', 'stop', 'restart', 'logs'] as const).map((key) => (
                    <input
                      key={key}
                      className={`${inputCls} font-mono text-[11px]`}
                      placeholder={`${key} command`}
                      value={s[key]}
                      onChange={(e) =>
                        set(
                          'services',
                          form.services.map((x, j) =>
                            j === i ? { ...x, [key]: e.target.value } : x
                          )
                        )
                      }
                    />
                  ))}
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  set('services', [
                    ...form.services,
                    {
                      id: `svc-${form.services.length + 1}`,
                      label: 'Service',
                      start: '',
                      stop: '',
                      restart: '',
                      logs: ''
                    }
                  ])
                }
                className="rounded-md border border-dashed border-neutral-700 px-2 py-1.5 text-xs text-neutral-400 hover:border-neutral-500"
              >
                + Add service
              </button>
            </div>
          </section>

          <Field label="Hide in file tree (comma-separated)">
            <input
              className={inputCls}
              value={form.hide}
              onChange={(e) => set('hide', e.target.value)}
              placeholder="node_modules, .git, dist"
            />
          </Field>

          {!local && (
            <>
              <Field label="Authentication">
                <div className="flex gap-2">
                  {(['agent', 'key', 'password'] as AuthKind[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => set('authKind', k)}
                      className={`flex-1 rounded-md border px-2 py-1.5 text-xs capitalize ${
                        form.authKind === k
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                          : 'border-neutral-700 text-neutral-400'
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </Field>
              {form.authKind === 'key' && (
                <>
                  <Field label="Private key path">
                    <input
                      className={inputCls}
                      value={form.keyPath}
                      onChange={(e) => set('keyPath', e.target.value)}
                      placeholder="~/.ssh/id_ed25519"
                    />
                  </Field>
                  <Field label={initial ? 'Passphrase (leave blank to keep)' : 'Passphrase'}>
                    <input
                      type="password"
                      className={inputCls}
                      value={form.passphrase}
                      onChange={(e) => set('passphrase', e.target.value)}
                    />
                  </Field>
                </>
              )}
              {form.authKind === 'password' && (
                <Field label={initial ? 'Password (leave blank to keep)' : 'Password'}>
                  <input
                    type="password"
                    className={inputCls}
                    value={form.password}
                    onChange={(e) => set('password', e.target.value)}
                  />
                </Field>
              )}
            </>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid}
            className="rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  )
}

const inputCls =
  'w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none'

const Field: FC<{ label: string; children: ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="mb-1 block text-xs text-neutral-400">{label}</span>
    {children}
  </label>
)
