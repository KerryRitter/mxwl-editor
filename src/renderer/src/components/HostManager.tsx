import { useEffect, useState, type FC, type ReactNode } from 'react'
import {
  CheckCircle2,
  Copy,
  Monitor,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  XCircle,
  X
} from 'lucide-react'
import type {
  AuthConfig,
  HostConfig,
  HostInput,
  HostKind
} from '../../../shared/types'
import { useHostsStore } from '../store/hosts'
import { useProjectsStore } from '../store/projects'
import { TailscalePicker } from './TailscalePicker'

type AuthKind = AuthConfig['kind']

type HostFormState = {
  kind: HostKind
  label: string
  host: string
  port: number
  username: string
  authKind: AuthKind
  keyPath: string
  passphrase: string
  password: string
}

const emptyForm = (): HostFormState => ({
  kind: 'ssh',
  label: '',
  host: '',
  port: 22,
  username: '',
  authKind: 'agent',
  keyPath: '',
  passphrase: '',
  password: ''
})

function toForm(host: HostConfig): HostFormState {
  return {
    kind: host.kind ?? 'ssh',
    label: host.label,
    host: host.host,
    port: host.port,
    username: host.username,
    authKind: host.auth.kind,
    keyPath: host.auth.kind === 'key' ? host.auth.keyPath : '',
    passphrase: '',
    password: ''
  }
}

function toInput(form: HostFormState, id?: string): HostInput {
  const shared = {
    id,
    label: form.label
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
      ? {
          kind: 'key',
          keyPath: form.keyPath,
          passphrase: form.passphrase || undefined
        }
      : form.authKind === 'password'
        ? { kind: 'password', password: form.password }
        : form.authKind === 'tailscale'
          ? { kind: 'tailscale' }
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
  const locations = useProjectsStore((s) => s.locations)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<HostConfig | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showTailscale, setShowTailscale] = useState(false)
  const [seed, setSeed] = useState<Partial<HostFormState>>({})

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="flex h-full flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center gap-3 border-b border-neutral-800 px-5 py-3">
        <Server size={18} className="text-emerald-400" />
        <h1 className="text-sm font-semibold">Machine connections</h1>
        <span className="text-xs text-neutral-500">
          {hosts.length} configured
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowTailscale(true)}
            className="flex items-center gap-1.5 rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-sky-500 hover:text-sky-300"
          >
            <Network size={14} /> Discover Tailscale
          </button>
          <button
            onClick={() => {
              setEditing(null)
              setSeed({})
              setShowForm(true)
            }}
            className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
          >
            <Plus size={14} /> Add host
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        {error && (
          <p role="alert" className="mb-3 text-xs text-red-400">
            {error}
          </p>
        )}
        {hosts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-neutral-600">
            <Server size={40} />
            <p className="text-sm">No hosts yet.</p>
            <button
              onClick={() => {
                setEditing(null)
                setSeed({})
                setShowForm(true)
              }}
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
                      <span className="truncate text-sm font-medium">
                        {host.label}
                      </span>
                      <AuthBadge
                        kind={local ? 'none' : host.auth.kind}
                        local={local}
                      />
                    </div>
                    <div className="truncate font-mono text-xs text-neutral-500">
                      {local
                        ? 'Local FS + terminal'
                        : `${host.username}@${host.host}:${host.port}`}
                    </div>
                  </div>
                  <TestStatus state={ts} />
                  <div className="flex items-center gap-1">
                    <IconButton
                      label="Test"
                      disabled={ts?.testing}
                      onClick={() => test(toInput(toForm(host), host.id))}
                    >
                      <RefreshCw
                        size={14}
                        className={ts?.testing ? 'animate-spin' : ''}
                      />
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
                    <IconButton
                      label={
                        locations.some(
                          (l) => l.builtinLocal && l.hostId === host.id
                        )
                          ? 'This machine is required by projects'
                          : 'Delete'
                      }
                      disabled={locations.some(
                        (l) => l.builtinLocal && l.hostId === host.id
                      )}
                      danger
                      onClick={() => {
                        if (
                          confirm(
                            'Remove this host configuration? Source files are never deleted.'
                          )
                        )
                          void remove(host.id).catch((e) => setError(String(e)))
                      }}
                    >
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
          seed={seed}
          onClose={() => setShowForm(false)}
          onSave={async (form) => {
            try {
              await save(toInput(form, editing?.id))
              setShowForm(false)
              setError('')
            } catch (e) {
              setError(String(e))
              throw e
            }
          }}
        />
      )}
      {showTailscale && (
        <TailscalePicker
          hosts={hosts}
          onClose={() => setShowTailscale(false)}
          onSelect={(device, username) => {
            setEditing(null)
            // Connect by mesh IP so discovery also works when MagicDNS is disabled.
            setSeed({
              label: device.name,
              host: device.address,
              username,
              authKind: device.sshAdvertised ? 'tailscale' : 'agent'
            })
            setShowTailscale(false)
            setShowForm(true)
          }}
        />
      )}
    </div>
  )
}

export function ConnectionEditor({
  initial = null,
  onClose,
  onSaved
}: {
  initial?: HostConfig | null
  onClose: () => void
  onSaved: (host: HostConfig) => void
}): JSX.Element {
  const save = useHostsStore((s) => s.save)
  return (
    <HostForm
      initial={initial}
      onClose={onClose}
      onSave={async (form) => {
        onSaved(await save(toInput(form, initial?.id)))
      }}
    />
  )
}

