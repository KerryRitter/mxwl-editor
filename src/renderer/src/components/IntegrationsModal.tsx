import { useEffect, useState } from 'react'
import {
  ExternalLink,
  GitBranch,
  GitPullRequest,
  Loader2,
  Ticket
} from 'lucide-react'
import type {
  WorkspaceIssue,
  PullRequest,
  WorkspaceIntegrations
} from '../../../shared/types'
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
  const [issue, setIssue] = useState<WorkspaceIssue | null>(null)
  const [context, setContext] = useState<WorkspaceIntegrations | null>(null)
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
    let cancelled = false
    void window.api.integrations
      .context(wsId)
      .then((next) => {
        if (!cancelled) setContext(next)
      })
      .catch((error) => {
        if (!cancelled) setJiraErr(String(error))
      })
    return () => {
      cancelled = true
    }
  }, [wsId])

  useEffect(() => {
    setIssue(null)
    setJiraErr(null)
    if (!issueKey) return
    let cancelled = false
    setLoadingJira(true)
    window.api.issue
      .get(issueKey, wsId)
      .then((i) => {
        if (!cancelled) setIssue(i)
      })
      .catch((e) => {
        if (!cancelled) setJiraErr(String(e))
      })
      .finally(() => {
        if (!cancelled) setLoadingJira(false)
      })
    return () => {
      cancelled = true
    }
  }, [issueKey, wsId])

  useEffect(() => {
    setPr(null)
    setPrErr(null)
    if (!branch) return
    let cancelled = false
    setLoadingPr(true)
    window.api.pr
      .get(wsId)
      .then((p) => {
        if (!cancelled) setPr(p)
      })
      .catch((e) => {
        if (!cancelled) setPrErr(String(e))
      })
      .finally(() => {
        if (!cancelled) setLoadingPr(false)
      })
    return () => {
      cancelled = true
    }
  }, [wsId, branch])

  return (
    <Modal title="Ticket & Pull Request" onClose={onClose} width={560}>
      <div className="grid gap-4">
        {context?.error && <Error text={context.error} />}
        <Section
          icon={<Ticket size={14} className="text-blue-400" />}
          title={
            context?.taskProvider === 'github-issues'
              ? 'GitHub issue'
              : context?.taskProvider === 'jira'
                ? 'Jira'
                : 'Issue'
          }
        >
          {!issueKey && <Empty>No ticket derived from this folder.</Empty>}
          {issueKey && loadingJira && <Loading />}
          {issueKey && jiraErr && <Error text={jiraErr} />}
          {issueKey && !loadingJira && !issue && !jiraErr && (
            <Empty>
              No issue found. Check the project’s task provider, repository, and
              account access in Settings.
            </Empty>
          )}
          {issueKey && issue && (
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[11px] font-medium text-blue-300">
                  {issue.key}
                </span>
                <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-300">
                  {issue.status}
                </span>
                {issue.assignee && (
                  <span className="text-[11px] text-neutral-500">
                    {issue.assignee}
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-sm text-neutral-200">{issue.summary}</p>
              {issue.labels.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {issue.labels.map((l) => (
                    <span
                      key={l}
                      className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400"
                    >
                      {l}
                    </span>
                  ))}
                </div>
              )}
              {issue.body && (
                <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-neutral-400">
                  {issue.body.slice(0, 6000)}
                </p>
              )}
              <LinkRow
                wsId={wsId}
                href={issue.url}
                label={
                  issue.provider === 'github-issues'
                    ? 'Open in GitHub'
                    : 'Open in Jira'
                }
              />
            </div>
          )}
        </Section>

        <Section
          icon={<GitPullRequest size={14} className="text-emerald-400" />}
          title="Pull Request"
        >
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-neutral-500">
            <GitBranch size={11} /> {branch ?? 'no branch'}
          </div>
          {!branch && <Empty>No branch detected.</Empty>}
          {branch && loadingPr && <Loading />}
          {branch && prErr && <Error text={prErr} />}
          {branch && !loadingPr && !pr && !prErr && (
            <Empty>No open PR for this branch.</Empty>
          )}
          {pr && (
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[11px] font-medium text-emerald-300">
                  #{pr.id}
                </span>
                <span className="text-[11px] capitalize text-neutral-400">
                  {pr.draft ? 'Draft' : pr.state}
                </span>
                {pr.author && (
                  <span className="text-[11px] text-neutral-500">
                    {pr.author}
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-sm text-neutral-200">{pr.title}</p>
              {pr.url && (
                <LinkRow
                  wsId={wsId}
                  href={pr.url}
                  label={
                    pr.provider === 'github'
                      ? 'Open in GitHub'
                      : 'Open in Bitbucket'
                  }
                />
              )}
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
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          {title}
        </h3>
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
