import { useEffect, useState } from 'react'
import { Copy, Plug, PlugZap, Settings2 } from 'lucide-react'
import type { McpStatus } from '../../../shared/types'
import { Modal } from './Modal'

export function McpToggle({ wsId }: { wsId: string }): JSX.Element {
  const [status, setStatus] = useState<McpStatus | null>(null)
  const [toggling, setToggling] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const refresh = (): void => { void window.api.mcp.status(wsId).then(setStatus) }
    refresh()
    return window.api.on('mcp:changed', (...args: unknown[]) => {
      if ((args[0] as { wsId: string })?.wsId === wsId) refresh()
    })
  }, [wsId])

  useEffect(() => {
    if (!setupOpen) return
    void window.api.browser.setVisible(wsId, false)
    return () => { void window.api.browser.activate(wsId) }
  }, [setupOpen, wsId])

  async function toggle(): Promise<void> {
    setToggling(true)
    try {
      const next = status?.enabled
        ? await window.api.mcp.disable(wsId)
        : await window.api.mcp.enable(wsId)
      setStatus(next)
    } finally {
      setToggling(false)
    }
  }

  const on = status?.enabled ?? false
  const title = on
    ? `MCP bridge on. From the remote host:\n  CDP ${status?.cdpUrl}\n  MCP ${status?.mcpUrl}`
    : 'Enable the workspace browser MCP and Playwright bridge'

  return (
    <div className="flex items-center gap-1">
      <button
      onClick={toggle}
      disabled={toggling}
      title={status?.error ? `${title}\n${status.error}` : title}
      className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] ${
        on
          ? 'bg-emerald-600/20 text-emerald-300'
          : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200'
      } disabled:opacity-40`}
    >
      {on ? <PlugZap size={12} /> : <Plug size={12} />}
      MCP {on ? 'on' : 'off'}
      </button>
      <button type="button" title="MCP and Playwright connection setup" aria-label="MCP and Playwright connection setup"
        onClick={() => {
          setCopied(false)
          setSetupOpen(true)
          void window.api.mcp.enable(wsId).then(setStatus)
        }} className="rounded p-0.5 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200">
        <Settings2 size={12} />
      </button>
      {setupOpen && (
        <Modal title="Embedded browser connection" onClose={() => setSetupOpen(false)} width={640}>
          <p className="text-xs text-neutral-400">Use these connections from this workspace’s host. Playwright attaches to its embedded Chromium tabs; new pages appear in mxwl.</p>
          {status?.error && <p className="mt-3 text-xs text-red-400">{status.error}</p>}
          {status?.enabled && <>
            <div className="my-3 space-y-1 font-mono text-[11px] text-neutral-400">
              <p>MCP: {status.mcpUrl}</p><p>CDP: {status.cdpUrl}</p>
            </div>
            <pre className="max-h-64 overflow-auto rounded border border-neutral-800 bg-neutral-950 p-3 text-[11px] text-neutral-300">{status.config}</pre>
            <button type="button" onClick={() => {
              void navigator.clipboard.writeText(status.config || '').then(() => setCopied(true))
            }} className="mt-3 flex items-center gap-1.5 rounded bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700">
              <Copy size={12} />{copied ? 'Copied' : 'Copy MCP configuration'}
            </button>
            <p className="mt-3 text-xs text-neutral-500">New terminal sessions set PLAYWRIGHT_MCP_CDP_ENDPOINT automatically. For scripts, use chromium.connectOverCDP(process.env.MXWL_CDP_ENDPOINT) and browser.contexts()[0].</p>
          </>}
        </Modal>
      )}
    </div>
  )
}
