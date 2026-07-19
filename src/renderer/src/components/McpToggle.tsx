import { useEffect, useState } from 'react'
import { Plug, PlugZap } from 'lucide-react'
import type { McpStatus } from '../../../shared/types'

export function McpToggle({ wsId }: { wsId: string }): JSX.Element {
  const [status, setStatus] = useState<McpStatus | null>(null)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    void window.api.mcp.status().then(setStatus)
  }, [])

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
    : 'Enable MCP bridge (tunnels CDP + workspace MCP back to the remote host)'

  return (
    <button
      onClick={toggle}
      disabled={toggling}
      title={title}
      className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] ${
        on
          ? 'bg-emerald-600/20 text-emerald-300'
          : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200'
      } disabled:opacity-40`}
    >
      {on ? <PlugZap size={12} /> : <Plug size={12} />}
      MCP {on ? 'on' : 'off'}
    </button>
  )
}
