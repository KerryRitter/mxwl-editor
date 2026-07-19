import { useEffect, useRef, useState, type FC, type ReactNode } from 'react'
import { Loader2, Play, RotateCw, Square } from 'lucide-react'
import type { DevStatus, PresetService } from '../../../shared/types'

type LogLine = {
  stream: 'stdout' | 'stderr'
  line: string
  ts: number
}

const statusColor: Record<DevStatus, string> = {
  unknown: 'bg-neutral-600',
  starting: 'bg-amber-400',
  running: 'bg-emerald-500',
  stopped: 'bg-neutral-600',
  error: 'bg-red-500'
}

export const DevPanel: FC<{ wsId: string }> = ({ wsId }) => {
  const [services, setServices] = useState<PresetService[]>([])
  const [activeApp, setActiveApp] = useState<string>('')
  const [logs, setLogs] = useState<Record<string, LogLine[]>>({})
  const [status, setStatus] = useState<Record<string, DevStatus>>({})
  const [tailing, setTailing] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void window.api.dev.services(wsId).then((list) => {
      setServices(list)
      setActiveApp((prev) => prev || list[0]?.id || '')
      const emptyLogs: Record<string, LogLine[]> = {}
      const emptyStatus: Record<string, DevStatus> = {}
      for (const s of list) {
        emptyLogs[s.id] = []
        emptyStatus[s.id] = 'unknown'
      }
      setLogs(emptyLogs)
      setStatus(emptyStatus)
    })
  }, [wsId])

  useEffect(() => {
    const offLog = window.api.on('dev:logs', (...args: unknown[]) => {
      const p = args[0] as { wsId: string; app: string; stream: 'stdout' | 'stderr'; line: string }
      if (p?.wsId !== wsId) return
      setLogs((prev) => {
        const cur = prev[p.app] ?? []
        const next = [...cur, { stream: p.stream, line: p.line, ts: Date.now() }]
        if (next.length > 2000) next.splice(0, next.length - 2000)
        return { ...prev, [p.app]: next }
      })
    })
    const offStatus = window.api.on('dev:status', (...args: unknown[]) => {
      const p = args[0] as { wsId: string; app: string; status: DevStatus }
      if (p?.wsId !== wsId) return
      setStatus((prev) => ({ ...prev, [p.app]: p.status }))
    })
    return () => {
      offLog()
      offStatus()
    }
  }, [wsId])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs, activeApp])

  if (services.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-950 px-4 text-center text-xs text-neutral-600">
        No services on this host. Edit Host → Dev services to add start/stop/logs commands.
      </div>
    )
  }

  async function run(app: string, action: 'start' | 'stop' | 'restart'): Promise<void> {
    const key = `${app}:${action}`
    setBusy((b) => ({ ...b, [key]: true }))
    try {
      await window.api.dev.run(wsId, app, action)
    } catch (err) {
      setLogs((prev) => ({
        ...prev,
        [app]: [
          ...(prev[app] ?? []),
          { stream: 'stderr', line: `[${action} failed: ${String(err)}]`, ts: Date.now() }
        ]
      }))
    } finally {
      setBusy((b) => ({ ...b, [key]: false }))
    }
  }

  async function toggleTail(app: string): Promise<void> {
    if (tailing[app]) {
      await window.api.dev.stopTail(wsId, app)
      setTailing((t) => ({ ...t, [app]: false }))
    } else {
      setTailing((t) => ({ ...t, [app]: true }))
      await window.api.dev.tail(wsId, app)
    }
  }

  const appLogs = logs[activeApp] ?? []

  return (
    <div className="flex h-full flex-col bg-neutral-950">
      <div className="flex items-center gap-1 border-b border-neutral-800 px-1.5 py-1">
        {services.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveApp(s.id)}
            className={`flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] ${
              activeApp === s.id
                ? 'bg-neutral-800 text-neutral-100'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusColor[status[s.id] ?? 'unknown']}`} />
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 border-b border-neutral-800 px-1.5 py-1">
        <ActionBtn
          disabled={busy[`${activeApp}:start`]}
          onClick={() => run(activeApp, 'start')}
          className="hover:text-emerald-400"
        >
          {busy[`${activeApp}:start`] ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          Start
        </ActionBtn>
        <ActionBtn
          disabled={busy[`${activeApp}:restart`]}
          onClick={() => run(activeApp, 'restart')}
          className="hover:text-amber-400"
        >
          {busy[`${activeApp}:restart`] ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <RotateCw size={12} />
          )}
          Restart
        </ActionBtn>
        <ActionBtn
          disabled={busy[`${activeApp}:stop`]}
          onClick={() => run(activeApp, 'stop')}
          className="hover:text-red-400"
        >
          {busy[`${activeApp}:stop`] ? <Loader2 size={12} className="animate-spin" /> : <Square size={11} />}
          Stop
        </ActionBtn>
        <button
          onClick={() => toggleTail(activeApp)}
          className={`ml-1 rounded px-2 py-1 text-[11px] ${
            tailing[activeApp]
              ? 'bg-emerald-600/20 text-emerald-300'
              : 'text-neutral-400 hover:bg-neutral-800'
          }`}
        >
          {tailing[activeApp] ? '■ Stop logs' : '▶ Tail logs'}
        </button>
        <button
          onClick={() => setLogs((prev) => ({ ...prev, [activeApp]: [] }))}
          className="ml-auto rounded px-2 py-1 text-[11px] text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
        >
          Clear
        </button>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto px-2 py-1 font-mono text-[11px] leading-relaxed"
      >
        {appLogs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-neutral-700">
            No log output. Tail logs to stream.
          </div>
        ) : (
          appLogs.map((l, i) => (
            <div key={i} className={l.stream === 'stderr' ? 'text-red-400' : 'text-neutral-300'}>
              {l.line}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

const ActionBtn: FC<{
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  className?: string
}> = ({ children, onClick, disabled, className }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] text-neutral-300 hover:bg-neutral-800 disabled:opacity-40 ${className ?? ''}`}
  >
    {children}
  </button>
)
