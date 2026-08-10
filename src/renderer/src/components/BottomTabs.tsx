import { useEffect, useState, type FC, type ReactNode } from 'react'
import { Bot, Bug, ScrollText, TerminalSquare } from 'lucide-react'
import type { TerminalInfo } from '../../../shared/types'
import { TerminalPane } from './Terminal'
import { DevPanel } from './DevPanel'
import { DevToolsPanel } from './DevToolsPanel'
import { AgentPanel } from './AgentPanel'
import { useAgentStore } from '../store/agent'

type BottomTab = 'agent' | 'terminal' | 'logs' | 'devtools'

type BottomTabsProps = {
  wsId: string
  cwd: string
  sessions: TerminalInfo[]
  hasServices?: boolean
  workspaceActive?: boolean
  connected?: boolean
}

export const BottomTabs: FC<BottomTabsProps> = ({
  wsId,
  cwd,
  sessions,
  hasServices = true,
  workspaceActive = true,
  connected = true
}) => {
  const [tab, setTab] = useState<BottomTab>('agent')
  const active: BottomTab = tab === 'logs' && !hasServices ? 'terminal' : tab
  const agentBusy = useAgentStore((s) => (s.sessions[wsId]?.turn ?? 'idle') !== 'idle')
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
        <TabBtn active={active === 'agent'} onClick={() => setTab('agent')}>
          <Bot size={12} /> Agent
          {agentBusy && <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />}
        </TabBtn>
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
        {/* Terminal stays mounted — switching tabs must not kill running AI sessions */}
        <div className={`absolute inset-0 ${active === 'terminal' ? '' : 'hidden'}`}>
          <TerminalPane key={wsId} wsId={wsId} cwd={cwd} sessions={sessions} connected={connected} />
        </div>
        {/* Same for the agent: the transcript lives in main, but an unmount would
            throw away scroll position and whatever is half-typed in the composer */}
        <div className={`absolute inset-0 ${active === 'agent' ? '' : 'hidden'}`}>
          <AgentPanel key={wsId} wsId={wsId} visible={active === 'agent'} />
        </div>
        {active === 'devtools' && <DevToolsPanel wsId={wsId} visible={showDevtools} />}
        {active === 'logs' && hasServices && <DevPanel wsId={wsId} />}
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