const AuthBadge: FC<{ kind: AuthKind; local?: boolean }> = ({
  kind,
  local
}) => {
  const label = local
    ? 'local'
    : kind === 'agent'
      ? 'agent'
      : kind === 'tailscale'
        ? 'tailscale'
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
  state?: {
    result?: { ok: boolean; error?: string; latencyMs: number }
    testing: boolean
  }
}> = ({ state }) => {
  if (!state)
    return <span className="w-24 text-xs text-neutral-600">untested</span>
  if (state.testing)
    return <span className="w-24 text-xs text-neutral-400">testing…</span>
  if (state.result?.ok)
    return (
      <span className="flex w-24 items-center gap-1 text-xs text-emerald-400">
        <CheckCircle2 size={13} /> {state.result.latencyMs}ms
      </span>
    )
  return (
    <span
      className="flex w-24 items-center gap-1 text-xs text-red-400"
      title={state.result?.error}
    >
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
  seed?: Partial<HostFormState>
  onSave: (form: HostFormState) => void | Promise<void>
  onClose: () => void
}> = ({ initial, seed, onSave, onClose }) => {
  const [form, setForm] = useState<HostFormState>(
    initial ? toForm(initial) : { ...emptyForm(), ...seed }
  )
  const [connectionType, setConnectionType] = useState<
    'ssh' | 'tailscale' | 'local'
  >(
    initial?.kind === 'local'
      ? 'local'
      : (initial?.auth.kind ?? seed?.authKind) === 'tailscale'
        ? 'tailscale'
        : 'ssh'
  )
  const hosts = useHostsStore((state) => state.hosts)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [encryptionOk, setEncryptionOk] = useState(true)
  const set = <K extends keyof HostFormState>(
    key: K,
    value: HostFormState[K]
  ): void => setForm((f) => ({ ...f, [key]: value }))
  useEffect(() => {
    void window.api.settings
      .get()
      .then((s) => setEncryptionOk(s.encryptionAvailable !== false))
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
    ? Boolean(form.label.trim())
    : Boolean(form.label.trim() && form.host.trim() && form.username.trim())

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!valid) return
          setSaving(true)
          Promise.resolve(onSave(form))
            .catch((e) => setSaveError(String(e)))
            .finally(() => setSaving(false))
        }}
        className="max-h-[92vh] w-[560px] overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {initial ? 'Edit Host' : 'Add Host'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-200"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-3">
          {!encryptionOk &&
            !local &&
            (form.authKind === 'password' || form.authKind === 'key') && (
              <div className="rounded-md border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-[10px] text-amber-200">
                OS secret encryption unavailable — prefer SSH agent.
                Passphrases/passwords may be stored insecurely.
              </div>
            )}
          {!initial && (
            <fieldset>
              <legend className="mb-1 text-xs text-neutral-400">Type</legend>
              <div className="flex gap-2">
                {(['ssh', 'tailscale', 'local'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={connectionType === k}
                    onClick={() => {
                      setConnectionType(k)
                      setForm((f) => ({
                        ...f,
                        kind: k === 'local' ? 'local' : 'ssh',
                        authKind:
                          k === 'local'
                            ? 'none'
                            : k === 'tailscale'
                              ? 'tailscale'
                              : 'agent',
                        port: k === 'local' ? 0 : 22,
                        label:
                          k === 'local' && !f.label ? 'This machine' : f.label
                      }))
                    }}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs capitalize ${
                      connectionType === k
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                        : 'border-neutral-700 text-neutral-400'
                    }`}
                  >
                    {k === 'local'
                      ? 'This Machine'
                      : k === 'tailscale'
                        ? 'Tailscale'
                        : 'SSH'}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {connectionType === 'tailscale' && (
            <TailscalePicker
              embedded
              hosts={hosts}
              onClose={onClose}
              onSelect={(device, username) =>
                setForm((value) => ({
                  ...value,
                  label: device.name,
                  host: device.address,
                  port: 22,
                  username: value.username || username,
                  authKind: device.sshAdvertised ? 'tailscale' : 'agent'
                }))
              }
            />
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

          {!local && (
            <>
              <Field label="Authentication">
                <div className="flex gap-2">
                  {(
                    ['agent', 'key', 'password', 'tailscale'] as AuthKind[]
                  ).map((k) => (
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
              {form.authKind === 'tailscale' && (
                <p className="text-[11px] text-neutral-400">
                  Uses your Tailscale identity without an SSH key. The username
                  must exist on the remote machine and be allowed by your
                  tailnet policy. If check mode requires approval, run{' '}
                  <code>
                    tailscale ssh {form.username || 'user'}@
                    {form.host || 'host'}
                  </code>{' '}
                  in a terminal, approve the login in your browser, then connect
                  here.
                </p>
              )}
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
                  <Field
                    label={
                      initial
                        ? 'Passphrase (leave blank to keep)'
                        : 'Passphrase'
                    }
                  >
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
                <Field
                  label={
                    initial ? 'Password (leave blank to keep)' : 'Password'
                  }
                >
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

        {saveError && (
          <p role="alert" className="mt-3 text-xs text-red-400">
            {saveError}
          </p>
        )}
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
            disabled={!valid || saving}
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

const Field: FC<{ label: string; children: ReactNode }> = ({
  label,
  children
}) => (
  <label className="block">
    <span className="mb-1 block text-xs text-neutral-400">{label}</span>
    {children}
  </label>
)
