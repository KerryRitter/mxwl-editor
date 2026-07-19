import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

interface TerminalPaneProps {
  wsId: string
  cwd: string
}

interface TermInstance {
  term: XTerm
  fit: FitAddon
  sessionId: string
  container: HTMLDivElement
  off: () => void
  ro: ResizeObserver
}

export function TerminalPane({ wsId, cwd }: TerminalPaneProps): JSX.Element {
  const stackRef = useRef<HTMLDivElement>(null)
  const instancesRef = useRef<Map<string, TermInstance>>(new Map())
  const [activeId, setActiveId] = useState<string | null>(null)
  const [ids, setIds] = useState<string[]>([])

  useEffect(() => {
    createSession()
    return () => {
      for (const inst of instancesRef.current.values()) destroyInstance(inst, wsId)
      instancesRef.current.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId])

  async function createSession(): Promise<void> {
    const stack = stackRef.current
    if (!stack) return

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
      sessionId = await window.api.terminal.open(wsId, {
        cwd,
        cols: term.cols,
        rows: term.rows
      })
    } catch (err) {
      term.writeln(`\x1b[31mFailed to open terminal: ${String(err)}\x1b[0m`)
      container.style.display = 'block'
      return
    }

    term.onData((data) => window.api.terminal.input(wsId, sessionId, data))
    term.onResize(({ cols, rows }) =>
      window.api.terminal.resize(wsId, sessionId, cols, rows)
    )

    const off = window.api.on('terminal:output', (...args: unknown[]) => {
      const payload = args[0] as { wsId: string; sessionId: string; data: string }
      if (payload?.wsId === wsId && payload.sessionId === sessionId) {
        term.write(payload.data)
      }
    })

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        void fit
      }
    })
    ro.observe(container)

    const inst: TermInstance = { term, fit, sessionId, container, off, ro }
    instancesRef.current.set(sessionId, inst)
    setIds((prev) => [...prev, sessionId])
    activeIdRef.current = sessionId
    setActiveId(sessionId)
    container.style.display = 'block'
    requestAnimationFrame(() => {
      try {
        fit.fit()
        term.focus()
        window.api.terminal.resize(wsId, sessionId, term.cols, term.rows)
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
    setIds((prev) => {
      const next = prev.filter((x) => x !== id)
      if (activeIdRef.current === id) setActiveId(next[0] ?? null)
      requestAnimationFrame(showActive)
      return next
    })
  }

  const activeIdRef = useRef<string | null>(null)
  activeIdRef.current = activeId

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
            shell
          </button>
        ))}
        <button
          onClick={createSession}
          title="New shell"
          className="ml-1 rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
        >
          <Plus size={12} />
        </button>
        {activeId && ids.length > 1 && (
          <button
            onClick={() => closeSession(activeId)}
            title="Close shell"
            className="rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-red-400"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
      <div ref={stackRef} className="relative min-h-0 flex-1" />
    </div>
  )
}

function destroyInstance(inst: TermInstance, wsId: string): void {
  inst.ro.disconnect()
  inst.off()
  window.api.terminal.close(wsId, inst.sessionId).catch(() => undefined)
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
