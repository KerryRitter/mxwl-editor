import { useEffect, useRef, useState, type FC } from 'react'
import { Bell, BellRing, Bot, CheckCheck, CircleAlert, CircleCheck, CircleX, Trash2, X } from 'lucide-react'
import { useNotificationsStore, type AgentNotification } from '../store/notifications'
import { useWorkspacesStore } from '../store/workspaces'
import { useNavigationStore } from '../store/navigation'
import { useAgentStore } from '../store/agent'
import { useHostsStore } from '../store/hosts'
import { agentActivity } from '../../../shared/agentActivity'

export const AgentNotificationBell: FC = () => {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'queue' | 'fleet'>('queue')
  const [toast, setToast] = useState<AgentNotification | null>(null)
  const items = useNotificationsStore((state) => state.items)
  const lastDelivery = useNotificationsStore((state) => state.lastDelivery)
  const markRead = useNotificationsStore((state) => state.markRead)
  const markAllRead = useNotificationsStore((state) => state.markAllRead)
  const clear = useNotificationsStore((state) => state.clear)
  const workspaces = useWorkspacesStore((state) => state.workspaces)
  const sessions = useAgentStore((state) => state.sessions)
  const hosts = useHostsStore((state) => state.hosts)
  const activeId = useWorkspacesStore((state) => state.activeId)
  const setActive = useWorkspacesStore((state) => state.setActive)
  const focusPanel = useNavigationStore((state) => state.focus)
  const newestSeen = useRef(items[0]?.id)
  const unread = items.filter((item) => !item.read).length
  const fleet = Object.values(sessions)
    .map((session) => {
      const workspace = workspaces.find((candidate) => candidate.id === session.wsId)
      return {
        session,
        workspace,
        host: hosts.find((candidate) => candidate.id === workspace?.hostId),
        activity: agentActivity(session)
      }
    })
    .sort((a, b) => activityRank(a.activity.state) - activityRank(b.activity.state))

  const workspaceTitle = (wsId: string): string =>
    workspaces.find((workspace) => workspace.id === wsId)?.title ?? 'Closed workspace'

  const jumpToAgent = (item: AgentNotification): void => {
    const workspace = workspaces.find((candidate) => candidate.id === item.wsId)
    markRead(item.id)
    setToast(null)
    setOpen(false)
    if (!workspace) return
    setActive(workspace.id)
    void window.api.browser.activate(workspace.id)
    focusPanel(workspace.id, 'agent')
  }

  const jumpToWorkspaceAgent = (wsId: string): void => {
    const workspace = workspaces.find((candidate) => candidate.id === wsId)
    setOpen(false)
    if (!workspace) return
    setActive(workspace.id)
    void window.api.browser.activate(workspace.id)
    focusPanel(workspace.id, 'agent')
  }

  useEffect(() => {
    const newest = items[0]
    if (!newest || newest.id === newestSeen.current) return
    newestSeen.current = newest.id

    // The bell always records it. Like Herdr, avoid interrupting the workspace
    // the user is already watching.
    if (!lastDelivery?.popup || lastDelivery.id !== newest.id || newest.wsId === activeId) return
    setToast(newest)
    if (lastDelivery.sound) playChime()
    const timer = setTimeout(() => setToast((current) => (current?.id === newest.id ? null : current)), 7000)

    return () => clearTimeout(timer)
    // A new item is the trigger; active/workspace updates should not replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items[0]?.id, lastDelivery?.id])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Agent notifications"
        title={`${unread || 'No'} unread agent ${unread === 1 ? 'notification' : 'notifications'}`}
        className={`relative rounded p-1 hover:bg-neutral-800 ${
          unread ? 'text-amber-300' : 'text-neutral-400 hover:text-neutral-100'
        }`}
      >
        {unread ? <BellRing size={15} /> : <Bell size={15} />}
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-amber-400 px-1 text-center text-[9px] font-semibold leading-4 text-neutral-950">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-[70] flex max-h-[560px] w-[430px] flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-950 shadow-2xl shadow-black/70">
          <div className="flex shrink-0 items-center gap-2 border-b border-neutral-800 px-3 py-2">
            <Bell size={13} className="text-amber-300" />
            <span className="text-xs font-medium text-neutral-100">Agent control</span>
            <span className="text-[10px] text-neutral-600">{unread} unread</span>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unread === 0}
              title="Mark all read"
              className="ml-auto rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-30"
            >
              <CheckCheck size={13} />
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={items.length === 0}
              title="Clear notifications"
              className="rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-red-300 disabled:opacity-30"
            >
              <Trash2 size={12} />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              title="Close notifications"
              className="rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
            >
              <X size={13} />
            </button>
          </div>

          <div className="flex shrink-0 border-b border-neutral-800 bg-neutral-900/50 px-2 pt-1.5">
            <button
              type="button"
              onClick={() => setView('queue')}
              className={`border-b-2 px-3 py-1.5 text-[10px] ${
                view === 'queue'
                  ? 'border-amber-400 text-neutral-100'
                  : 'border-transparent text-neutral-500 hover:text-neutral-300'
              }`}
            >
              Attention queue · {unread}
            </button>
            <button
              type="button"
              onClick={() => setView('fleet')}
              className={`border-b-2 px-3 py-1.5 text-[10px] ${
                view === 'fleet'
                  ? 'border-violet-400 text-neutral-100'
                  : 'border-transparent text-neutral-500 hover:text-neutral-300'
              }`}
            >
              Live agents · {fleet.length}
            </button>
          </div>

          <div className="min-h-0 overflow-y-auto">
            {view === 'queue' && items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => jumpToAgent(item)}
                className={`flex w-full gap-2.5 border-b border-neutral-900 px-3 py-2.5 text-left hover:bg-neutral-900 ${
                  item.read ? 'opacity-60' : ''
                }`}
              >
                <NotificationIcon kind={item.kind} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[11px] font-medium text-neutral-200">
                      {item.title}
                    </span>
                    {!item.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-violet-300">
                    {workspaceTitle(item.wsId)}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-[10px] leading-relaxed text-neutral-500">
                    {item.detail}
                  </span>
                </span>
                <span className="shrink-0 text-[9px] text-neutral-700">{relativeTime(item.createdAt)}</span>
              </button>
            ))}
            {view === 'queue' && items.length === 0 && (
              <div className="px-5 py-10 text-center text-[11px] text-neutral-600">
                Agent completions, approvals, and failures will show up here.
              </div>
            )}
            {view === 'fleet' && fleet.map(({ session, workspace, host, activity }) => (
              <button
                key={session.wsId}
                type="button"
                onClick={() => jumpToWorkspaceAgent(session.wsId)}
                className="flex w-full items-start gap-2.5 border-b border-neutral-900 px-3 py-3 text-left hover:bg-neutral-900"
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${activityColor(activity.state)}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <Bot size={12} className="text-violet-300" />
                    <span className="truncate text-[11px] font-medium text-neutral-200">
                      {workspace?.title ?? session.cwd}
                    </span>
                    <span className="shrink-0 text-[9px] uppercase tracking-wide text-neutral-600">
                      {activity.state}
                    </span>
                  </span>
                  <span className="mt-1 block truncate text-[10px] text-neutral-400">
                    {activity.summary}
                  </span>
                  <span className="mt-0.5 block truncate text-[9px] text-neutral-700">
                    {host?.label ?? 'Unknown host'} · {session.agentLabel}
                  </span>
                </span>
              </button>
            ))}
            {view === 'fleet' && fleet.length === 0 && (
              <div className="px-5 py-10 text-center text-[11px] text-neutral-600">
                Open an Agent tab to add it to the live fleet.
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <button
          type="button"
          onClick={() => jumpToAgent(toast)}
          className="fixed bottom-5 right-5 z-[80] flex w-[340px] gap-2.5 rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-left shadow-2xl shadow-black/70 hover:border-neutral-600"
        >
          <NotificationIcon kind={toast.kind} />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-neutral-100">{toast.title}</span>
            <span className="mt-0.5 block text-[10px] text-violet-300">
              {workspaceTitle(toast.wsId)}
            </span>
            <span className="mt-1 line-clamp-2 block text-[10px] text-neutral-400">{toast.detail}</span>
          </span>
          <X
            size={12}
            className="shrink-0 text-neutral-600 hover:text-neutral-300"
            onClick={(event) => {
              event.stopPropagation()
              setToast(null)
            }}
          />
        </button>
      )}
    </div>
  )
}

const NotificationIcon: FC<{ kind: AgentNotification['kind'] }> = ({ kind }) => {
  if (kind === 'done') return <CircleCheck size={14} className="mt-0.5 shrink-0 text-emerald-400" />
  if (kind === 'attention') return <CircleAlert size={14} className="mt-0.5 shrink-0 text-amber-400" />
  return <CircleX size={14} className="mt-0.5 shrink-0 text-red-400" />
}

function relativeTime(createdAt: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - createdAt) / 1000))
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

function activityRank(state: ReturnType<typeof agentActivity>['state']): number {
  return { attention: 0, error: 1, working: 2, starting: 3, idle: 4 }[state]
}

function activityColor(state: ReturnType<typeof agentActivity>['state']): string {
  return {
    attention: 'bg-amber-400',
    error: 'bg-red-500',
    working: 'animate-pulse bg-sky-400',
    starting: 'animate-pulse bg-violet-400',
    idle: 'bg-neutral-600'
  }[state]
}

function playChime(): void {
  try {
    const context = new window.AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.setValueAtTime(740, context.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(980, context.currentTime + 0.12)
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.24)
    oscillator.onended = () => void context.close()
  } catch {
    // Audio devices and autoplay policies vary; the bell still records the event.
  }
}
