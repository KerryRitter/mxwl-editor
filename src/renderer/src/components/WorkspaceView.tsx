import { useCallback, useEffect, useRef, useState, type FC, type ReactNode } from 'react'
import { ExternalLink, GitBranch, GitPullRequest, Globe, Loader2, Server, Ticket, XCircle } from 'lucide-react'
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelGroupHandle
} from 'react-resizable-panels'
import type { HostConfig, WorkspaceState } from '../../../shared/types'
import { BottomTabs } from './BottomTabs'
import { BrowserPane } from './BrowserPane'
import { CodePane } from './CodePane'
import { IntegrationsModal } from './IntegrationsModal'
import { McpToggle } from './McpToggle'
import { useNavigationStore } from '../store/navigation'

type LayoutPreset = 'balanced' | 'code' | 'review' | 'debug' | 'agent'
export type MaximizedPane = 'browser' | 'code' | 'bottom' | null

const PRESET_SIZES: Record<LayoutPreset, { main: [number, number]; right: [number, number] }> = {
  balanced: { main: [48, 52], right: [58, 42] },
  code: { main: [24, 76], right: [78, 22] },
  review: { main: [18, 82], right: [84, 16] },
  debug: { main: [42, 58], right: [34, 66] },
  agent: { main: [30, 70], right: [28, 72] }
}

