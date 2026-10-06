import { workspacePersistenceKey } from '../../../shared/workspaceIdentity'
import { useEffect, useState, type FC } from 'react'
import { Bot, Cookie, GitBranch, Loader2, Rocket } from 'lucide-react'
import { Modal } from './Modal'
import { useWorkspacesStore } from '../store/workspaces'
import { useAgentStore } from '../store/agent'
import { useNavigationStore } from '../store/navigation'
import type {
  WorkspaceIssue,
  WorkspaceIntegrations
} from '../../../shared/types'
import { githubIssueNumber } from '../../../shared/github'

type Props = {
  wsId: string
  onClose: () => void
}

export const TicketLaunchModal: FC<Props> = ({ wsId, onClose }) => {
  const source = useWorkspacesStore((state) =>
    state.workspaces.find((item) => item.id === wsId)
  )
  const adopt = useWorkspacesStore((state) => state.adopt)
  const openAgent = useAgentStore((state) => state.open)
  const askAgent = useAgentStore((state) => state.ask)
  const focusPanel = useNavigationStore((state) => state.focus)
  const [ticket, setTicket] = useState(source?.derived.issueKey ?? '')
  const [branch, setBranch] = useState(
    (source?.derived.issueKey ?? '').toLowerCase()
  )
  const [branchTouched, setBranchTouched] = useState(false)
  const [issue, setIssue] = useState<WorkspaceIssue | null>(null)
  const [context, setContext] = useState<WorkspaceIntegrations | null>(null)
  const [recentIssues, setRecentIssues] = useState<WorkspaceIssue[]>([])
  const [loadingIssues, setLoadingIssues] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [goal, setGoal] = useState(
    'Implement the ticket, verify the change, and leave the worktree ready for review.'
  )
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
    let cancelled = false
    void window.api.integrations
      .context(wsId)
      .then(async (next) => {
        if (cancelled) return
        setContext(next)
        if (next.taskProvider === 'github-issues' && !next.error) {
          setLoadingIssues(true)
          try {
            const issues = await window.api.github.issues(wsId)
            if (!cancelled) setRecentIssues(issues)
          } catch (error) {
            if (!cancelled) setLookupError(String(error))
          } finally {
            if (!cancelled) setLoadingIssues(false)
          }
        }
      })
      .catch((error) => {
        if (!cancelled) setLookupError(String(error))
      })
    return () => {
      cancelled = true
    }
  }, [wsId])

  const isGithub = context?.taskProvider === 'github-issues'
  const issueNumber =
    isGithub && context.githubRepository
      ? githubIssueNumber(
          ticket,
          context.githubRepository,
          context.githubHost ?? undefined
        )
      : null

  useEffect(() => {
    setIssue(null)
    if (!context) return
    const key = isGithub ? ticket.trim() : ticket.trim().toUpperCase()
    if (isGithub ? !issueNumber : !/^[A-Z][A-Z0-9]+-\d+$/.test(key)) return
    const cached = recentIssues.find((item) => item.key === `#${issueNumber}`)
    if (isGithub && cached) {
      setIssue(cached)
      setLookupError(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      setLookupError(null)
      void window.api.issue
        .get(key, wsId)
        .then((issue) => {
          if (!cancelled) setIssue(issue)
        })
        .catch((error) => {
          if (!cancelled) setLookupError(String(error))
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [ticket, wsId, context, isGithub, issueNumber, recentIssues])

  async function launch(): Promise<void> {
    const key = isGithub
      ? issueNumber
        ? `GH-${issueNumber}`
        : ''
      : ticket.trim().toUpperCase()
    if (!key || !source) return
    setBusy(true)
    setError(null)
    try {
      const launchIssue = isGithub
        ? issue?.key === `#${issueNumber}`
          ? issue
          : await window.api.issue.get(`#${issueNumber}`, wsId)
        : issue
      if (isGithub && !launchIssue)
        throw new Error(
          'GitHub issue not found or inaccessible. Choose an issue; pull-request numbers cannot launch issue workspaces.'
        )
      const workspace = await window.api.workspace.createWorktree(
        wsId,
        key,
        branch.trim()
      )
      const persistenceKey = workspacePersistenceKey(workspace)
      localStorage.setItem(`${persistenceKey}.layoutPreset`, 'agent')
      localStorage.setItem(`${persistenceKey}.bottomTab`, 'agent')
      adopt(workspace)

      const groupId = await window.api.browser.newGroup(
        workspace.id,
        launchIssue?.key ?? key
      )
      await window.api.browser.newTab(
        workspace.id,
        workspace.derived.browserUrl || 'about:blank',
        groupId
      )
      await openAgent(workspace.id)
      const ticketContext = launchIssue
        ? `${launchIssue.key}: ${launchIssue.summary}`
        : isGithub
          ? `#${issueNumber}`
          : key
      askAgent(
        workspace.id,
        `${goal.trim()}\n\nTicket: ${ticketContext}${launchIssue ? `\nIssue: ${launchIssue.url}` : ''}${launchIssue?.body ? `\n\nIssue description:\n${launchIssue.body.slice(0, 12_000)}` : ''}`
      )
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
            <span className="text-[10px] uppercase tracking-wide text-neutral-500">
              Ticket
            </span>
            <input
              autoFocus
              value={ticket}
              onChange={(event) => {
                const next = isGithub
                  ? event.currentTarget.value
                  : event.currentTarget.value.toUpperCase()
                setTicket(next)
                const number =
                  isGithub && context?.githubRepository
                    ? githubIssueNumber(
                        next,
                        context.githubRepository,
                        context.githubHost ?? undefined
                      )
                    : null
                if (!branchTouched)
                  setBranch(number ? `gh-${number}` : next.toLowerCase())
              }}
              placeholder={isGithub ? '#123 or GitHub issue URL' : 'PLAT-1234'}
              className="rounded border border-neutral-700 bg-neutral-950 px-2.5 py-2 font-mono text-sm text-neutral-100 outline-none focus:border-violet-500"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-[10px] uppercase tracking-wide text-neutral-500">
              Branch
            </span>
            <input
              value={branch}
              onChange={(event) => {
                setBranchTouched(true)
                setBranch(event.currentTarget.value)
              }}
              placeholder={isGithub ? 'gh-123' : 'plat-1234'}
              className="rounded border border-neutral-700 bg-neutral-950 px-2.5 py-2 font-mono text-sm text-neutral-100 outline-none focus:border-violet-500"
            />
          </label>
        </div>
        {context?.error && (
          <p className="text-xs text-red-400">{context.error}</p>
        )}
        {isGithub && (
          <div className="grid gap-2">
            <span className="text-[10px] uppercase tracking-wide text-neutral-500">
              Recently updated open GitHub issues
            </span>
            {loadingIssues && (
              <p className="text-xs text-neutral-500">Loading GitHub issues…</p>
            )}
            {lookupError && (
              <p className="text-xs text-red-400">{lookupError}</p>
            )}
            <div className="grid max-h-32 overflow-y-auto">
              {recentIssues.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setTicket(item.key)
                    if (!branchTouched) setBranch(`gh-${item.key.slice(1)}`)
                  }}
                  className={`flex gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-neutral-800 ${item.key === issue?.key ? 'bg-neutral-800 text-brand-accent' : 'text-neutral-400'}`}
                >
                  <span className="shrink-0 font-mono">{item.key}</span>
                  <span className="truncate">{item.summary}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-neutral-500">
              Choose an issue or enter its number. The worktree uses GH-
              {issueNumber ?? '123'} and keeps this checkout’s repository.
            </p>
          </div>
        )}
        {issue && (
          <div className="text-xs text-violet-300">{issue.summary}</div>
        )}
        <label className="grid gap-1">
          <span className="text-[10px] uppercase tracking-wide text-neutral-500">
            Agent mission
          </span>
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
            Base:{' '}
            <span className="font-mono text-neutral-300">
              {source.remotePath}
            </span>
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
            disabled={
              busy ||
              !source ||
              !context ||
              (isGithub ? !issueNumber : !ticket.trim()) ||
              !branch.trim() ||
              !goal.trim()
            }
            className="flex items-center gap-1.5 rounded bg-violet-600 px-3 py-1.5 text-xs text-white hover:bg-violet-500 disabled:opacity-40"
          >
            {busy ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Rocket size={13} />
            )}
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
