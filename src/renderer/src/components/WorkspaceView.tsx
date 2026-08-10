import { useEffect, useState, type FC, type ReactNode } from 'react'
import { ExternalLink, GitBranch, GitPullRequest, Globe, Loader2, Server, Ticket, XCircle } from 'lucide-react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import type { HostConfig, WorkspaceState } from '../../../shared/types'
import { BottomTabs } from './BottomTabs'
import { FileTree } from './FileTree'
import { Editor } from './Editor'
import { BrowserPane } from './BrowserPane'
import { IntegrationsModal } from './IntegrationsModal'
import { McpToggle } from './McpToggle'
import { SearchPanel } from './SearchPanel'

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
    if (ws.status !== 'connected') return
    const t = setInterval(() => void window.api.workspace.git(ws.id), 20000)
    return () => clearInterval(t)
  }, [ws.id, ws.status])

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
        <div className="ml-auto">
          <McpToggle wsId={ws.id} />
        </div>
      </div>

      <div className="min-h-0 flex-1 p-1.5">
        <PanelGroup direction="horizontal" className="h-full rounded-lg border border-neutral-800">
          <Panel defaultSize={48} minSize={20}>
            <BrowserPane
              wsId={ws.id}
              defaultUrl={ws.derived.browserUrl}
              active={active}
              canTestLogin={Boolean(
                host?.testLogin?.username &&
                  host.testLogin.usernameSelector &&
                  host.testLogin.passwordSelector &&
                  host.testLogin.submitSelector &&
                  host.testLogin.passwordEnc
              )}
            />
          </Panel>
          <PanelResizeHandle className="w-1 bg-neutral-800 hover:bg-neutral-700" />
          <Panel defaultSize={52} minSize={20}>
            <PanelGroup direction="vertical" className="h-full">
              <Panel defaultSize={58} minSize={15}>
                <PanelGroup direction="horizontal" className="h-full">
                  <Panel defaultSize={22} minSize={12} maxSize={45}>
                    {searchOpen ? (
                      <SearchPanel wsId={ws.id} onClose={() => setSearchOpen(false)} />
                    ) : (
                      <FileTree wsId={ws.id} root={ws.remotePath} />
                    )}
                  </Panel>
                  <PanelResizeHandle className="w-1 bg-neutral-800 hover:bg-neutral-700" />
                  <Panel defaultSize={78} minSize={30}>
                    <Editor wsId={ws.id} />
                  </Panel>
                </PanelGroup>
              </Panel>
              <PanelResizeHandle className="h-1 bg-neutral-800 hover:bg-neutral-700" />
              <Panel defaultSize={42} minSize={15}>
                <BottomTabs
                  wsId={ws.id}
                  cwd={ws.remotePath}
                  sessions={ws.terminal.sessions}
                  hasServices={(host?.services.length ?? 0) > 0}
                  workspaceActive={active}
                  connected={connected}
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
