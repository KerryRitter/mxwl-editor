import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Cookie,
  ExternalLink,
  Minus,
  Plus,
  RotateCw,
  Search,
  Terminal as TermIcon,
  Wrench,
  X
} from 'lucide-react'
import type { BrowserTab, TabGroup } from '../../../shared/types'
import { DEFAULT_GROUP_ID } from '../../../shared/tabGroups'

interface Snapshot {
  wsId: string
  activeId: string | null
  tabs: BrowserTab[]
  groups: TabGroup[]
}

interface BrowserPaneProps {
  wsId: string
  defaultUrl?: string
  active?: boolean
  canTestLogin?: boolean
}

export function BrowserPane({
  wsId,
  defaultUrl,
  active: wsActive = true,
  canTestLogin = false
}: BrowserPaneProps): JSX.Element {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [snap, setSnap] = useState<Snapshot>({ wsId, activeId: null, tabs: [], groups: [] })
  const [address, setAddress] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginErr, setLoginErr] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const active = snap.tabs.find((t) => t.id === snap.activeId) ?? null
  const groupOf = (tab: BrowserTab): TabGroup | undefined =>
    snap.groups.find((g) => g.id === tab.groupId)
  const activeColor = active ? groupOf(active)?.color : undefined
  // Keep each group's tabs contiguous so the colour bands read as blocks.
  const ordered = snap.groups.flatMap((g) => snap.tabs.filter((t) => t.groupId === g.id))

  function sendBounds(): void {
    if (!wsActive) return
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
    if (wsActive) {
      void window.api.browser.activate(wsId)
      void window.api.browser.setVisible(wsId, true)
    }

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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId])

  useEffect(() => {
    if (wsActive) {
      void window.api.browser.activate(wsId)
      void window.api.browser.setVisible(wsId, true)
      requestAnimationFrame(sendBounds)
    } else {
      void window.api.browser.setVisible(wsId, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsActive, wsId])

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

  async function loginAsTestUser(): Promise<void> {
    setLoginBusy(true)
    setLoginErr(null)
    try {
      await window.api.browser.testLogin(wsId)
    } catch (err) {
      setLoginErr(err instanceof Error ? err.message : String(err))
    } finally {
      setLoginBusy(false)
    }
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
        <ChromeBtn
          onClick={() => active && window.api.browser.reload(wsId, active.id)}
          title="Hard refresh (ignore cache)"
        >
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
        {canTestLogin && (
          <button
            type="button"
            disabled={!active || loginBusy}
            onClick={() => void loginAsTestUser()}
            title={loginErr ?? 'Fill login form with host test credentials'}
            className="rounded px-2 py-1 text-[11px] text-sky-300 hover:bg-neutral-800 disabled:opacity-40"
          >
            {loginBusy ? 'Logging in…' : 'Login as test user'}
          </button>
        )}
        <ChromeBtn
          onClick={() => active && window.open(address, '_blank')}
          title="Open in external browser"
        >
          <ExternalLink size={13} />
        </ChromeBtn>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto border-b border-neutral-800/70 px-1.5 py-1">
        <span className="shrink-0 text-neutral-600" title="Cookie sandboxes">
          <Cookie size={11} />
        </span>
        {snap.groups.map((g) => {
          const count = snap.tabs.filter((t) => t.groupId === g.id).length
          return (
            <div
              key={g.id}
              className="group/chip flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]"
              style={{ borderColor: g.color, color: g.color }}
              title={g.partition ? `Own cookie jar (${g.partition})` : 'Default session cookies'}
            >
              {renaming === g.id ? (
                <input
                  autoFocus
                  defaultValue={g.label}
                  onBlur={(e) => {
                    void window.api.browser.updateGroup(wsId, g.id, { label: e.target.value })
                    setRenaming(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                    if (e.key === 'Escape') setRenaming(null)
                  }}
                  className="w-20 bg-transparent focus:outline-none"
                />
              ) : (
                <button onDoubleClick={() => setRenaming(g.id)} title="Double-click to rename">
                  {g.label} · {count}
                </button>
              )}
              <button
                onClick={() => void window.api.browser.newTab(wsId, 'about:blank', g.id)}
                title={`New tab in ${g.label}`}
                className="opacity-50 hover:opacity-100"
              >
                <Plus size={10} />
              </button>
              <button
                onClick={() => void window.api.browser.clearGroup(wsId, g.id)}
                title={`Sign out everything in ${g.label} (clears its cookies)`}
                className="opacity-0 hover:text-amber-300 group-hover/chip:opacity-60"
              >
                <Cookie size={10} />
              </button>
              {g.id !== DEFAULT_GROUP_ID && (
                <button
                  onClick={() => void window.api.browser.closeGroup(wsId, g.id)}
                  title={`Close ${g.label} and its tabs`}
                  className="opacity-0 hover:text-red-400 group-hover/chip:opacity-60"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          )
        })}
        <button
          onClick={() => void window.api.browser.newGroup(wsId)}
          className="shrink-0 rounded border border-dashed border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-500 hover:border-neutral-500 hover:text-neutral-300"
          title="New cookie sandbox — tabs in it log in independently"
        >
          + Sandbox
        </button>
      </div>

      <div className="flex items-center gap-0.5 overflow-x-auto border-b border-neutral-800 bg-neutral-950 px-1">
        {ordered.map((tab) => {
          const color = groupOf(tab)?.color
          const isActive = tab.id === snap.activeId
          return (
            <div
              key={tab.id}
              onClick={() => window.api.browser.setActive(wsId, tab.id)}
              style={{ borderTopColor: color, borderTopWidth: 2, borderTopStyle: 'solid' }}
              className={`group flex max-w-[180px] cursor-pointer items-center gap-1.5 rounded-t px-2.5 py-1 text-xs ${
                isActive ? 'bg-neutral-900 text-neutral-100' : 'text-neutral-500 hover:bg-neutral-900/60'
              }`}
            >
              {tab.loading ? (
                <RotateCw size={10} className="animate-spin text-amber-400" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
              )}
              <span className="truncate">{tab.title || 'New Tab'}</span>
              {snap.groups.length > 1 && (
                <select
                  value={tab.groupId}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => void window.api.browser.moveTab(wsId, tab.id, e.target.value)}
                  title="Move to another sandbox (reloads the tab)"
                  className="w-3 cursor-pointer appearance-none bg-transparent text-[9px] text-neutral-600 opacity-0 focus:outline-none group-hover:opacity-100"
                >
                  {snap.groups.map((g) => (
                    <option key={g.id} value={g.id} className="bg-neutral-900">
                      {g.label}
                    </option>
                  ))}
                </select>
              )}
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
          )
        })}
        <button
          onClick={() => void window.api.browser.newTab(wsId, 'about:blank', active?.groupId)}
          className="ml-1 rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
          title="New tab in the current sandbox"
        >
          <Plus size={13} />
        </button>
      </div>

      <div
        ref={viewportRef}
        style={activeColor ? { borderColor: activeColor } : undefined}
        className={`relative min-h-0 flex-1 bg-neutral-900 ${activeColor ? 'border-2' : ''}`}
      >
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
