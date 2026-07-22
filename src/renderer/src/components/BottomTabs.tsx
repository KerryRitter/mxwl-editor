import { useEffect, useState, type FC, type ReactNode } from 'react'
import { Bug, ScrollText, TerminalSquare } from 'lucide-react'
import { TerminalPane } from './Terminal'
import { DevPanel } from './DevPanel'
import { DevToolsPanel } from './DevToolsPanel'

type BottomTab = 'terminal' | 'logs' | 'devtools'

type BottomTabsProps = {
  wsId: string
  cwd: string
  hasServices?: boolean
  workspaceActive?: boolean
  connected?: boolean
}

export const BottomTabs: FC<BottomTabsProps> = ({
  wsId,
  cwd,
  hasServices = true,
  workspaceActive = true,
  connected = true
}) => {
  const [tab, setTab] = useState<BottomTab>('terminal')
  const active: BottomTab = tab === 'logs' && !hasServices ? 'terminal' : tab
  const showDevtools = workspaceActive && active === 'devtools'

  useEffect(() => {
    const off = window.api.on('browser:devtools-show', (...args: unknown[]) => {
      const p = args[0] as { wsId: string }
      if (p?.wsId === wsId) setTab('devtools')
    })
    return off
  }, [wsId])

  return (
    <div className="flex h-full flex-col bg-neutral-950">
      <div className="flex items-center gap-1 border-b border-neutral-800 px-1.5 py-0.5">
        <TabBtn active={active === 'terminal'} onClick={() => setTab('terminal')}>
          <TerminalSquare size={12} /> Terminal
        </TabBtn>
        {hasServices && (
          <TabBtn active={active === 'logs'} onClick={() => setTab('logs')}>
            <ScrollText size={12} /> Dev logs
          </TabBtn>
        )}
        <TabBtn active={active === 'devtools'} onClick={() => setTab('devtools')}>
          <Bug size={12} /> Dev Tools
        </TabBtn>
      </div>
      <div className="relative min-h-0 flex-1">
        <Pane visible={active === 'terminal'}>
          <TerminalPane wsId={wsId} cwd={cwd} connected={connected} />
        </Pane>
        {hasServices && (
          <Pane visible={active === 'logs'}>
            <DevPanel wsId={wsId} />
          </Pane>
        )}
        <Pane visible={active === 'devtools'}>
          <DevToolsPanel wsId={wsId} visible={showDevtools} />
        </Pane>
      </div>
    </div>
  )
}

const Pane: FC<{ visible: boolean; children: ReactNode }> = ({ visible, children }) => (
  <div
    className={`absolute inset-0 ${visible ? '' : 'invisible pointer-events-none'}`}
  >
    {children}
  </div>
)

const TabBtn: FC<{
  active: boolean
  onClick: () => void
  children: ReactNode
}> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] ${
      active ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-500 hover:text-neutral-300'
    }`}
  >
    {children}
  </button>
)
