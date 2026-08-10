import { useEffect, useState, type FC, type ReactNode } from 'react'
import { Modal } from './Modal'
import { AI_CLIS, AI_CLI_ORDER, DEFAULT_AI_SETTINGS } from '../../../shared/aiCli'
import {
  ACP_AGENTS,
  ACP_AGENT_ORDER,
  DEFAULT_AGENT_SETTINGS,
  agentShellCommand
} from '../../../shared/acpAgents'
import type {
  AgentId,
  AgentSettings,
  AiCliId,
  AiSettings,
  ScmProviderId,
  TaskProviderId
} from '../../../shared/types'

type SettingsModalProps = {
  onClose: () => void
  hideBrowserWs?: string | null
}

const TASK_OPTIONS: { id: TaskProviderId; label: string; ready: boolean }[] = [
  { id: 'jira', label: 'Jira', ready: true },
  { id: 'linear', label: 'Linear', ready: false },
  { id: 'github-issues', label: 'GitHub Issues', ready: false },
  { id: 'none', label: 'None', ready: true }
]

const SCM_OPTIONS: { id: ScmProviderId; label: string; ready: boolean }[] = [
  { id: 'bitbucket', label: 'Bitbucket', ready: true },
  { id: 'github', label: 'GitHub', ready: false },
  { id: 'gitlab', label: 'GitLab', ready: false },
  { id: 'none', label: 'None', ready: true }
]

