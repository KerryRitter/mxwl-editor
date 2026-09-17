import { useEffect, useMemo, useState, type FC, type ReactNode } from 'react'
import {
  FileCode2,
  GitBranch,
  GitCompare,
  Globe2,
  ListChecks,
  Maximize2,
  Minimize2,
  Puzzle
} from 'lucide-react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import type { PluginIcon } from '../../../shared/plugins'
import type { WorkspaceState } from '../../../shared/types'
import { useEditorStore } from '../store/editor'
import { useNavigationStore } from '../store/navigation'
import { useAgentStore } from '../store/agent'
import { usePluginsStore, workspaceTools, type WorkspaceToolRegistration } from '../store/plugins'
import { DiffViewer } from './DiffViewer'
import { Editor } from './Editor'
import { ExternalPluginTool } from './ExternalPluginTool'
import { FileTree } from './FileTree'
import { SearchPanel } from './SearchPanel'

const CODE_KEY = 'mxwl.code:code'
const CHANGES_KEY = 'mxwl.changes:changes'

export const CodePane: FC<{
  ws: WorkspaceState
  active: boolean
  searchOpen: boolean
  onCloseSearch: () => void
  maximized?: boolean
  onToggleMaximize?: () => void
}> = ({ ws, active, searchOpen, onCloseSearch, maximized = false, onToggleMaximize }) => {
  const storageKey = `mxwl.workspace.${ws.hostId}::${ws.remotePath}`
  const catalog = usePluginsStore((state) => state.catalog)
  const loaded = usePluginsStore((state) => state.loaded)
  const tools = useMemo(() => workspaceTools(catalog), [catalog])
  const [selectedKey, setSelectedKeyState] = useState(() => {
    const saved = localStorage.getItem(`${storageKey}.workspaceTool`)
    if (saved) return saved
    return localStorage.getItem(`${storageKey}.codeTab`) === 'changes' ? CHANGES_KEY : CODE_KEY
  })
  const openFile = useEditorStore((state) => state.open)
  const focusRequest = useNavigationStore((state) => state.requests[ws.id])
  const focusPanel = useNavigationStore((state) => state.focus)
  const askAgent = useAgentStore((state) => state.ask)
  const codeEnabled = tools.some((tool) => tool.key === CODE_KEY)

  const setSelectedKey = (key: string): void => {
    setSelectedKeyState(key)
    localStorage.setItem(`${storageKey}.workspaceTool`, key)
  }

  useEffect(() => {
    if (!loaded) return
    if (!tools.some((tool) => tool.key === selectedKey)) {
      const fallback = tools[0]?.key ?? ''
      setSelectedKeyState(fallback)
      if (fallback) localStorage.setItem(`${storageKey}.workspaceTool`, fallback)
    }
  }, [loaded, selectedKey, storageKey, tools])

  useEffect(() => {
    if (focusRequest?.target === 'code' && codeEnabled) setSelectedKey(CODE_KEY)
    if (focusRequest?.target === 'changes' && tools.some((tool) => tool.key === CHANGES_KEY)) {
      setSelectedKey(CHANGES_KEY)
    }
    if (focusRequest?.target.startsWith('plugin:')) {
      const requested = focusRequest.target.slice('plugin:'.length)
      if (tools.some((tool) => tool.key === requested)) setSelectedKey(requested)
    }
    // A sequence is the event. Tool changes are handled by the fallback effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.seq])

  const openFromDiff = codeEnabled
    ? (relativePath: string): void => {
        const path = `${ws.remotePath.replace(/\/$/, '')}/${relativePath}`
        openFile(ws.id, path)
        setSelectedKey(CODE_KEY)
      }
    : undefined

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-950">
      <div className="flex h-8 shrink-0 items-end border-b border-neutral-800 bg-neutral-950 px-1.5">
        {tools.map((tool) => (
          <PaneTab
            key={tool.key}
            active={selectedKey === tool.key}
            onClick={() => setSelectedKey(tool.key)}
            dirty={tool.key === CHANGES_KEY && ws.derived.dirty}
          >
            <ToolIcon icon={tool.contribution.icon} /> {tool.contribution.title}
          </PaneTab>
        ))}
        {onToggleMaximize && (
          <button
            type="button"
            onClick={onToggleMaximize}
            title={`${maximized ? 'Restore layout' : 'Maximize code pane'} (Ctrl+Shift+2)`}
            className="mb-1 ml-auto rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
          >
            {maximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        {loaded && tools.length === 0 && (
          <div className="grid h-full place-items-center px-8 text-center">
            <div>
              <Puzzle size={28} className="mx-auto text-neutral-700" />
              <p className="mt-3 text-xs text-neutral-400">No workspace tools are enabled.</p>
              <p className="mt-1 text-[10px] text-neutral-600">
                Enable Code, Changes, or a custom plugin in Settings → Plugins.
              </p>
            </div>
          </div>
        )}
        {tools.map((tool) => (
          <div
            key={tool.key}
            className={`absolute inset-0 ${selectedKey === tool.key ? '' : 'hidden'}`}
          >
            <WorkspaceTool
              tool={tool}
              ws={ws}
              visible={active && selectedKey === tool.key}
              storageKey={storageKey}
              searchOpen={searchOpen}
              onCloseSearch={onCloseSearch}
              onOpenCode={openFromDiff}
              onAskAgent={(prompt) => {
                askAgent(ws.id, prompt)
                focusPanel(ws.id, 'agent')
              }}
              onOpenUrl={(url) => {
                void window.api.browser.newTab(ws.id, url)
                focusPanel(ws.id, 'browser')
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

const WorkspaceTool: FC<{
  tool: WorkspaceToolRegistration
  ws: WorkspaceState
  visible: boolean
  storageKey: string
  searchOpen: boolean
  onCloseSearch: () => void
  onOpenCode?: (path: string) => void
  onAskAgent: (prompt: string) => void
  onOpenUrl: (url: string) => void
}> = ({
  tool,
  ws,
  visible,
  storageKey,
  searchOpen,
  onCloseSearch,
  onOpenCode,
  onAskAgent,
  onOpenUrl
}) => {
  if (tool.key === CODE_KEY) {
    return (
      <PanelGroup direction="horizontal" autoSaveId={`${storageKey}.codeSplit`} className="h-full">
        <Panel defaultSize={22} minSize={12} maxSize={45}>
          {searchOpen ? (
            <SearchPanel wsId={ws.id} onClose={onCloseSearch} />
          ) : (
            <FileTree wsId={ws.id} root={ws.remotePath} enabled={visible} />
          )}
        </Panel>
        <PanelResizeHandle className="w-1 bg-neutral-800 hover:bg-neutral-700" />
        <Panel defaultSize={78} minSize={30}>
          <Editor wsId={ws.id} storageKey={storageKey} />
        </Panel>
      </PanelGroup>
    )
  }

  if (tool.key === CHANGES_KEY) {
    return (
      <DiffViewer
        wsId={ws.id}
        storageKey={storageKey}
        visible={visible}
        onOpenCode={onOpenCode}
        onAskAgent={onAskAgent}
        onOpenUrl={onOpenUrl}
      />
    )
  }

  return <ExternalPluginTool tool={tool} ws={ws} visible={visible} />
}

const ToolIcon: FC<{ icon?: PluginIcon }> = ({ icon }) => {
  if (icon === 'code') return <FileCode2 size={12} />
  if (icon === 'diff') return <GitCompare size={12} />
  if (icon === 'tasks') return <ListChecks size={12} />
  if (icon === 'git') return <GitBranch size={12} />
  if (icon === 'globe') return <Globe2 size={12} />
  return <Puzzle size={12} />
}

const PaneTab: FC<{
  active: boolean
  dirty?: boolean
  onClick: () => void
  children: ReactNode
}> = ({ active, dirty, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`relative flex h-7 items-center gap-1.5 border-b-2 px-2.5 text-[11px] ${
      active
        ? 'border-violet-400 text-neutral-100'
        : 'border-transparent text-neutral-500 hover:text-neutral-300'
    }`}
  >
    {children}
    {dirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Uncommitted changes" />}
  </button>
)