export const WorkspaceView: FC<{ ws: WorkspaceState; active?: boolean }> = ({
  ws,
  active = true
}) => {
  const [showTicket, setShowTicket] = useState(false)
  const [host, setHost] = useState<HostConfig | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [showIntegrations, setShowIntegrations] = useState(false)
  const [jiraHost, setJiraHost] = useState<string | null>(null)
  const [bbWebBase, setBbWebBase] = useState<string | null>(null)
  const [prUrl, setPrUrl] = useState<string | null>(null)
  const [everReady, setEverReady] = useState(ws.status === 'connected')
  const layoutKey = `mxwl.workspace.${ws.hostId}::${ws.remotePath}`
  const [layoutPreset, setLayoutPresetState] = useState<LayoutPreset>(() => {
    const saved = localStorage.getItem(`${layoutKey}.layoutPreset`)
    return saved === 'code' || saved === 'review' || saved === 'debug' || saved === 'agent'
      ? saved
      : 'balanced'
  })
  const [maximized, setMaximized] = useState<MaximizedPane>(null)
  const mainPanels = useRef<ImperativePanelGroupHandle>(null)
  const rightPanels = useRef<ImperativePanelGroupHandle>(null)
  const focusPanel = useNavigationStore((state) => state.focus)

  const choosePreset = useCallback(
    (preset: LayoutPreset): void => {
      setMaximized(null)
      setLayoutPresetState(preset)
      localStorage.setItem(`${layoutKey}.layoutPreset`, preset)
      if (preset === 'code') focusPanel(ws.id, 'code')
      if (preset === 'review') focusPanel(ws.id, 'changes')
      if (preset === 'debug') focusPanel(ws.id, 'terminal')
      if (preset === 'agent') focusPanel(ws.id, 'agent')
    },
    [focusPanel, layoutKey, ws.id]
  )

  const toggleMaximized = useCallback((pane: Exclude<MaximizedPane, null>): void => {
    setMaximized((current) => (current === pane ? null : pane))
  }, [])

  useEffect(() => {
    const sizes = PRESET_SIZES[layoutPreset]
    const main: [number, number] =
      maximized === 'browser' ? [100, 0] : maximized ? [0, 100] : sizes.main
    const right: [number, number] =
      maximized === 'code' ? [100, 0] : maximized === 'bottom' ? [0, 100] : sizes.right
    mainPanels.current?.setLayout(main)
    rightPanels.current?.setLayout(right)
  }, [layoutPreset, maximized])

  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent): void => {
      const cmd = event.metaKey || event.ctrlKey
      if (cmd && event.shiftKey && ['1', '2', '3'].includes(event.key)) {
        event.preventDefault()
        toggleMaximized(event.key === '1' ? 'browser' : event.key === '2' ? 'code' : 'bottom')
      } else if (event.key === 'Escape' && maximized) {
        event.preventDefault()
        setMaximized(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [active, maximized, toggleMaximized])

  useEffect(() => {
    if (ws.status === 'connected') setEverReady(true)
  }, [ws.status])

  useEffect(() => {
    void Promise.all([window.api.host.get(ws.hostId), window.api.settings.get()]).then(([h, s]) => {
      setHost(h ?? null)
      setJiraHost(s.jira?.host?.replace(/\/+$/, '') || null)
      const bb = s.bitbucket
      setBbWebBase(
        bb?.workspace && bb?.repo
          ? `https://bitbucket.org/${bb.workspace}/${bb.repo}`
          : null
      )
      setShowIntegrations(
        (s.taskProvider && s.taskProvider !== 'none') ||
          (s.scmProvider && s.scmProvider !== 'none')
      )
    })
  }, [ws.hostId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!active || ws.status !== 'connected') return
    const t = setInterval(() => void window.api.workspace.git(ws.id), 20000)
    return () => clearInterval(t)
  }, [active, ws.id, ws.status])

  useEffect(() => {
    if (ws.status !== 'connected' || !ws.derived.branch) {
      setPrUrl(null)
      return
    }
    let cancelled = false
    void window.api.pr
      .get(ws.id)
      .then((pr) => {
        if (!cancelled) setPrUrl(pr?.url || null)
      })
      .catch(() => {
        if (!cancelled) setPrUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [ws.id, ws.status, ws.derived.branch])

  // First connect only — never tear down shells/editor on brief reconnects
  if (!everReady) {
    if (ws.status === 'error') {
      return (
        <Centered icon={<XCircle size={36} className="text-red-400" />}>
          <p className="text-sm font-medium text-red-400">Connection failed</p>
          <p className="text-xs text-neutral-500">
            mxwl will keep retrying. Check host credentials / network, then reopen the workspace.
          </p>
        </Centered>
      )
    }
    return (
      <Centered icon={<Loader2 size={36} className="animate-spin text-amber-400" />}>
        <p className="text-sm font-medium capitalize text-neutral-300">{ws.status}…</p>
        <p className="text-xs text-neutral-500">Connecting to {ws.remotePath}</p>
      </Centered>
    )
  }

  const connected = ws.status === 'connected'
  const openTab = (url: string): void => {
    void window.api.browser.newTab(ws.id, url)
  }

  const jiraUrl =
    jiraHost && ws.derived.issueKey ? `${jiraHost}/browse/${ws.derived.issueKey}` : null
  const branch = ws.derived.branch
  const bbUrl =
    prUrl ||
    (bbWebBase && branch
      ? `${bbWebBase}/pull-requests/?q=${encodeURIComponent(`source.branch.name="${branch}"`)}`
      : null)
  const devUrl = ws.derived.browserUrl || null
  const showTicketBtn = showIntegrations && (ws.derived.issueKey || branch)
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-neutral-800 px-4 py-1.5 text-xs text-neutral-400">
        <span className="flex items-center gap-1.5">
          {connected ? (
            <Server size={13} className="text-emerald-400" />
          ) : (
            <Loader2 size={13} className="animate-spin text-amber-400" />
          )}
          {connected ? 'connected' : ws.status}
        </span>
        <span className="max-w-[40%] truncate font-mono text-neutral-500">{ws.remotePath}</span>
        {branch && (
          <span className="flex items-center gap-1">
            <GitBranch size={12} /> {branch}
            {ws.derived.dirty && <span className="text-amber-400">•</span>}
          </span>
        )}
        {ws.derived.issueKey &&
          (jiraUrl ? (
            <BarLink
              href={jiraUrl}
              icon={<Ticket size={11} />}
              label={ws.derived.issueKey}
              onOpen={openTab}
            />
          ) : (
            <button
              onClick={() => setShowTicket(true)}
              title="Configure Jira host in Settings to open directly"
              className="flex items-center gap-1 text-neutral-300 hover:text-emerald-400"
            >
              <Ticket size={11} /> {ws.derived.issueKey}
            </button>
          ))}
        {bbUrl && (
          <BarLink href={bbUrl} icon={<GitPullRequest size={11} />} label="PR" onOpen={openTab} />
        )}
        {devUrl && (
          <BarLink href={devUrl} icon={<Globe size={11} />} label="Dev" onOpen={openTab} />
        )}
        {showTicketBtn && (
          <button
            onClick={() => setShowTicket(true)}
            className="flex items-center gap-1 rounded bg-neutral-800 px-2 py-0.5 text-neutral-300 hover:bg-neutral-700"
          >
            <ExternalLink size={11} /> Ticket & PR
          </button>
        )}
        <button
          onClick={() => setSearchOpen(true)}
          className="rounded bg-neutral-800 px-2 py-0.5 text-neutral-300 hover:bg-neutral-700"
          title="Ctrl+Shift+F"
        >
          Search
        </button>
        <label className="ml-auto flex items-center gap-1 text-[10px] text-neutral-500">
          Layout
          <select
            aria-label="Workspace layout preset"
            value={layoutPreset}
            onChange={(event) => choosePreset(event.currentTarget.value as LayoutPreset)}
            className="rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 text-[10px] text-neutral-300 outline-none"
          >
            <option value="balanced">Balanced</option>
            <option value="code">Code</option>
            <option value="review">Review</option>
            <option value="debug">Debug</option>
            <option value="agent">Agent</option>
          </select>
        </label>
        <div>
          <McpToggle wsId={ws.id} />
        </div>
      </div>

      <div className="min-h-0 flex-1 p-1.5">
        <PanelGroup
          ref={mainPanels}
          direction="horizontal"
          autoSaveId={`${layoutKey}.mainSplit`}
          className="h-full rounded-lg border border-neutral-800"
        >
          <Panel defaultSize={48} minSize={15} collapsible collapsedSize={0}>
            <BrowserPane
              wsId={ws.id}
              defaultUrl={ws.derived.browserUrl}
              active={active && (maximized === null || maximized === 'browser')}
              canTestLogin={Boolean(
                host?.testLogin?.username &&
                  host.testLogin.usernameSelector &&
                  host.testLogin.passwordSelector &&
                  host.testLogin.submitSelector &&
                  host.testLogin.passwordEnc
              )}
              maximized={maximized === 'browser'}
              onToggleMaximize={() => toggleMaximized('browser')}
            />
          </Panel>
          <PanelResizeHandle className="w-1 bg-neutral-800 hover:bg-neutral-700" />
          <Panel defaultSize={52} minSize={15} collapsible collapsedSize={0}>
            <PanelGroup
              ref={rightPanels}
              direction="vertical"
              autoSaveId={`${layoutKey}.rightSplit`}
              className="h-full"
            >
              <Panel defaultSize={58} minSize={15} collapsible collapsedSize={0}>
                <CodePane
                  ws={ws}
                  active={active && (maximized === null || maximized === 'code')}
                  searchOpen={searchOpen}
                  onCloseSearch={() => setSearchOpen(false)}
                  maximized={maximized === 'code'}
                  onToggleMaximize={() => toggleMaximized('code')}
                />
              </Panel>
              <PanelResizeHandle className="h-1 bg-neutral-800 hover:bg-neutral-700" />
              <Panel defaultSize={42} minSize={15} collapsible collapsedSize={0}>
                <BottomTabs
                  wsId={ws.id}
                  cwd={ws.remotePath}
                  persistenceKey={layoutKey}
                  sessions={ws.terminal.sessions}
                  activeSessionId={ws.terminal.activeSessionId}
                  restoringTerminals={ws.terminal.restoring}
                  hasServices={(host?.services.length ?? 0) > 0}
                  workspaceActive={active && (maximized === null || maximized === 'bottom')}
                  connected={connected}
                  maximized={maximized === 'bottom'}
                  onToggleMaximize={() => toggleMaximized('bottom')}
                />
              </Panel>
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>

      {showTicket && (
        <IntegrationsModal
          wsId={ws.id}
          issueKey={ws.derived.issueKey}
          branch={ws.derived.branch}
          onClose={() => setShowTicket(false)}
        />
      )}
    </div>
  )
}

const Centered: FC<{ icon: ReactNode; children: ReactNode }> = ({ icon, children }) => (
  <div className="flex h-full flex-col items-center justify-center gap-2">
    {icon}
    {children}
  </div>
)

const BarLink: FC<{
  href: string
  icon: ReactNode
  label: string
  onOpen: (href: string) => void
}> = ({ href, icon, label, onOpen }) => (
  <button
    onClick={() => onOpen(href)}
    title={href}
    className="flex items-center gap-1 text-neutral-300 hover:text-emerald-400"
  >
    {icon} {label}
  </button>
)
