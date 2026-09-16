import { useEffect, useState, type FC } from 'react'
import { Bot, Cookie, GitBranch, Loader2, Rocket } from 'lucide-react'
import { Modal } from './Modal'
import { useWorkspacesStore } from '../store/workspaces'
import { useAgentStore } from '../store/agent'
import { useNavigationStore } from '../store/navigation'

type Props = {
  wsId: string
  onClose: () => void
}

export const TicketLaunchModal: FC<Props> = ({ wsId, onClose }) => {
  const source = useWorkspacesStore((state) => state.workspaces.find((item) => item.id === wsId))
  const adopt = useWorkspacesStore((state) => state.adopt)
  const openAgent = useAgentStore((state) => state.open)
  const askAgent = useAgentStore((state) => state.ask)
  const focusPanel = useNavigationStore((state) => state.focus)
  const [ticket, setTicket] = useState(source?.derived.issueKey ?? '')
  const [branch, setBranch] = useState((source?.derived.issueKey ?? '').toLowerCase())
  const [branchTouched, setBranchTouched] = useState(false)
  const [summary, setSummary] = useState('')
  const [goal, setGoal] = useState('Implement the ticket, verify the change, and leave the worktree ready for review.')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.api.browser.setVisible(wsId, false)
    return () => {
      if (useWorkspacesStore.getState().activeId === wsId) {
        void window.api.browser.setVisible(wsId, true)
      }
    }
  }, [wsId])

  useEffect(() => {
    const key = ticket.trim().toUpperCase()
    if (!/^[A-Z][A-Z0-9]+-\d+$/.test(key)) {
      setSummary('')
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      void window.api.jira
        .get(key)
        .then((issue) => {
          if (!cancelled) setSummary(issue?.summary ?? '')
        })
        .catch(() => {
          if (!cancelled) setSummary('')
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [ticket])

  async function launch(): Promise<void> {
    const key = ticket.trim().toUpperCase()
    if (!key || !source) return
    setBusy(true)
    setError(null)
    try {
      const workspace = await window.api.workspace.createWorktree(wsId, key, branch.trim())
      const persistenceKey = `mxwl.workspace.${workspace.hostId}::${workspace.remotePath}`
      localStorage.setItem(`${persistenceKey}.layoutPreset`, 'agent')
      localStorage.setItem(`${persistenceKey}.bottomTab`, 'agent')
      adopt(workspace)

      const settings = await window.api.settings.get()
      const groupId = await window.api.browser.newGroup(workspace.id, key)
      await window.api.browser.newTab(
        workspace.id,
        workspace.derived.browserUrl || settings.defaultBrowserUrl || 'about:blank',
        groupId
      )
      await openAgent(workspace.id)
      const context = summary ? `${key}: ${summary}` : key
      askAgent(workspace.id, `${goal.trim()}\n\nTicket: ${context}`)
      focusPanel(workspace.id, 'agent')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Launch ticket workspace" onClose={onClose} width={620}>
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1">
            <span className="text-[10px] uppercase tracking-wide text-neutral-500">Ticket</span>
            <input
              autoFocus
              value={ticket}
              onChange={(event) => {
                const next = event.currentTarget.value.toUpperCase()
                setTicket(next)
                if (!branchTouched) setBranch(next.toLowerCase())
              }}
              placeholder="PLAT-1234"
              className="rounded border border-neutral-700 bg-neutral-950 px-2.5 py-2 font-mono text-sm text-neutral-100 outline-none focus:border-violet-500"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-[10px] uppercase tracking-wide text-neutral-500">Branch</span>
            <input
              value={branch}
              onChange={(event) => {
                setBranchTouched(true)
                setBranch(event.currentTarget.value)
              }}
              placeholder="plat-1234"
              className="rounded border border-neutral-700 bg-neutral-950 px-2.5 py-2 font-mono text-sm text-neutral-100 outline-none focus:border-violet-500"
            />
          </label>
        </div>
        {summary && <div className="text-xs text-violet-300">{summary}</div>}
        <label className="grid gap-1">
          <span className="text-[10px] uppercase tracking-wide text-neutral-500">Agent mission</span>
          <textarea
            value={goal}
            onChange={(event) => setGoal(event.currentTarget.value)}
            rows={4}
            className="resize-y rounded border border-neutral-700 bg-neutral-950 px-2.5 py-2 text-xs leading-relaxed text-neutral-100 outline-none focus:border-violet-500"
          />
        </label>

        <div className="grid grid-cols-3 gap-2">
          <Step icon={<GitBranch size={14} />} text="Sibling Git worktree" />
          <Step icon={<Cookie size={14} />} text="Fresh browser sandbox" />
          <Step icon={<Bot size={14} />} text="Agent starts with mission" />
        </div>

        {source && (
          <div className="rounded border border-neutral-800 bg-neutral-900/50 px-2.5 py-2 text-[11px] text-neutral-500">
            Base: <span className="font-mono text-neutral-300">{source.remotePath}</span>
          </div>
        )}
        {error && <div className="text-[11px] text-red-400">{error}</div>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void launch()}
            disabled={busy || !source || !ticket.trim() || !branch.trim() || !goal.trim()}
            className="flex items-center gap-1.5 rounded bg-violet-600 px-3 py-1.5 text-xs text-white hover:bg-violet-500 disabled:opacity-40"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Rocket size={13} />}
            {busy ? 'Launching…' : 'Launch everything'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

const Step: FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <div className="flex items-center gap-2 rounded border border-neutral-800 bg-neutral-900 px-2 py-2 text-[11px] text-neutral-300">
    <span className="text-violet-400">{icon}</span>
    {text}
  </div>
)
