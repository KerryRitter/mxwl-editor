import { useEffect, useRef, useState, type FC, type ReactNode } from 'react'
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
  HostKind,
  TestResult
} from '../../../shared/types'
import { useHostsStore } from '../store/hosts'
import { useProjectsStore } from '../store/projects'
import { TailscalePicker } from './TailscalePicker'
import { SetupSteps } from './SetupSteps'

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
            className="flex items-center gap-1.5 rounded-md bg-brand-accent px-3 py-1.5 text-xs font-medium text-brand-ink hover:bg-brand-hover"
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
              className="rounded-md bg-brand-accent px-3 py-1.5 text-xs text-brand-ink hover:bg-brand-hover"
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
  const [step, setStep] = useState(initial || seed?.host ? 1 : 0)
  const hosts = useHostsStore((state) => state.hosts)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [encryptionOk, setEncryptionOk] = useState(true)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)
  const [saveOffline, setSaveOffline] = useState(false)
  const generation = useRef(0)
  const change = (patch: Partial<HostFormState>): void => {
    generation.current++
    setForm((f) => ({ ...f, ...patch }))
    setResult(null)
    setSaveOffline(false)
    setSaveError('')
  }
  const set = <K extends keyof HostFormState>(
    key: K,
    value: HostFormState[K]
  ): void => change({ [key]: value })
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
    return () => {
      generation.current++
      window.removeEventListener('keydown', onKey, true)
    }
  }, [onClose])
  const local = form.kind === 'local'
  const valid = local
    ? Boolean(form.label.trim())
    : Boolean(
        form.host.trim() &&
          form.username.trim() &&
          Number.isInteger(form.port) &&
          form.port > 0 &&
          form.port <= 65535 &&
          (form.authKind !== 'key' || form.keyPath.trim()) &&
          (form.authKind !== 'password' ||
            form.password ||
            initial?.auth.kind === 'password')
      )
  const normalized = {
    ...form,
    label: form.label.trim() || form.host.trim(),
    host: form.host.trim(),
    username: form.username.trim(),
    keyPath: form.keyPath.trim()
  }
  async function testConnection(): Promise<void> {
    const current = generation.current
    setTesting(true)
    try {
      const tested = await window.api.host.test(
        toInput(normalized, initial?.id)
      )
      if (generation.current === current) setResult(tested)
    } catch (error) {
      if (generation.current === current)
        setResult({ ok: false, error: String(error), latencyMs: 0 })
    } finally {
      setTesting(false)
    }
  }
  return (
    <div
      data-mxwl-modal
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={initial ? 'Edit machine connection' : 'Connect a machine'}
        onSubmit={(e) => {
          e.preventDefault()
          if (step < 2) {
            if (step === 0 || valid) setStep(step + 1)
            return
          }
          if (!valid || saving || (!local && !result?.ok && !saveOffline))
            return
          setSaving(true)
          Promise.resolve(onSave(normalized))
            .catch((e) => setSaveError(String(e)))
            .finally(() => setSaving(false))
        }}
        className="max-h-[90vh] w-[600px] overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {initial ? 'Edit machine connection' : 'Connect a machine'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            title="Close connection setup"
            className="text-neutral-500 hover:text-neutral-200"
          >
            <X size={16} />
          </button>
        </div>
        <SetupSteps
          steps={['Machine', 'Connection', 'Test & save']}
          current={step}
        />
        {step === 0 && (
          <div className="grid gap-3">
            <h3 className="text-sm font-medium">Where will you work?</h3>
            <p className="text-xs leading-relaxed text-neutral-500">
              Use this computer, connect over SSH, or find a machine on your
              Tailscale network. Connection details can be reused by any
              project.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(['local', 'ssh', 'tailscale'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-label={
                    kind === 'local'
                      ? 'This Machine'
                      : kind === 'tailscale'
                        ? 'Tailscale'
                        : 'SSH'
                  }
                  aria-pressed={connectionType === kind}
                  onClick={() => {
                    setConnectionType(kind)
                    change({
                      kind: kind === 'local' ? 'local' : 'ssh',
                      authKind:
                        kind === 'local'
                          ? 'none'
                          : kind === 'tailscale'
                            ? 'tailscale'
                            : 'agent',
                      port: kind === 'local' ? 0 : 22,
                      label:
                        kind === 'local'
                          ? 'This machine'
                          : form.label === 'This machine'
                            ? ''
                            : form.label
                    })
                  }}
                  className={`rounded-lg border p-3 text-left ${connectionType === kind ? 'border-emerald-500 bg-emerald-500/10' : 'border-neutral-700 hover:border-neutral-500'}`}
                >
                  {kind === 'local' ? (
                    <Monitor size={18} className="mb-2 text-sky-400" />
                  ) : kind === 'tailscale' ? (
                    <Network size={18} className="mb-2 text-sky-400" />
                  ) : (
                    <Server size={18} className="mb-2 text-sky-400" />
                  )}
                  <span className="block text-xs text-neutral-200">
                    {kind === 'local'
                      ? 'This Machine'
                      : kind === 'tailscale'
                        ? 'Tailscale'
                        : 'SSH'}
                  </span>
                  <span className="mt-1 block text-[10px] text-neutral-500">
                    {kind === 'local'
                      ? 'No credentials needed'
                      : kind === 'tailscale'
                        ? 'Discover your devices'
                        : 'Address and SSH login'}
                  </span>
                </button>
              ))}
            </div>
            {connectionType === 'tailscale' && (
              <TailscalePicker
                embedded
                hosts={hosts}
                onClose={onClose}
                onSelect={(device, username) => {
                  change({
                    label: device.name,
                    host: device.address,
                    port: 22,
                    username: form.username || username,
                    authKind: device.sshAdvertised ? 'tailscale' : 'agent'
                  })
                  setStep(1)
                }}
              />
            )}
          </div>
        )}
        {step === 1 && (
          <div className="grid gap-3">
            <h3 className="text-sm font-medium">
              {local ? 'Name this machine' : 'How do you connect?'}
            </h3>
            <p className="text-xs leading-relaxed text-neutral-500">
              {local
                ? 'Local workspaces use your normal shell and files. No network connection is needed.'
                : 'Use the same address and username you use in your SSH terminal. We’ll test the connection in the next step.'}
            </p>
            <Field label="Label">
              <input
                className={inputCls}
                value={form.label}
                onChange={(e) => set('label', e.target.value)}
                placeholder={
                  local
                    ? 'This machine'
                    : 'Optional — defaults to the host address'
                }
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
                      placeholder="build.example.com or 100.x.x.x"
                    />
                  </Field>
                  <Field label="Port">
                    <input
                      type="number"
                      min={1}
                      max={65535}
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
                    placeholder="Your account on the remote machine"
                  />
                </Field>
                <Field label="Authentication">
                  <select
                    aria-label="Authentication"
                    className={inputCls}
                    value={form.authKind}
                    onChange={(e) =>
                      set('authKind', e.target.value as AuthKind)
                    }
                  >
                    <option value="agent">SSH agent (recommended)</option>
                    <option value="key">Private key file</option>
                    <option value="password">Password</option>
                    <option value="tailscale">Tailscale identity</option>
                  </select>
                </Field>
                {form.authKind === 'agent' && (
                  <p className="text-[11px] leading-relaxed text-neutral-500">
                    Uses keys already loaded in your local SSH agent. If the
                    test fails, load your key with ssh-add or choose a private
                    key file.
                  </p>
                )}
                {form.authKind === 'tailscale' && (
                  <p className="text-[11px] leading-relaxed text-neutral-500">
                    Uses your Tailscale identity. The remote account must exist
                    and your tailnet policy must allow it. If approval is
                    required, run{' '}
                    <code>
                      tailscale ssh {form.username || 'user'}@
                      {form.host || 'host'}
                    </code>{' '}
                    in a terminal and approve the login.
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
                {!encryptionOk &&
                  (form.authKind === 'password' || form.authKind === 'key') && (
                    <p className="rounded border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-[11px] text-amber-200">
                      OS secret encryption unavailable. Prefer an SSH agent to
                      avoid saving passwords or passphrases.
                    </p>
                  )}
              </>
            )}
          </div>
        )}
        {step === 2 && (
          <div className="grid gap-4">
            <div>
              <h3 className="text-sm font-medium">
                {local ? 'Ready to save' : 'Check your connection'}
              </h3>
              <p className="mt-1 text-xs text-neutral-500">
                {local
                  ? 'This connection will be available when choosing a machine for a project.'
                  : 'Test access before adding a checkout. You can also save a machine that is currently offline.'}
              </p>
            </div>
            <dl className="grid grid-cols-[90px_1fr] gap-2 rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-xs">
              <dt className="text-neutral-500">Machine</dt>
              <dd>{normalized.label}</dd>
              <dt className="text-neutral-500">Connection</dt>
              <dd>
                {local
                  ? 'This computer'
                  : `${normalized.username}@${normalized.host}:${normalized.port}`}
              </dd>
              {!local && (
                <>
                  <dt className="text-neutral-500">Sign in</dt>
                  <dd>
                    {form.authKind === 'agent'
                      ? 'SSH agent'
                      : form.authKind === 'key'
                        ? 'Private key file'
                        : form.authKind === 'tailscale'
                          ? 'Tailscale identity'
                          : 'Password'}
                  </dd>
                </>
              )}
            </dl>
            {!local && (
              <>
                <button
                  type="button"
                  disabled={testing}
                  onClick={() => void testConnection()}
                  className="justify-self-start rounded border border-emerald-700 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
                >
                  {testing
                    ? 'Testing connection…'
                    : result
                      ? 'Test again'
                      : 'Test connection'}
                </button>
                {result && (
                  <div
                    role="status"
                    className={`rounded-lg border px-3 py-2 text-xs ${result.ok ? 'border-emerald-700/50 bg-emerald-950/20 text-emerald-300' : 'border-red-800/50 bg-red-950/20 text-red-300'}`}
                  >
                    <p>
                      {result.ok
                        ? 'Connected successfully. Your login works.'
                        : 'Could not connect to this machine.'}
                    </p>
                    {!result.ok && (
                      <>
                        <p className="mt-2 break-words font-mono text-[11px]">
                          {result.error}
                        </p>
                        <p className="mt-2">
                          Go back to check the address and sign-in method, then
                          try again.
                        </p>
                      </>
                    )}
                  </div>
                )}
                {!result?.ok && (
                  <label className="flex items-center gap-2 text-[11px] text-neutral-500">
                    <input
                      type="checkbox"
                      checked={saveOffline}
                      onChange={(e) => setSaveOffline(e.target.checked)}
                    />{' '}
                    Save without connecting for now
                  </label>
                )}
              </>
            )}
          </div>
        )}
        {saveError && (
          <p role="alert" className="mt-3 text-xs text-red-400">
            {saveError}
          </p>
        )}
        <div className="mt-5 flex items-center gap-2 border-t border-neutral-800 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="mr-auto rounded px-2 py-1.5 text-xs text-neutral-500 hover:text-neutral-200"
          >
            Cancel
          </button>
          {step > (initial ? 1 : 0) && (
            <button
              type="button"
              disabled={saving}
              onClick={() => setStep(step - 1)}
              className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300"
            >
              Back
            </button>
          )}
          <button
            type="submit"
            disabled={
              saving ||
              (step === 1 && !valid) ||
              (step === 2 &&
                (!valid || (!local && !result?.ok && !saveOffline)))
            }
            className="rounded bg-brand-accent px-4 py-1.5 text-xs font-medium text-brand-ink hover:bg-brand-hover disabled:opacity-40"
          >
            {saving ? 'Saving…' : step < 2 ? 'Continue' : 'Save'}
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
