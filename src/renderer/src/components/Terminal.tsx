import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { Plus, RotateCw, Trash2 } from 'lucide-react'

type TerminalPaneProps = {
  wsId: string
  cwd: string
  connected?: boolean
}

type TermInstance = {
  term: XTerm
  fit: FitAddon
  sessionId: string
  container: HTMLDivElement
  off: () => void
  offClosed: () => void
  ro: ResizeObserver
  alive: boolean
}

export function TerminalPane({
  wsId,
  cwd,
  connected = true
}: TerminalPaneProps): JSX.Element {
  const stackRef = useRef<HTMLDivElement>(null)
  const instancesRef = useRef<Map<string, TermInstance>>(new Map())
  const creatingRef = useRef(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [ids, setIds] = useState<string[]>([])
  const [deadIds, setDeadIds] = useState<Set<string>>(new Set())
  const activeIdRef = useRef<string | null>(null)
  activeIdRef.current = activeId

  useEffect(() => {
    if (!connected) return
    if (instancesRef.current.size > 0) return
    void createSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId, connected])

  useEffect(() => {
    return () => {
      for (const inst of instancesRef.current.values()) destroyInstance(inst, wsId)
      instancesRef.current.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId])

  async function createSession(): Promise<void> {
    if (creatingRef.current) return
    const stack = stackRef.current
    if (!stack) return
    creatingRef.current = true

    const container = document.createElement('div')
    container.style.position = 'absolute'
    container.style.inset = '0'
    container.style.display = 'none'
    stack.appendChild(container)

    const term = new XTerm({
      fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
      fontSize: 13,
      cursorBlink: true,
      theme: darkTheme,
      scrollback: 10000,
      allowProposedApi: true
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.open(container)
    try {
      fit.fit()
    } catch {
      void fit
    }

    let sessionId = ''
    try {
      sessionId = await openWithRetry(wsId, cwd, term.cols, term.rows)
    } catch (err) {
      term.writeln(`\x1b[31mFailed to open terminal: ${String(err)}\x1b[0m`)
      term.writeln('\x1b[90mClick + to retry when connected.\x1b[0m')
      container.style.display = 'block'
      creatingRef.current = false
      return
    }

    term.onData((data) => {
      const inst = instancesRef.current.get(sessionId)
      if (!inst?.alive) return
      void window.api.terminal.input(wsId, sessionId, data)
    })
    term.onResize(({ cols, rows }) => {
      const inst = instancesRef.current.get(sessionId)
      if (!inst?.alive) return
      void window.api.terminal.resize(wsId, sessionId, cols, rows)
    })

    const off = window.api.on('terminal:output', (...args: unknown[]) => {
      const payload = args[0] as { wsId: string; sessionId: string; data: string }
      if (payload?.wsId === wsId && payload.sessionId === sessionId) {
        term.write(payload.data)
      }
    })

    const offClosed = window.api.on('terminal:closed', (...args: unknown[]) => {
      const payload = args[0] as { wsId: string; sessionId: string }
      if (payload?.wsId !== wsId || payload.sessionId !== sessionId) return
      const inst = instancesRef.current.get(sessionId)
      if (inst) inst.alive = false
      setDeadIds((prev) => new Set(prev).add(sessionId))
    })

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        void fit
      }
    })
    ro.observe(container)

    const inst: TermInstance = {
      term,
      fit,
      sessionId,
      container,
      off,
      offClosed,
      ro,
      alive: true
    }
    instancesRef.current.set(sessionId, inst)
    setIds((prev) => [...prev, sessionId])
    activeIdRef.current = sessionId
    setActiveId(sessionId)
    container.style.display = 'block'
    creatingRef.current = false
    requestAnimationFrame(() => {
      try {
        fit.fit()
        term.focus()
        void window.api.terminal.resize(wsId, sessionId, term.cols, term.rows)
      } catch {
        void sessionId
      }
    })
  }

  function showActive(): void {
    for (const [id, inst] of instancesRef.current) {
      inst.container.style.display = id === activeIdRef.current ? 'block' : 'none'
    }
  }

  function activate(id: string): void {
    setActiveId(id)
    requestAnimationFrame(() => {
      for (const [iid, inst] of instancesRef.current) {
        inst.container.style.display = iid === id ? 'block' : 'none'
      }
      const inst = instancesRef.current.get(id)
      try {
        inst?.fit.fit()
        inst?.term.focus()
      } catch {
        void id
      }
    })
  }

  function closeSession(id: string): void {
    const inst = instancesRef.current.get(id)
    if (!inst) return
    destroyInstance(inst, wsId)
    instancesRef.current.delete(id)
    setDeadIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setIds((prev) => {
      const next = prev.filter((x) => x !== id)
      if (activeIdRef.current === id) setActiveId(next[0] ?? null)
      requestAnimationFrame(showActive)
      return next
    })
  }

  async function respawn(id: string): Promise<void> {
    closeSession(id)
    if (connected) await createSession()
  }

  const activeDead = activeId ? deadIds.has(activeId) : false

  return (
    <div className="flex h-full flex-col bg-neutral-950">
      <div className="flex items-center gap-1 border-b border-neutral-800 px-1.5 py-1">
        {ids.map((id) => (
          <button
            key={id}
            onClick={() => activate(id)}
            className={`rounded px-2 py-0.5 text-[11px] ${
              activeId === id
                ? 'bg-neutral-800 text-neutral-100'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            shell{deadIds.has(id) ? ' ✕' : ''}
          </button>
        ))}
        <button
          onClick={() => void createSession()}
          title="New shell"
          disabled={!connected || creatingRef.current}
          className="ml-1 rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-40"
        >
          <Plus size={12} />
        </button>
        {activeDead && (
          <button
            onClick={() => activeId && void respawn(activeId)}
            title="Reopen shell"
            disabled={!connected}
            className="flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 text-[11px] text-amber-300 hover:bg-amber-500/30 disabled:opacity-40"
          >
            <RotateCw size={11} /> Reopen
          </button>
        )}
        {activeId && ids.length > 1 && (
          <button
            onClick={() => closeSession(activeId)}
            title="Close shell"
            className="rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-red-400"
          >
            <Trash2 size={12} />
          </button>
        )}
        {!connected && (
          <span className="ml-auto text-[11px] text-amber-400">reconnecting…</span>
        )}
      </div>
      <div ref={stackRef} className="relative min-h-0 flex-1" />
    </div>
  )
}

async function openWithRetry(
  wsId: string,
  cwd: string,
  cols: number,
  rows: number
): Promise<string> {
  let lastErr: unknown
  for (let i = 0; i < 8; i++) {
    try {
      return await window.api.terminal.open(wsId, { cwd, cols, rows })
    } catch (err) {
      lastErr = err
      const msg = String(err)
      const retryable = /not connected|not ready|reconnecting/i.test(msg)
      if (!retryable || i === 7) break
      await sleep(300 * 2 ** i)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function destroyInstance(inst: TermInstance, wsId: string): void {
  inst.alive = false
  inst.ro.disconnect()
  inst.off()
  inst.offClosed()
  void window.api.terminal.close(wsId, inst.sessionId).catch(() => undefined)
  inst.term.dispose()
  inst.container.remove()
}

const darkTheme = {
  background: '#0a0a0a',
  foreground: '#e5e5e5',
  cursor: '#e5e5e5',
  cursorAccent: '#0a0a0a',
  selectionBackground: '#264f78',
  black: '#000000',
  red: '#e06c75',
  green: '#98c379',
  yellow: '#e5c07b',
  blue: '#61afef',
  magenta: '#c678dd',
  cyan: '#56b6c2',
  white: '#e5e5e5',
  brightBlack: '#5c5c5c',
  brightRed: '#ff6b6b',
  brightGreen: '#98c379',
  brightYellow: '#e5c07b',
  brightBlue: '#61afef',
  brightMagenta: '#c678dd',
  brightCyan: '#56b6c2',
  brightWhite: '#ffffff'
} as const