export const SettingsModal: FC<SettingsModalProps> = ({ onClose, hideBrowserWs }) => {
  const [taskProvider, setTaskProvider] = useState<TaskProviderId>('none')
  const [scmProvider, setScmProvider] = useState<ScmProviderId>('none')
  const [jiraHost, setJiraHost] = useState('')
  const [jiraEmail, setJiraEmail] = useState('')
  const [jiraToken, setJiraToken] = useState('')
  const [bbHost, setBbHost] = useState('https://api.bitbucket.org')
  const [bbUser, setBbUser] = useState('')
  const [bbPass, setBbPass] = useState('')
  const [bbWorkspace, setBbWorkspace] = useState('')
  const [bbRepo, setBbRepo] = useState('')
  const [defaultUrl, setDefaultUrl] = useState('')
  const [mcpToken, setMcpToken] = useState('')
  const [ai, setAi] = useState<AiSettings>({ ...DEFAULT_AI_SETTINGS })
  const [agent, setAgent] = useState<AgentSettings>({ ...DEFAULT_AGENT_SETTINGS })
  const [saving, setSaving] = useState(false)
  const [encryptionOk, setEncryptionOk] = useState(true)
  const [configured, setConfigured] = useState<{ jira: boolean; bb: boolean }>({
    jira: false,
    bb: false
  })

  useEffect(() => {
    if (hideBrowserWs) void window.api.browser.setVisible(hideBrowserWs, false)
    return () => {
      if (hideBrowserWs) void window.api.browser.setVisible(hideBrowserWs, true)
    }
  }, [hideBrowserWs])

  useEffect(() => {
    void window.api.settings.get().then((s) => {
      setTaskProvider(s.taskProvider || 'none')
      setScmProvider(s.scmProvider || 'none')
      setJiraHost(s.jira?.host ?? '')
      setJiraEmail(s.jira?.email ?? '')
      setBbHost(s.bitbucket?.host || 'https://api.bitbucket.org')
      setBbUser(s.bitbucket?.username ?? '')
      setBbWorkspace(s.bitbucket?.workspace ?? '')
      setBbRepo(s.bitbucket?.repo ?? '')
      setDefaultUrl(s.defaultBrowserUrl ?? '')
      setMcpToken(s.mcpAuthToken ?? '')
      setAi({ ...DEFAULT_AI_SETTINGS, ...(s.ai ?? {}) })
      setAgent({ ...DEFAULT_AGENT_SETTINGS, ...(s.agent ?? {}) })
      setEncryptionOk(s.encryptionAvailable !== false)
      setConfigured({ jira: Boolean(s.jira?.host), bb: Boolean(s.bitbucket?.workspace) })
    })
  }, [])

  async function save(): Promise<void> {
    setSaving(true)
    await window.api.settings.update({
      taskProvider,
      scmProvider,
      ai,
      agent,
      defaultBrowserUrl: defaultUrl,
      mcpAuthToken: mcpToken,
      jira:
        taskProvider === 'jira' && (jiraHost || jiraEmail)
          ? { host: jiraHost, email: jiraEmail, apiToken: jiraToken || undefined }
          : taskProvider === 'jira'
            ? null
            : undefined,
      bitbucket:
        scmProvider === 'bitbucket' && (bbWorkspace || bbRepo)
          ? {
              host: bbHost,
              username: bbUser,
              appPassword: bbPass || undefined,
              workspace: bbWorkspace,
              repo: bbRepo
            }
          : scmProvider === 'bitbucket'
            ? null
            : undefined
    })
    setSaving(false)
    onClose()
  }

  const inputCls =
    'w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none'

  return (
    <Modal title="Settings" onClose={onClose} width={520}>
      <div className="grid max-h-[70vh] gap-5 overflow-y-auto pr-1">
        <p className="text-[11px] text-neutral-500">
          Folder mapping, browser URL templates, and Dev services are configured per host (Edit
          Host). Settings here are global credentials and fallbacks.
        </p>

        {!encryptionOk && (
          <div className="rounded-md border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-[11px] text-amber-200">
            OS secret encryption (keychain) is unavailable. Passwords/tokens will be stored with an
            insecure marker — prefer SSH agent/key auth until encryption works.
          </div>
        )}

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Fallback browser URL
          </h3>
          <input
            className={inputCls}
            placeholder="Used when a host’s URL template has no match"
            value={defaultUrl}
            onChange={(e) => setDefaultUrl(e.target.value)}
          />
        </section>

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
            <Field
              label="Workspace folder"
              hint="Under the host workspaces root. Vars: ${key} ${keyLower} ${keyNum} ${slug}"
            >
              <input
                className={inputCls}
                placeholder="${key}"
                value={ai.workspaceFolderTemplate}
                onChange={(e) =>
                  setAi((s) => ({ ...s, workspaceFolderTemplate: e.target.value }))
                }
              />
            </Field>
            <Field label="Base repo folder" hint="Where branch init runs when a folder is missing">
              <input
                className={inputCls}
                placeholder="e.g. myrepo (blank = never provision)"
                value={ai.baseRepoFolder}
                onChange={(e) => setAi((s) => ({ ...s, baseRepoFolder: e.target.value }))}
              />
            </Field>
            <Field
              label="Branch init command"
              hint="Run in the base repo. Without ${…} vars the ticket key is appended."
            >
              <input
                className={inputCls}
                placeholder="$agent-init-branch"
                value={ai.initBranchCommand}
                onChange={(e) => setAi((s) => ({ ...s, initBranchCommand: e.target.value }))}
              />
            </Field>
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

        <ProviderSection title="Task management">
          <ProviderPicker
            options={TASK_OPTIONS}
            value={taskProvider}
            onChange={(id) => setTaskProvider(id as TaskProviderId)}
          />
          {taskProvider === 'jira' && (
            <div className="mt-3 grid gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-neutral-500">Jira credentials</span>
                {configured.jira && (
                  <span className="text-[10px] text-emerald-400">configured</span>
                )}
              </div>
              <input
                className={inputCls}
                placeholder="Host"
                value={jiraHost}
                onChange={(e) => setJiraHost(e.target.value)}
              />
              <input
                className={inputCls}
                placeholder="Email"
                value={jiraEmail}
                onChange={(e) => setJiraEmail(e.target.value)}
              />
              <input
                className={inputCls}
                type="password"
                placeholder="API token (leave blank to keep)"
                value={jiraToken}
                onChange={(e) => setJiraToken(e.target.value)}
              />
            </div>
          )}
          {taskProvider !== 'jira' && taskProvider !== 'none' && <ComingSoon name={taskProvider} />}
        </ProviderSection>

        <ProviderSection title="Source control">
          <ProviderPicker
            options={SCM_OPTIONS}
            value={scmProvider}
            onChange={(id) => setScmProvider(id as ScmProviderId)}
          />
          {scmProvider === 'bitbucket' && (
            <div className="mt-3 grid gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-neutral-500">Bitbucket credentials</span>
                {configured.bb && (
                  <span className="text-[10px] text-emerald-400">configured</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  className={inputCls}
                  placeholder="Workspace"
                  value={bbWorkspace}
                  onChange={(e) => setBbWorkspace(e.target.value)}
                />
                <input
                  className={inputCls}
                  placeholder="Repo slug"
                  value={bbRepo}
                  onChange={(e) => setBbRepo(e.target.value)}
                />
                <input
                  className={inputCls}
                  placeholder="Username"
                  value={bbUser}
                  onChange={(e) => setBbUser(e.target.value)}
                />
                <input
                  className={inputCls}
                  type="password"
                  placeholder="App password (blank to keep)"
                  value={bbPass}
                  onChange={(e) => setBbPass(e.target.value)}
                />
                <input
                  className={`${inputCls} col-span-2`}
                  placeholder="API host"
                  value={bbHost}
                  onChange={(e) => setBbHost(e.target.value)}
                />
              </div>
            </div>
          )}
          {scmProvider !== 'bitbucket' && scmProvider !== 'none' && (
            <ComingSoon name={scmProvider} />
          )}
        </ProviderSection>
      </div>

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
          className="rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
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

const ComingSoon: FC<{ name: string }> = ({ name }) => (
  <div className="mt-3 rounded-lg border border-dashed border-neutral-700 bg-neutral-950/60 px-3 py-4 text-center">
    <p className="text-sm capitalize text-neutral-300">{name.replace(/-/g, ' ')}</p>
    <p className="mt-1 text-[11px] text-neutral-500">More coming soon — credentials UI not wired yet.</p>
  </div>
)
