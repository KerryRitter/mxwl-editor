import { useEffect, useState, type FC, type ReactNode } from 'react'
import { ExternalLink, GitBranch, Loader2, Server, XCircle } from 'lucide-react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import type { HostConfig, WorkspaceState } from '../../../shared/types'
import { BottomTabs } from './BottomTabs'
import { FileTree } from './FileTree'
import { Editor } from './Editor'
import { BrowserPane } from './BrowserPane'
import { IntegrationsModal } from './IntegrationsModal'
import { McpToggle } from './McpToggle'
import { SearchPanel } from './SearchPanel'

export const WorkspaceView: FC<{ ws: WorkspaceState }> = ({ ws }) => {
  const [showTicket, setShowTicket] = useState(false)
  const [host, setHost] = useState<HostConfig | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [showIntegrations, setShowIntegrations] = useState(false)

  useEffect(() => {
    void Promise.all([window.api.host.get(ws.hostId), window.api.settings.get()]).then(([h, s]) => {
      setHost(h ?? null)
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

  if (ws.status !== 'connected') {
    return (
      <Centered icon={<Loader2 size={36} className="animate-spin text-amber-400" />}>
        <p className="text-sm font-medium capitalize text-neutral-300">{ws.status}…</p>
        <p className="text-xs text-neutral-500">Connecting to {ws.remotePath}</p>
      </Centered>
    )
  }

  const showTicketBtn = showIntegrations && (ws.derived.issueKey || ws.derived.branch)
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-neutral-800 px-4 py-1.5 text-xs text-neutral-400">
        <span className="flex items-center gap-1.5">
          <Server size={13} className="text-emerald-400" /> connected
        </span>
        <span className="max-w-[40%] truncate font-mono text-neutral-500">{ws.remotePath}</span>
        {ws.derived.branch && (
          <span className="flex items-center gap-1">
            <GitBranch size={12} /> {ws.derived.branch}
            {ws.derived.dirty && <span className="text-amber-400">•</span>}
          </span>
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
            <BrowserPane wsId={ws.id} defaultUrl={ws.derived.browserUrl} />
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
                  key={ws.id}
                  wsId={ws.id}
                  cwd={ws.remotePath}
                  hasServices={(host?.services.length ?? 0) > 0}
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
