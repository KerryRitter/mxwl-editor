import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Minus,
  Plus,
  RotateCw,
  Search,
  Terminal as TermIcon,
  Wrench,
  X
} from 'lucide-react'
import type { BrowserTab } from '../../../shared/types'

interface Snapshot {
  wsId: string
  activeId: string | null
  tabs: BrowserTab[]
}

interface BrowserPaneProps {
  wsId: string
  defaultUrl?: string
}

export function BrowserPane({ wsId, defaultUrl }: BrowserPaneProps): JSX.Element {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [snap, setSnap] = useState<Snapshot>({ wsId, activeId: null, tabs: [] })
  const [address, setAddress] = useState('')
  const active = snap.tabs.find((t) => t.id === snap.activeId) ?? null

  function sendBounds(): void {
    const el = viewportRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return
    void window.api.browser.setBounds(wsId, {
      x: Math.round(r.left),
      y: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height)
    })
  }

  useEffect(() => {
    let cancelled = false
    void window.api.browser.activate(wsId)
    void window.api.browser.setVisible(wsId, true)

    const off = window.api.on('browser:event', (...args: unknown[]) => {
      const s = args[0] as Snapshot
      if (s?.wsId === wsId && !cancelled) setSnap(s)
    })

    void window.api.browser.snapshot(wsId).then((s) => {
      if (cancelled || !s) return
      setSnap(s)
      if (s.tabs.length === 0) {
        void window.api.browser.newTab(wsId, defaultUrl || 'about:blank')
      }
    })

    const ro = new ResizeObserver(() => sendBounds())
    if (viewportRef.current) ro.observe(viewportRef.current)
    const raf = requestAnimationFrame(sendBounds)
    const onWinResize = (): void => sendBounds()
    window.addEventListener('resize', onWinResize)

    return () => {
      cancelled = true
      off()
      ro.disconnect()
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onWinResize)
      void window.api.browser.setVisible(wsId, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId])

  useEffect(() => {
    if (active) setAddress(active.url)
  }, [active?.url]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(sendBounds, 60)
    return () => clearTimeout(t)
  }, [snap.tabs.length, snap.activeId]) // eslint-disable-line react-hooks/exhaustive-deps

  function go(): void {
    if (!active) return
    void window.api.browser.navigate(wsId, active.id, address)
  }

  return (
    <div className="flex h-full flex-col bg-neutral-950">
      <div className="flex items-center gap-1 border-b border-neutral-800 px-1.5 py-1">
        <ChromeBtn
          disabled={!active?.canGoBack}
          onClick={() => active && window.api.browser.back(wsId, active.id)}
        >
          <ArrowLeft size={14} />
        </ChromeBtn>
        <ChromeBtn
          disabled={!active?.canGoForward}
          onClick={() => active && window.api.browser.forward(wsId, active.id)}
        >
          <ArrowRight size={14} />
        </ChromeBtn>
        <ChromeBtn onClick={() => active && window.api.browser.reload(wsId, active.id)}>
          <RotateCw size={13} />
        </ChromeBtn>

        <div className="mx-1 flex flex-1 items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1">
          <Search size={12} className="text-neutral-500" />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') go()
            }}
            placeholder="Search or enter address"
            className="min-w-0 flex-1 bg-transparent text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none"
          />
          {active && (
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                active.loading ? 'bg-amber-400' : 'bg-emerald-500'
              }`}
            />
          )}
        </div>

        <ChromeBtn
          onClick={() => active && window.api.browser.zoom(wsId, active.id, (active.zoom ?? 1) - 0.1)}
        >
          <Minus size={13} />
        </ChromeBtn>
        <span className="w-10 text-center text-[10px] text-neutral-500">
          {Math.round((active?.zoom ?? 1) * 100)}%
        </span>
        <ChromeBtn
          onClick={() => active && window.api.browser.zoom(wsId, active.id, (active.zoom ?? 1) + 0.1)}
        >
          <Plus size={13} />
        </ChromeBtn>
        <ChromeBtn onClick={() => active && window.api.browser.devtools(wsId, active.id)}>
          <Wrench size={13} />
        </ChromeBtn>
        <ChromeBtn
          onClick={() => active && window.open(address, '_blank')}
          title="Open in external browser"
        >
          <ExternalLink size={13} />
        </ChromeBtn>
      </div>

      <div className="flex items-center gap-0.5 overflow-x-auto border-b border-neutral-800 bg-neutral-950 px-1">
        {snap.tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => window.api.browser.setActive(wsId, tab.id)}
            className={`group flex max-w-[180px] cursor-pointer items-center gap-1.5 rounded-t px-2.5 py-1 text-xs ${
              tab.id === snap.activeId
                ? 'bg-neutral-900 text-neutral-100'
                : 'text-neutral-500 hover:bg-neutral-900/60'
            }`}
          >
            {tab.loading ? (
              <RotateCw size={10} className="animate-spin text-amber-400" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-neutral-600" />
            )}
            <span className="truncate">{tab.title || 'New Tab'}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                void window.api.browser.closeTab(wsId, tab.id)
              }}
              className="text-neutral-600 opacity-0 hover:text-red-400 group-hover:opacity-100"
            >
              <X size={11} />
            </button>
          </div>
        ))}
        <button
          onClick={() => void window.api.browser.newTab(wsId, 'about:blank')}
          className="ml-1 rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
          title="New tab"
        >
          <Plus size={13} />
        </button>
      </div>

      <div ref={viewportRef} className="relative min-h-0 flex-1 bg-neutral-900">
        {snap.tabs.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-neutral-600">
            <TermIcon size={28} />
            <span className="text-xs">No tabs open</span>
          </div>
        )}
      </div>
    </div>
  )
}

function ChromeBtn({
  children,
  onClick,
  disabled,
  title
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  title?: string
}): JSX.Element {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="rounded p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}
