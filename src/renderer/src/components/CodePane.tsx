import { useEffect, useState, type FC } from 'react'
import { FileCode2, GitCompare, Maximize2, Minimize2 } from 'lucide-react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import type { WorkspaceState } from '../../../shared/types'
import { useEditorStore } from '../store/editor'
import { DiffViewer } from './DiffViewer'
import { Editor } from './Editor'
import { FileTree } from './FileTree'
import { SearchPanel } from './SearchPanel'
import { useNavigationStore } from '../store/navigation'
import { useAgentStore } from '../store/agent'

type CodeTab = 'code' | 'changes'

export const CodePane: FC<{
  ws: WorkspaceState
  active: boolean
  searchOpen: boolean
  onCloseSearch: () => void
  maximized?: boolean
  onToggleMaximize?: () => void
}> = ({ ws, active, searchOpen, onCloseSearch, maximized = false, onToggleMaximize }) => {
  const storageKey = `mxwl.workspace.${ws.hostId}::${ws.remotePath}`
  const [tab, setTabState] = useState<CodeTab>(() =>
    localStorage.getItem(`${storageKey}.codeTab`) === 'changes' ? 'changes' : 'code'
  )
  const openFile = useEditorStore((state) => state.open)
  const focusRequest = useNavigationStore((state) => state.requests[ws.id])
  const focusPanel = useNavigationStore((state) => state.focus)
  const askAgent = useAgentStore((state) => state.ask)

  const setTab = (next: CodeTab): void => {
    setTabState(next)
    localStorage.setItem(`${storageKey}.codeTab`, next)
  }

  useEffect(() => {
    if (focusRequest?.target === 'code') setTab('code')
    if (focusRequest?.target === 'changes') setTab('changes')
  }, [focusRequest?.seq]) // eslint-disable-line react-hooks/exhaustive-deps

  const openFromDiff = (relativePath: string): void => {
    const path = `${ws.remotePath.replace(/\/$/, '')}/${relativePath}`
    openFile(ws.id, path)
    setTab('code')
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-950">
      <div className="flex h-8 shrink-0 items-end border-b border-neutral-800 bg-neutral-950 px-1.5">
        <PaneTab active={tab === 'code'} onClick={() => setTab('code')}>
          <FileCode2 size={12} /> Code
        </PaneTab>
        <PaneTab active={tab === 'changes'} onClick={() => setTab('changes')} dirty={ws.derived.dirty}>
          <GitCompare size={12} /> Changes
        </PaneTab>
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
        <div className={`absolute inset-0 ${tab === 'code' ? '' : 'hidden'}`}>
          <PanelGroup
            direction="horizontal"
            autoSaveId={`${storageKey}.codeSplit`}
            className="h-full"
          >
            <Panel defaultSize={22} minSize={12} maxSize={45}>
              {searchOpen ? (
                <SearchPanel wsId={ws.id} onClose={onCloseSearch} />
              ) : (
                <FileTree wsId={ws.id} root={ws.remotePath} enabled={active && tab === 'code'} />
              )}
            </Panel>
            <PanelResizeHandle className="w-1 bg-neutral-800 hover:bg-neutral-700" />
            <Panel defaultSize={78} minSize={30}>
              <Editor wsId={ws.id} storageKey={storageKey} />
            </Panel>
          </PanelGroup>
        </div>
        <div className={`absolute inset-0 ${tab === 'changes' ? '' : 'hidden'}`}>
          <DiffViewer
            wsId={ws.id}
            storageKey={storageKey}
            visible={active && tab === 'changes'}
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
      </div>
    </div>
  )
}

const PaneTab: FC<{
  active: boolean
  dirty?: boolean
  onClick: () => void
  children: React.ReactNode
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
