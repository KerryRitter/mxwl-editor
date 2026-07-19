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
}

export const BottomTabs: FC<BottomTabsProps> = ({ wsId, cwd, hasServices = true }) => {
  const [tab, setTab] = useState<BottomTab>('terminal')
  const active: BottomTab = tab === 'logs' && !hasServices ? 'terminal' : tab

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
      <div className="min-h-0 flex-1">
        {active === 'devtools' ? (
          <DevToolsPanel wsId={wsId} />
        ) : active === 'logs' && hasServices ? (
          <DevPanel wsId={wsId} />
        ) : (
          <TerminalPane key={wsId} wsId={wsId} cwd={cwd} />
        )}
      </div>
    </div>
  )
}

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
