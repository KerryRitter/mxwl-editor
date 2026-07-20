import { useEffect, useState } from 'react'
import { ExternalLink, GitBranch, GitPullRequest, Loader2, Ticket } from 'lucide-react'
import type { JiraIssue, PullRequest } from '../../../shared/types'
import { Modal } from './Modal'

interface IntegrationsModalProps {
  wsId: string
  issueKey: string | null
  branch: string | null
  onClose: () => void
}

export function IntegrationsModal({
  wsId,
  issueKey,
  branch,
  onClose
}: IntegrationsModalProps): JSX.Element {
  const [issue, setIssue] = useState<JiraIssue | null>(null)
  const [pr, setPr] = useState<PullRequest | null>(null)
  const [loadingJira, setLoadingJira] = useState(false)
  const [loadingPr, setLoadingPr] = useState(false)
  const [jiraErr, setJiraErr] = useState<string | null>(null)
  const [prErr, setPrErr] = useState<string | null>(null)

  useEffect(() => {
    void window.api.browser.setVisible(wsId, false)
    return () => {
      void window.api.browser.setVisible(wsId, true)
    }
  }, [wsId])

  useEffect(() => {
    if (!issueKey) return
    setLoadingJira(true)
    window.api.jira
      .get(issueKey)
      .then((i) => setIssue(i))
      .catch((e) => setJiraErr(String(e)))
      .finally(() => setLoadingJira(false))
  }, [issueKey])

  useEffect(() => {
    if (!branch) return
    setLoadingPr(true)
    window.api.pr
      .get(wsId)
      .then((p) => setPr(p))
      .catch((e) => setPrErr(String(e)))
      .finally(() => setLoadingPr(false))
  }, [wsId, branch])

  return (
    <Modal title="Ticket & Pull Request" onClose={onClose} width={560}>
      <div className="grid gap-4">
        <Section icon={<Ticket size={14} className="text-blue-400" />} title="Jira">
          {!issueKey && <Empty>No ticket derived from this folder.</Empty>}
          {issueKey && loadingJira && <Loading />}
          {issueKey && jiraErr && <Error text={jiraErr} />}
          {issueKey && issue && (
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[11px] font-medium text-blue-300">
                  {issue.key}
                </span>
                <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-300">
                  {issue.status}
                </span>
                {issue.assignee && <span className="text-[11px] text-neutral-500">{issue.assignee}</span>}
              </div>
              <p className="mt-1.5 text-sm text-neutral-200">{issue.summary}</p>
              {issue.labels.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {issue.labels.map((l) => (
                    <span key={l} className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
                      {l}
                    </span>
                  ))}
                </div>
              )}
              <LinkRow wsId={wsId} href={issue.url} label="Open in Jira" />
            </div>
          )}
        </Section>

        <Section icon={<GitPullRequest size={14} className="text-emerald-400" />} title="Pull Request">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-neutral-500">
            <GitBranch size={11} /> {branch ?? 'no branch'}
          </div>
          {!branch && <Empty>No branch detected.</Empty>}
          {branch && loadingPr && <Loading />}
          {branch && prErr && <Error text={prErr} />}
          {branch && !loadingPr && !pr && !prErr && <Empty>No open PR for this branch.</Empty>}
          {pr && (
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[11px] font-medium text-emerald-300">
                  #{pr.id}
                </span>
                <span className="text-[11px] capitalize text-neutral-400">{pr.state}</span>
                {pr.author && <span className="text-[11px] text-neutral-500">{pr.author}</span>}
              </div>
              <p className="mt-1.5 text-sm text-neutral-200">{pr.title}</p>
              {pr.url && <LinkRow wsId={wsId} href={pr.url} label="Open in Bitbucket" />}
            </div>
          )}
        </Section>
      </div>
    </Modal>
  )
}

function Section({
  icon,
  title,
  children
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <section>
      <div className="mb-2 flex items-center gap-1.5">
        {icon}
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">{title}</h3>
      </div>
      {children}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }): JSX.Element {
  return <p className="text-xs text-neutral-600">{children}</p>
}

function Loading(): JSX.Element {
  return (
    <div className="flex items-center gap-2 text-xs text-neutral-500">
      <Loader2 size={13} className="animate-spin" /> Loading…
    </div>
  )
}

function Error({ text }: { text: string }): JSX.Element {
  return <p className="text-xs text-red-400">{text}</p>
}

function LinkRow({
  wsId,
  href,
  label
}: {
  wsId: string
  href: string
  label: string
}): JSX.Element {
  return (
    <button
      onClick={() => void window.api.browser.newTab(wsId, href)}
      className="mt-2 flex items-center gap-1 text-[11px] text-emerald-400 hover:underline"
    >
      <ExternalLink size={11} /> {label}
    </button>
  )
}
