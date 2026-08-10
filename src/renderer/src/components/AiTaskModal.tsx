import { useEffect, useMemo, useState, type FC } from 'react'
import { Bot, ChevronDown, ChevronRight, Loader2, Play, Sparkles, Wrench, X } from 'lucide-react'
import { Modal } from './Modal'
import { useAiStore } from '../store/ai'
import { useHostsStore } from '../store/hosts'
import { AI_CLIS, AI_CLI_ORDER } from '../../../shared/aiCli'
import { humanDuration } from '../../../shared/duration'
import type { AiCliId, AiRunState, AiTaskStatus } from '../../../shared/types'

type AiTaskModalProps = {
  onClose: () => void
  hideBrowserWs?: string | null
}

const PLACEHOLDER = `1. PLAT-1234 — Payments & checkout bugs
2. PLAT-1235 — Purchase limits

for each of the epics, please open tabs to:
1. $agent-pre-merge
2. $agent-dev any remaining issues
3. $agent-qa
4. $agent-playwright — no skips, seed all data

if the branch doesn't exist, run $agent-init-branch first.`

export const AiTaskModal: FC<AiTaskModalProps> = ({ onClose, hideBrowserWs }) => {
  const hosts = useHostsStore((s) => s.hosts)
  const brief = useAiStore((s) => s.brief)
  const setBrief = useAiStore((s) => s.setBrief)
  const plan = useAiStore((s) => s.plan)
  const planning = useAiStore((s) => s.planning)
  const refined = useAiStore((s) => s.refined)
  const warning = useAiStore((s) => s.warning)
  const error = useAiStore((s) => s.error)
  const runs = useAiStore((s) => s.runs)
  const doPlan = useAiStore((s) => s.plan_)
  const doRun = useAiStore((s) => s.run)
  const dropTarget = useAiStore((s) => s.dropTarget)
  const dropTask = useAiStore((s) => s.dropTask)
  const setPrompt = useAiStore((s) => s.setPrompt)

  const [cli, setCli] = useState<AiCliId>('claude')
  const [hostId, setHostId] = useState('')
  const [refine, setRefine] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)

  const activeRun = useMemo(
    () => runs.find((r) => r.runId === activeRunId) ?? null,
    [runs, activeRunId]
  )

  useEffect(() => {
    if (hideBrowserWs) void window.api.browser.setVisible(hideBrowserWs, false)
    return () => {
      if (hideBrowserWs) void window.api.browser.setVisible(hideBrowserWs, true)
    }
  }, [hideBrowserWs])

  useEffect(() => {
    void window.api.settings.get().then((s) => {
      setCli(s.ai.defaultCli)
      setRefine(s.ai.refinePrompts)
      setHostId((prev) => prev || s.ai.defaultHostId || '')
    })
  }, [])

  useEffect(() => {
    if (!hostId && hosts.length > 0) setHostId(hosts[0].id)
  }, [hosts, hostId])

  // Setup can run for minutes with nothing to say; the clock is what shows it is alive.
  const prepRunning = activeRun?.prep?.status === 'running'
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!prepRunning) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [prepRunning])

  const missingConfig = !hostId
  const taskCount = plan?.targets.reduce((n, t) => n + t.tasks.length, 0) ?? 0
  // A brief can be only "open up tabs for PLAT-1 and PLAT-2" — no agent work at
  // all. There is still a run to make: the workspaces, and any setup before them.
  const runnable = !!plan && (plan.targets.length > 0 || !!plan.prep)

  async function start(): Promise<void> {
    const run = await doRun()
    if (run) setActiveRunId(run.runId)
  }

  return (
    <Modal title="Run AI tasks" onClose={onClose} width={760}>
      <div className="grid max-h-[74vh] gap-4 overflow-y-auto pr-1">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">CLI</span>
            <div className="flex gap-1">
              {AI_CLI_ORDER.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCli(id)}
                  className={`rounded-md border px-2.5 py-1.5 text-xs ${
                    cli === id
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                      : 'border-neutral-700 text-neutral-400 hover:border-neutral-600'
                  }`}
                >
                  {AI_CLIS[id].label}
                </button>
              ))}
            </div>
          </label>
          <label className="grid gap-1">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">Host</span>
            <select
              value={hostId}
              onChange={(e) => setHostId(e.target.value)}
              className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-100 focus:border-emerald-500 focus:outline-none"
            >
              {hosts.length === 0 && <option value="">No hosts configured</option>}
              {hosts.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 pb-1.5 text-[11px] text-neutral-400">
            <input
              type="checkbox"
              checked={refine}
              onChange={(e) => setRefine(e.target.checked)}
              className="accent-emerald-500"
            />
            Refine prompts with {AI_CLIS[cli].label} first
          </label>
        </div>

        <div className="grid gap-1">
          <span className="text-[10px] uppercase tracking-wider text-neutral-500">
            Brief — list the tickets, then the steps to run against each
          </span>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={9}
            placeholder={PLACEHOLDER}
            className="w-full resize-y rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-2 font-mono text-xs leading-relaxed text-neutral-100 placeholder:text-neutral-700 focus:border-emerald-500 focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => void doPlan({ hostId, cli, refine })}
              disabled={planning || missingConfig || !brief.trim()}
              className="flex items-center gap-1.5 rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:border-neutral-500 disabled:opacity-40"
            >
              {planning ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {planning ? 'Planning…' : 'Plan'}
            </button>
            {plan && (
              <span className="text-[11px] text-neutral-500">
                {plan.targets.length} workspace{plan.targets.length === 1 ? '' : 's'} · {taskCount}{' '}
                terminal{taskCount === 1 ? '' : 's'}
                {refined && <span className="ml-1 text-emerald-400">· refined</span>}
              </span>
            )}
          </div>
          {error && <p className="text-[11px] text-red-400">{error}</p>}
          {warning && <p className="text-[11px] text-amber-400">{warning}</p>}
        </div>

        {plan?.prep && (
          <div
            data-testid="ai-prep"
            className="grid gap-1.5 rounded-lg border border-amber-700/40 bg-amber-500/5 p-3"
          >
            <div className="flex items-center gap-2">
              <Wrench size={12} className="text-amber-400" />
              <span className="text-[11px] font-medium text-amber-200">
                Setup — runs once{plan.prep.blocking ? ', before the tickets' : ', in parallel'}
              </span>
              {activeRun?.prep && <StatusPill status={activeRun.prep.status} testId="ai-prep-status" />}
              {activeRun?.prep?.startedAt && (
                <span
                  data-testid="ai-prep-elapsed"
                  className="font-mono text-[10px] text-amber-300/70"
                >
                  {humanDuration(
                    (activeRun.prep.status === 'running' ? now : activeRun.prep.finishedAt ?? now) -
                      activeRun.prep.startedAt
                  )}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 font-mono text-[10px] text-neutral-400">
              <span className="text-neutral-600">{plan.prep.cwd}</span>
              <span className="truncate text-amber-300/80">{plan.prep.command}</span>
              <span className="ml-auto rounded bg-neutral-800 px-1 py-0.5 text-neutral-500">
                {plan.prep.kind === 'cli' ? AI_CLIS[cli].label : 'shell'}
              </span>
            </div>
            {plan.prep.blocking && (
              <p className="text-[10px] text-neutral-500">
                Waits for this command to finish, then opens the {plan.targets.length} ticket
                {plan.targets.length === 1 ? ' tab' : ' tabs'}.
              </p>
            )}
            {activeRun?.prep?.output && activeRun.prep.output.length > 0 && (
              <pre
                data-testid="ai-prep-output"
                className="max-h-24 overflow-y-auto whitespace-pre-wrap break-all rounded bg-black/40 p-2 font-mono text-[10px] leading-relaxed text-neutral-400"
              >
                {activeRun.prep.output.join('\n')}
              </pre>
            )}
            {activeRun?.prep?.message && (
              <p className="text-[10px] text-red-400">{activeRun.prep.message}</p>
            )}
          </div>
        )}

        {plan && plan.targets.length > 0 && (
          <div className="grid gap-2">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">Plan</span>
            {plan.targets.map((t) => (
              <div
                key={t.id}
                data-testid="ai-target"
                className="rounded-lg border border-neutral-800 bg-neutral-950/60"
              >
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className="text-xs font-medium text-neutral-200">
                    {t.key ?? t.title}
                  </span>
                  <span className="truncate text-[11px] text-neutral-500">{t.title}</span>
                  <span className="ml-auto font-mono text-[10px] text-neutral-600">{t.folder}</span>
                  <button
                    onClick={() => dropTarget(t.id)}
                    title="Remove"
                    className="rounded p-0.5 text-neutral-600 hover:text-red-400"
                  >
                    <X size={12} />
                  </button>
                </div>
                <div className="border-t border-neutral-800/70 px-2 py-1.5">
                  {t.tasks.map((k) => {
                    const open = expanded === k.id
                    const state = activeRun?.tasks.find((r) => r.taskId === k.id)
                    return (
                      <div key={k.id} className="grid">
                        <div className="flex items-center gap-2 px-1 py-1">
                          <button
                            onClick={() => setExpanded(open ? null : k.id)}
                            className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px] text-neutral-300 hover:text-neutral-100"
                          >
                            {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                            <span className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-300">
                              {k.label}
                            </span>
                            <span className="truncate text-neutral-500">{k.instruction}</span>
                          </button>
                          {state && <StatusPill status={state.status} />}
                          <button
                            onClick={() => dropTask(t.id, k.id)}
                            title="Remove"
                            className="rounded p-0.5 text-neutral-700 hover:text-red-400"
                          >
                            <X size={11} />
                          </button>
                        </div>
                        {open && (
                          <textarea
                            value={k.prompt}
                            onChange={(e) => setPrompt(t.id, k.id, e.target.value)}
                            rows={12}
                            className="mx-1 mb-2 w-[calc(100%-0.5rem)] resize-y rounded border border-neutral-800 bg-black/40 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-neutral-300 focus:border-emerald-600 focus:outline-none"
                          />
                        )}
                      </div>
                    )
                  })}
                  {t.tasks.length === 0 && (
                    <p className="px-1 py-1 text-[11px] text-neutral-600">No steps left</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeRun && <RunProgress run={activeRun} />}
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        {activeRun?.status === 'running' && (
          <button
            onClick={() => void window.api.ai.cancel(activeRun.runId)}
            className="rounded-md px-3 py-1.5 text-xs text-amber-400 hover:text-amber-300"
          >
            Cancel run
          </button>
        )}
        <button
          onClick={onClose}
          className="rounded-md px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-100"
        >
          Close
        </button>
        <button
          onClick={() => void start()}
          disabled={!plan || !runnable || activeRun?.status === 'running'}
          className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
        >
          <Play size={12} />
          {taskCount > 0
            ? `Run ${taskCount} task${taskCount === 1 ? '' : 's'}`
            : `Open ${plan?.targets.length ?? 0} workspace${plan?.targets.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </Modal>
  )
}

const RunProgress: FC<{ run: AiRunState }> = ({ run }) => (
  <div className="grid gap-2 rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
    <div className="flex items-center gap-2">
      <Bot size={13} className="text-emerald-400" />
      <span className="text-xs text-neutral-300">Run {run.status}</span>
      <span className="ml-auto text-[10px] text-neutral-600">
        {run.tasks.filter((t) => t.status === 'running').length} live
      </span>
    </div>
    <div className="grid gap-1">
      {run.prep && (
        <div className="flex items-center gap-2 text-[11px]">
          <StatusPill status={run.prep.status} />
          <span className="text-amber-200">setup</span>
          <span className="truncate font-mono text-[10px] text-neutral-600">{run.prep.path}</span>
          {run.prep.message && (
            <span className="ml-auto truncate text-red-400">{run.prep.message}</span>
          )}
        </div>
      )}
      {run.targets.map((t) => (
        <div key={t.targetId} className="flex items-center gap-2 text-[11px]">
          <StatusPill status={t.status} />
          <span className="text-neutral-300">{t.key ?? t.title}</span>
          <span className="truncate font-mono text-[10px] text-neutral-600">{t.path}</span>
          {t.message && <span className="ml-auto truncate text-red-400">{t.message}</span>}
        </div>
      ))}
    </div>
    {run.log.length > 0 && (
      <div className="max-h-32 overflow-y-auto rounded border border-neutral-800/80 bg-black/40 p-2 font-mono text-[10px] leading-relaxed text-neutral-500">
        {run.log.map((l, i) => (
          <div key={`${l.ts}-${i}`}>{l.text}</div>
        ))}
      </div>
    )}
  </div>
)

const STATUS_STYLE: Record<AiTaskStatus, string> = {
  pending: 'bg-neutral-800 text-neutral-400',
  provisioning: 'bg-amber-500/15 text-amber-300',
  opening: 'bg-amber-500/15 text-amber-300',
  launching: 'bg-sky-500/15 text-sky-300',
  running: 'bg-emerald-500/15 text-emerald-300',
  done: 'bg-emerald-500/15 text-emerald-400',
  error: 'bg-red-500/15 text-red-300',
  skipped: 'bg-neutral-800 text-neutral-600'
}

const StatusPill: FC<{ status: AiTaskStatus; testId?: string }> = ({ status, testId }) => (
  <span
    data-testid={testId}
    className={`rounded px-1.5 py-0.5 text-[9px] uppercase ${STATUS_STYLE[status]}`}
  >
    {status}
  </span>
)
