import { useEffect, useState, type FC, type ReactNode } from 'react'
import { Modal } from './Modal'
import { usePluginsStore } from '../store/plugins'
import { AI_CLIS, AI_CLI_ORDER, DEFAULT_AI_SETTINGS } from '../../../shared/aiCli'
import {
  ACP_AGENTS,
  ACP_AGENT_ORDER,
  DEFAULT_AGENT_SETTINGS,
  agentShellCommand
} from '../../../shared/acpAgents'
import type {
  AgentId,
  AgentNotificationSettings,
  AgentSettings,
  AiCliId,
  AiSettings,
  ControlSettings,
  ControlStatus,
  RuntimeSettings
} from '../../../shared/types'
import { githubHost as normalizeGitHubHost, type GitHubAccount } from '../../../shared/github'

type SettingsModalProps = {
  onClose: () => void
  hideBrowserWs?: string | null
}

export const SettingsModal: FC<SettingsModalProps> = ({ onClose, hideBrowserWs }) => {
  const [jiraHost, setJiraHost] = useState('')
  const [jiraEmail, setJiraEmail] = useState('')
  const [jiraToken, setJiraToken] = useState('')
  const [bbHost, setBbHost] = useState('https://api.bitbucket.org')
  const [bbUser, setBbUser] = useState('')
  const [bbPass, setBbPass] = useState('')
  const [githubHost, setGithubHost] = useState('github.com')
  const [githubAuth, setGithubAuth] = useState<GitHubAccount['auth']>('public')
  const [githubToken, setGithubToken] = useState('')
  const [githubTokenSaved, setGithubTokenSaved] = useState(false)
  const [githubTesting, setGithubTesting] = useState(false)
  const [githubResult, setGithubResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [mcpToken, setMcpToken] = useState('')
  const [ai, setAi] = useState<AiSettings>({ ...DEFAULT_AI_SETTINGS })
  const [agent, setAgent] = useState<AgentSettings>({ ...DEFAULT_AGENT_SETTINGS })
  const [notifications, setNotifications] = useState<AgentNotificationSettings>({
    delivery: 'in-app',
    delaySeconds: 1,
    sound: true,
    suppressActiveWorkspace: true,
    mutedAgents: []
  })
  const [control, setControl] = useState<ControlSettings>({
    enabled: true,
    port: 9233,
    remoteAccess: false,
    authToken: ''
  })
  const [runtime, setRuntime] = useState<RuntimeSettings>({
    keepAlive: true,
    launchAtLogin: false
  })
  const [controlStatus, setControlStatus] = useState<ControlStatus | null>(null)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [encryptionOk, setEncryptionOk] = useState(true)
  const [configured, setConfigured] = useState<{ jira: boolean; bb: boolean }>({
    jira: false,
    bb: false
  })
  const plugins = usePluginsStore((state) => state.catalog)
  const setPluginEnabled = usePluginsStore((state) => state.setEnabled)
  const reloadPlugins = usePluginsStore((state) => state.reload)
  const installPluginPath = usePluginsStore((state) => state.installPath)
  const unlinkPlugin = usePluginsStore((state) => state.unlink)
  const [pluginBusy, setPluginBusy] = useState<string | null>(null)
  const [pluginError, setPluginError] = useState<string | null>(null)
  const [pluginPath, setPluginPath] = useState('')

  useEffect(() => {
    if (hideBrowserWs) void window.api.browser.setVisible(hideBrowserWs, false)
    return () => {
      if (hideBrowserWs) void window.api.browser.setVisible(hideBrowserWs, true)
    }
  }, [hideBrowserWs])

  useEffect(() => {
    void window.api.settings.get().then((s) => {
      setJiraHost(s.jira?.host ?? '')
      setJiraEmail(s.jira?.email ?? '')
      setBbHost(s.bitbucket?.host || 'https://api.bitbucket.org')
      setBbUser(s.bitbucket?.username ?? '')
      setGithubHost(s.github?.host ?? 'github.com')
      setGithubAuth(s.github?.auth ?? 'public')
      setGithubTokenSaved(Boolean(s.github?.tokenEnc))
      setMcpToken(s.mcpAuthToken ?? '')
      setAi({ ...DEFAULT_AI_SETTINGS, ...(s.ai ?? {}) })
      setAgent({ ...DEFAULT_AGENT_SETTINGS, ...(s.agent ?? {}) })
      setNotifications(s.notifications)
      setControl(s.control)
      setRuntime(s.runtime)
      setEncryptionOk(s.encryptionAvailable !== false)
      setConfigured({ jira: Boolean(s.jira?.host), bb: Boolean(s.bitbucket?.username) })
    })
    void window.api.control.status().then(setControlStatus)
  }, [])

  async function save(): Promise<void> {
    setSaving(true)
    setSaveError(null)
    try {
    await window.api.settings.update({
      github: { host: githubHost, auth: githubAuth, token: githubToken || undefined },
      ai,
      agent,
      notifications,
      control,
      runtime,
      mcpAuthToken: mcpToken,
      jira: (jiraHost || jiraEmail) ? { host: jiraHost, email: jiraEmail, apiToken: jiraToken || undefined } : null,
      bitbucket: bbUser ? { host: bbHost, username: bbUser, appPassword: bbPass || undefined } : null
    })
    onClose()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
    } finally { setSaving(false) }
  }

  async function testGithub(): Promise<void> {
    setGithubTesting(true)
    setGithubResult(null)
    try {
      setGithubResult(await window.api.github.test({ host: githubHost, auth: githubAuth, token: githubToken || undefined }))
    } catch { setGithubResult({ ok: false, message: 'Could not check the GitHub connection.' }) }
    finally { setGithubTesting(false) }
  }

  const inputCls =
    'w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none'
  let githubLoginCommand = 'gh auth login'
  try {
    const host = normalizeGitHubHost(githubHost).host
    if (host !== 'github.com') githubLoginCommand += ` --hostname ${host}`
  } catch { /* Invalid hosts are explained by the connection check or save. */ }

  return (
    <Modal title="Settings" onClose={onClose} width={600}>
      <div className="grid max-h-[70vh] gap-5 overflow-y-auto pr-1">
        <p className="text-[11px] text-neutral-500">
          Project behavior belongs in Projects. Host authentication belongs in Hosts.
          Settings here control mxwl, agent defaults, installed plugins, and reusable account credentials.
        </p>

        {!encryptionOk && (
          <div className="rounded-md border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-[11px] text-amber-200">
            OS secret encryption (keychain) is unavailable. Passwords/tokens will be stored with an
            insecure marker — prefer SSH agent/key auth and GitHub CLI authentication until encryption works.
          </div>
        )}


        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
            MCP auth token
          </h3>
          <input
            className={inputCls}
            type="password"
            placeholder="Optional Bearer token for workspace MCP"
            value={mcpToken}
            onChange={(e) => setMcpToken(e.target.value)}
          />
        </section>

        <ProviderSection title="AI">
          <p className="mb-2 text-[11px] text-neutral-500">
            The CLI launched in each terminal that an AI run opens. It must be on the host’s PATH
            and already signed in.
          </p>
          <ProviderPicker
            options={AI_CLI_ORDER.map((id) => ({
              id,
              label: AI_CLIS[id].label,
              ready: true
            }))}
            value={ai.defaultCli}
            onChange={(id) => setAi((s) => ({ ...s, defaultCli: id as AiCliId }))}
          />

          <div className="mt-3 grid gap-2">
            <Field
              label="Binary"
              hint={`default: ${AI_CLIS[ai.defaultCli].command}`}
            >
              <input
                className={inputCls}
                placeholder={AI_CLIS[ai.defaultCli].command}
                value={ai.commandOverrides[ai.defaultCli] ?? ''}
                onChange={(e) =>
                  setAi((s) => ({
                    ...s,
                    commandOverrides: { ...s.commandOverrides, [s.defaultCli]: e.target.value }
                  }))
                }
              />
            </Field>
            <Field label="Extra flags" hint="e.g. --permission-mode acceptEdits">
              <input
                className={inputCls}
                placeholder="none"
                value={ai.argsOverrides[ai.defaultCli] ?? ''}
                onChange={(e) =>
                  setAi((s) => ({
                    ...s,
                    argsOverrides: { ...s.argsOverrides, [s.defaultCli]: e.target.value }
                  }))
                }
              />
            </Field>
            <p className="text-[11px] text-neutral-500">Workspace naming and branch initialization are configured per project; checkout paths live on project locations.</p>
            <Field label="Init timeout" hint="Seconds to wait for the folder to appear">
              <input
                className={inputCls}
                type="number"
                min={30}
                value={ai.initTimeoutSec}
                onChange={(e) =>
                  setAi((s) => ({
                    ...s,
                    initTimeoutSec: Math.max(30, Number(e.target.value) || 600)
                  }))
                }
              />
            </Field>
            <label className="flex items-center gap-2 text-[11px] text-neutral-400">
              <input
                type="checkbox"
                checked={ai.refinePrompts}
                onChange={(e) => setAi((s) => ({ ...s, refinePrompts: e.target.checked }))}
                className="accent-emerald-500"
              />
              Refine each prompt with a headless {AI_CLIS[ai.defaultCli].label} pass before running
            </label>
          </div>
        </ProviderSection>

        <ProviderSection title="Agent panel">
          <p className="mb-2 text-[11px] text-neutral-500">
            The agent the Agent tab starts with. These speak ACP, so they run as a subprocess of the
            workspace host rather than in a terminal — overrides here only change how they launch.
          </p>
          <ProviderPicker
            options={ACP_AGENT_ORDER.map((id) => ({
              id,
              label: ACP_AGENTS[id].label,
              ready: true
            }))}
            value={agent.defaultAgent}
            onChange={(id) => setAgent((s) => ({ ...s, defaultAgent: id as AgentId }))}
          />
          <p className="mt-2 text-[11px] text-neutral-600">
            {ACP_AGENTS[agent.defaultAgent].hint}
          </p>
          <div className="mt-3 grid gap-2">
            <Field
              label="Binary"
              hint={`default: ${agentShellCommand(agent.defaultAgent, DEFAULT_AGENT_SETTINGS) || 'none — set one'}`}
            >
              <input
                className={inputCls}
                placeholder={ACP_AGENTS[agent.defaultAgent].command || 'e.g. my-agent'}
                value={agent.commandOverrides[agent.defaultAgent] ?? ''}
                onChange={(e) =>
                  setAgent((s) => ({
                    ...s,
                    commandOverrides: { ...s.commandOverrides, [s.defaultAgent]: e.target.value }
                  }))
                }
              />
            </Field>
            <Field
              label="Arguments"
              hint="Replaces the defaults when a binary is set above — the ACP flag has to be in here"
            >
              <input
                className={inputCls}
                placeholder={ACP_AGENTS[agent.defaultAgent].args.join(' ') || 'none'}
                value={agent.argsOverrides[agent.defaultAgent] ?? ''}
                onChange={(e) =>
                  setAgent((s) => ({
                    ...s,
                    argsOverrides: { ...s.argsOverrides, [s.defaultAgent]: e.target.value }
                  }))
                }
              />
            </Field>
            <label className="flex items-start gap-2 text-[11px] text-neutral-400">
              <input
                type="checkbox"
                checked={agent.autoApprove}
                onChange={(e) => setAgent((s) => ({ ...s, autoApprove: e.target.checked }))}
                className="mt-0.5 accent-emerald-500"
              />
              <span>
                Skip permission prompts
                <span className="block text-[10px] text-neutral-600">
                  Starts every agent in its most permissive mode and allows each tool call
                  automatically. The agent edits files and runs commands in the workspace with
                  nothing to confirm.
                </span>
              </span>
            </label>
          </div>
        </ProviderSection>

        <ProviderSection title="Notifications">
          <p className="mb-2 text-[11px] text-neutral-500">
            Alerts fire after an agent finishes, fails, or needs permission. History remains in the
            bell even when popup delivery is off.
          </p>
          <ProviderPicker
            options={[
              { id: 'off', label: 'Bell only', ready: true },
              { id: 'in-app', label: 'In app', ready: true },
              { id: 'system', label: 'Desktop', ready: true },
              { id: 'both', label: 'Both', ready: true }
            ]}
            value={notifications.delivery}
            onChange={(delivery) =>
              setNotifications((value) => ({
                ...value,
                delivery: delivery as AgentNotificationSettings['delivery']
              }))
            }
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Field label="Delay" hint="seconds; avoids noisy transitions">
              <input
                className={inputCls}
                type="number"
                min={0}
                max={3600}
                value={notifications.delaySeconds}
                onChange={(event) =>
                  setNotifications((value) => ({
                    ...value,
                    delaySeconds: Math.max(0, Math.min(3600, Number(event.target.value) || 0))
                  }))
                }
              />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-[11px] text-neutral-400">
              <input
                type="checkbox"
                checked={notifications.sound}
                onChange={(event) =>
                  setNotifications((value) => ({ ...value, sound: event.target.checked }))
                }
                className="accent-emerald-500"
              />
              Play notification sound
            </label>
          </div>
          <label className="mt-2 flex items-center gap-2 text-[11px] text-neutral-400">
            <input
              type="checkbox"
              checked={notifications.suppressActiveWorkspace}
              onChange={(event) =>
                setNotifications((value) => ({
                  ...value,
                  suppressActiveWorkspace: event.target.checked
                }))
              }
              className="accent-emerald-500"
            />
            Stay quiet when I am already looking at that workspace
          </label>
          <div className="mt-3">
            <p className="mb-1.5 text-[10px] uppercase tracking-wide text-neutral-600">
              Mute agent types
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ACP_AGENT_ORDER.map((id) => {
                const muted = notifications.mutedAgents.includes(id)
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() =>
                      setNotifications((value) => ({
                        ...value,
                        mutedAgents: muted
                          ? value.mutedAgents.filter((agentId) => agentId !== id)
                          : [...value.mutedAgents, id]
                      }))
                    }
                    className={`rounded border px-2 py-1 text-[10px] ${
                      muted
                        ? 'border-amber-600/70 bg-amber-950/30 text-amber-300'
                        : 'border-neutral-800 text-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    {muted ? 'Muted · ' : ''}{ACP_AGENTS[id].label}
                  </button>
                )
              })}
            </div>
          </div>
        </ProviderSection>

        <ProviderSection title="Background runtime">
          <div className="grid gap-2">
            <label className="flex items-start gap-2 text-[11px] text-neutral-400">
              <input
                type="checkbox"
                checked={runtime.keepAlive}
                onChange={(event) =>
                  setRuntime((value) => ({ ...value, keepAlive: event.target.checked }))
                }
                className="mt-0.5 accent-emerald-500"
              />
              <span>
                Keep agents and terminals running when the window closes
                <span className="block text-[10px] text-neutral-600">
                  The window hides to the tray. Use Quit mxwl from the tray to stop the runtime.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-[11px] text-neutral-400">
              <input
                type="checkbox"
                checked={runtime.launchAtLogin}
                onChange={(event) =>
                  setRuntime((value) => ({ ...value, launchAtLogin: event.target.checked }))
                }
                className="mt-0.5 accent-emerald-500"
              />
              Start the mxwl runtime in the background when I log in
            </label>
          </div>
        </ProviderSection>

        <ProviderSection title="Control API & mobile dashboard">
          <div className="grid gap-3">
            <label className="flex items-center gap-2 text-[11px] text-neutral-400">
              <input
                type="checkbox"
                checked={control.enabled}
                onChange={(event) =>
                  setControl((value) => ({ ...value, enabled: event.target.checked }))
                }
                className="accent-emerald-500"
              />
              Enable authenticated control server and <code>mxwl agent</code> CLI
            </label>
            <div className="grid grid-cols-[120px_1fr] gap-2">
              <Field label="Port">
                <input
                  className={inputCls}
                  type="number"
                  min={1024}
                  max={65535}
                  value={control.port}
                  onChange={(event) =>
                    setControl((value) => ({
                      ...value,
                      port: Math.max(1024, Math.min(65535, Number(event.target.value) || 9233))
                    }))
                  }
                />
              </Field>
              <Field label="Bearer token" hint="generated locally">
                <div className="flex gap-1.5">
                  <input className={inputCls} readOnly type="password" value={control.authToken} />
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(control.authToken)
                      setCopied(true)
                      window.setTimeout(() => setCopied(false), 1200)
                    }}
                    className="rounded-md border border-neutral-700 px-2 text-[10px] text-neutral-400 hover:text-neutral-100"
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </Field>
            </div>
            <label className="flex items-start gap-2 text-[11px] text-neutral-400">
              <input
                type="checkbox"
                checked={control.remoteAccess}
                onChange={(event) =>
                  setControl((value) => ({ ...value, remoteAccess: event.target.checked }))
                }
                className="mt-0.5 accent-amber-500"
              />
              <span>
                Allow devices on this network
                <span className="block text-[10px] text-amber-600/90">
                  Binds to every network interface. Keep the bearer token private and use a trusted
                  LAN, VPN, or tailnet.
                </span>
              </span>
            </label>
            <div className="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-2">
              <div>
                <p className="text-[11px] text-neutral-300">
                  {controlStatus?.running ? 'Runtime online' : 'Runtime will start after save'}
                </p>
                <p className="text-[10px] text-neutral-600">
                  {controlStatus?.url ?? `http://127.0.0.1:${control.port}`}
                </p>
              </div>
              <button
                type="button"
                disabled={!control.authToken}
                onClick={() =>
                  window.open(
                    `${controlStatus?.url ?? `http://127.0.0.1:${control.port}`}/?token=${encodeURIComponent(control.authToken)}`,
                    '_blank'
                  )
                }
                className="rounded-md bg-brand-accent px-2.5 py-1.5 text-[10px] text-brand-ink hover:bg-brand-hover disabled:opacity-40"
              >
                Open dashboard
              </button>
            </div>
          </div>
        </ProviderSection>

        <ProviderSection title="Plugins">
          <div className="mb-2 flex items-start justify-between gap-3">
            <p className="max-w-[390px] text-[11px] text-neutral-500">
              Workspace tools live in the top-right quadrant. Built-ins run as native mxwl code;
              linked plugins stay in their own folders, run in a sandbox, and can only use the
              permissions you see here.
            </p>
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  void window.api.plugins.chooseDirectory().then((path) => {
                    if (path) setPluginPath(path)
                  })
                }}
                className="rounded-md border border-neutral-700 px-2 py-1 text-[10px] text-neutral-400 hover:border-neutral-600 hover:text-neutral-100"
              >
                Browse…
              </button>
              <button
                type="button"
                disabled={pluginBusy === 'reload'}
                onClick={() => {
                  setPluginError(null)
                  setPluginBusy('reload')
                  void reloadPlugins()
                    .catch((error: unknown) =>
                      setPluginError(error instanceof Error ? error.message : String(error))
                    )
                    .finally(() => setPluginBusy(null))
                }}
                className="rounded-md border border-neutral-700 px-2 py-1 text-[10px] text-neutral-400 hover:border-neutral-600 hover:text-neutral-100 disabled:opacity-40"
              >
                {pluginBusy === 'reload' ? 'Reloading…' : 'Reload'}
              </button>
            </div>
          </div>

          <form
            className="mb-2 flex gap-1.5"
            onSubmit={(event) => {
              event.preventDefault()
              const path = pluginPath.trim()
              if (!path) return
              setPluginError(null)
              setPluginBusy('install')
              void installPluginPath(path)
                .then(() => setPluginPath(''))
                .catch((error: unknown) =>
                  setPluginError(error instanceof Error ? error.message : String(error))
                )
                .finally(() => setPluginBusy(null))
            }}
          >
            <input
              className={`${inputCls} min-w-0 flex-1 font-mono text-[10px]`}
              placeholder="/path/to/plugin or /path/to/mxwl.plugin.json"
              value={pluginPath}
              onChange={(event) => setPluginPath(event.target.value)}
            />
            <button
              type="submit"
              disabled={!pluginPath.trim() || pluginBusy === 'install'}
              className="rounded-md bg-violet-600 px-2.5 py-1 text-[10px] text-white hover:bg-violet-500 disabled:opacity-40"
            >
              {pluginBusy === 'install' ? 'Installing…' : 'Install path'}
            </button>
          </form>

          {pluginError && (
            <p className="mb-2 rounded-md border border-red-900/70 bg-red-950/30 px-2.5 py-2 text-[10px] text-red-300">
              {pluginError}
            </p>
          )}

          <div className="grid gap-2">
            {plugins.map((plugin) => {
              const invalid = 'error' in plugin
              const busy = pluginBusy === plugin.id
              return (
                <div
                  key={`${plugin.source}:${plugin.id}`}
                  className={`rounded-lg border bg-neutral-950/60 px-3 py-2.5 ${
                    invalid ? 'border-red-900/60' : 'border-neutral-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-medium text-neutral-200">{plugin.name}</span>
                        <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-neutral-500">
                          {plugin.source === 'builtin'
                            ? 'Built in'
                            : plugin.installation === 'linked'
                              ? 'Linked'
                              : 'Managed'}
                        </span>
                        <span className="text-[9px] text-neutral-700">v{plugin.version}</span>
                      </div>
                      {plugin.description && (
                        <p className="mt-1 text-[10px] leading-relaxed text-neutral-500">
                          {plugin.description}
                        </p>
                      )}
                    </div>
                    <label className="flex shrink-0 items-center gap-2 text-[10px] text-neutral-500">
                      {plugin.enabled ? 'Enabled' : 'Disabled'}
                      <input
                        type="checkbox"
                        checked={plugin.enabled}
                        disabled={invalid || busy}
                        onChange={(event) => {
                          const enabled = event.target.checked
                          setPluginError(null)
                          setPluginBusy(plugin.id)
                          void setPluginEnabled(plugin.id, enabled)
                            .catch((error: unknown) =>
                              setPluginError(
                                error instanceof Error ? error.message : String(error)
                              )
                            )
                            .finally(() => setPluginBusy(null))
                        }}
                        className="accent-violet-500"
                      />
                    </label>
                  </div>

                  {invalid ? (
                    <p className="mt-2 text-[10px] text-red-300">{plugin.error}</p>
                  ) : (
                    <>
                      {plugin.permissionReviewRequired && (
                        <p className="mt-2 text-[10px] text-amber-300">
                          Permissions changed. Review them, then enable this plugin again.
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(plugin.permissions ?? []).length === 0 ? (
                          <span className="text-[9px] text-neutral-700">No host permissions</span>
                        ) : (
                          plugin.permissions?.map((permission) => (
                            <span
                              key={permission}
                              className="rounded border border-neutral-800 px-1.5 py-0.5 text-[9px] text-neutral-600"
                            >
                              {permission.replace(':', ' · ')}
                            </span>
                          ))
                        )}
                      </div>
                    </>
                  )}
                  {plugin.directory && (
                    <div className="mt-2 flex items-center gap-2 border-t border-neutral-900 pt-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-[9px] text-neutral-700" title={plugin.directory}>
                        {plugin.directory}
                      </span>
                      {plugin.installation === 'linked' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setPluginError(null)
                            setPluginBusy(plugin.id)
                            void unlinkPlugin(plugin.directory!)
                              .catch((error: unknown) =>
                                setPluginError(
                                  error instanceof Error ? error.message : String(error)
                                )
                              )
                              .finally(() => setPluginBusy(null))
                          }}
                          className="shrink-0 text-[9px] text-neutral-600 hover:text-red-300 disabled:opacity-40"
                        >
                          Unlink
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-[10px] text-neutral-600">
            Install a folder containing <code>mxwl.plugin.json</code>. mxwl remembers the location
            and loads it in place; unlinking never deletes the plugin's files.{' '}
            <button
              type="button"
              onClick={() => void window.api.plugins.openDirectory()}
              className="text-neutral-500 underline decoration-neutral-800 underline-offset-2 hover:text-neutral-300"
            >
              Open legacy managed folder
            </button>
            .
          </p>
        </ProviderSection>

        <ProviderSection title="Accounts">
          <p className="mb-3 text-xs text-neutral-500">Reusable credentials. Projects choose their own task provider and source-control repository.</p>
          <div className="grid gap-2">
            <span className="text-xs text-neutral-400">GitHub</span>
            <Field label="GitHub host"><input className={inputCls} value={githubHost} onChange={e => { setGithubHost(e.target.value); setGithubResult(null) }} placeholder="github.com" /></Field>
            <Field label="GitHub authentication">
              <select className={inputCls} value={githubAuth} onChange={e => { setGithubAuth(e.target.value as GitHubAccount['auth']); setGithubResult(null) }}>
                <option value="public">Public repositories</option>
                <option value="cli">GitHub CLI login</option>
                <option value="token">Personal access token</option>
              </select>
            </Field>
            {githubAuth === 'cli' && <p className="text-[11px] leading-relaxed text-neutral-500">Use your existing GitHub CLI account. Run <code>{githubLoginCommand}</code> on the computer running mxwl first.</p>}
            {githubAuth === 'token' && <>
              <Field label={`GitHub token${githubTokenSaved ? ' (blank keeps existing)' : ''}`}><input type="password" autoComplete="new-password" className={inputCls} value={githubToken} onChange={e => { setGithubToken(e.target.value); setGithubResult(null) }} /></Field>
              <p className="text-[11px] leading-relaxed text-neutral-500">Select the repositories you use and grant read access to Issues and Pull requests. Authorize organization SSO when required.</p>
            </>}
            <div><button type="button" onClick={() => void testGithub()} disabled={githubTesting} className="rounded border border-neutral-700 px-2.5 py-1 text-xs text-brand-accent hover:bg-neutral-800 disabled:opacity-40">{githubTesting ? 'Checking GitHub…' : 'Test GitHub connection'}</button></div>
            {githubResult && <p role="status" className={`text-[11px] ${githubResult.ok ? 'text-brand-accent' : 'text-red-400'}`}>{githubResult.message}</p>}
            <span className="text-xs text-neutral-400">Jira {configured.jira ? '· configured' : ''}</span>
            <Field label="Jira host"><input className={inputCls} value={jiraHost} onChange={e => setJiraHost(e.target.value)} /></Field>
            <Field label="Jira email"><input className={inputCls} value={jiraEmail} onChange={e => setJiraEmail(e.target.value)} /></Field>
            <Field label="Jira API token (blank keeps existing)"><input type="password" className={inputCls} value={jiraToken} onChange={e => setJiraToken(e.target.value)} /></Field>
            <span className="mt-3 text-xs text-neutral-400">Bitbucket {configured.bb ? '· configured' : ''}</span>
            <Field label="Bitbucket API host"><input className={inputCls} value={bbHost} onChange={e => setBbHost(e.target.value)} /></Field>
            <Field label="Bitbucket username"><input className={inputCls} value={bbUser} onChange={e => setBbUser(e.target.value)} /></Field>
            <Field label="Bitbucket app password (blank keeps existing)"><input type="password" className={inputCls} value={bbPass} onChange={e => setBbPass(e.target.value)} /></Field>
          </div>
        </ProviderSection>
      </div>

      {saveError && <p role="alert" className="mt-3 text-xs text-red-400">{saveError}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-md px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-100"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-brand-accent px-4 py-1.5 text-xs font-medium text-brand-ink hover:bg-brand-hover disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}

const ProviderSection: FC<{ title: string; children: ReactNode }> = ({ title, children }) => (
  <section>
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
      {title}
    </h3>
    {children}
  </section>
)

const Field: FC<{ label: string; hint?: string; children: ReactNode }> = ({
  label,
  hint,
  children
}) => (
  <label className="grid gap-1">
    <span className="flex items-baseline gap-2">
      <span className="text-[11px] text-neutral-400">{label}</span>
      {hint && <span className="truncate text-[10px] text-neutral-600">{hint}</span>}
    </span>
    {children}
  </label>
)

const ProviderPicker: FC<{
  options: { id: string; label: string; ready: boolean }[]
  value: string
  onChange: (id: string) => void
}> = ({ options, value, onChange }) => (
  <div className="flex flex-wrap gap-1.5">
    {options.map((o) => (
      <button
        key={o.id}
        type="button"
        onClick={() => onChange(o.id)}
        className={`rounded-md border px-2.5 py-1.5 text-xs ${
          value === o.id
            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
            : 'border-neutral-700 text-neutral-400 hover:border-neutral-600'
        }`}
      >
        {o.label}
        {!o.ready && o.id !== 'none' && (
          <span className="ml-1 text-[9px] uppercase text-neutral-600">soon</span>
        )}
      </button>
    ))}
  </div>
)
