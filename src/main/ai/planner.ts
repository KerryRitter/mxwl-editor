import type { AiPlan, AiSettings } from '../../shared/types'
import { buildHeadlessCommand, cliCommand } from '../../shared/aiCli'
import type { HostShell } from '../workspace/WorkspaceManager'
import { shellQuote } from '../workspace/util'

const PLANNER_TIMEOUT_SEC = 180

/**
 * Optional pass: hands the compiled plan back to the configured CLI in one-shot
 * mode and asks it to rewrite each task prompt. Purely additive — any failure
 * leaves the deterministic prompts untouched.
 */
export async function refinePlan(
  plan: AiPlan,
  settings: AiSettings,
  shell: HostShell
): Promise<{ plan: AiPlan; refined: boolean; error?: string }> {
  const tasks = plan.targets.flatMap((t) =>
    t.tasks.map((k) => ({ id: k.id, target: t.key ?? t.title, label: k.label, prompt: k.prompt }))
  )
  if (tasks.length === 0) return { plan, refined: false }

  const instruction = [
    'You are preparing prompts for other coding agents. Each prompt below will be pasted into a',
    'fresh agent session that has no other context, working in the repo checkout named in the prompt.',
    '',
    'Rewrite each prompt so it is unambiguous, states the acceptance criteria explicitly, and keeps',
    'the work scoped to that one ticket and that one step. Keep any `$agent-…` tokens verbatim —',
    'they are shell shortcuts the agent is expected to run. Do not invent tickets or steps.',
    '',
    'Output ONLY a JSON array, no prose and no code fence:',
    '[{"id": "<task id>", "prompt": "<rewritten prompt>"}]',
    '',
    'Original operator brief:',
    plan.brief,
    '',
    'Tasks:',
    JSON.stringify(tasks, null, 2)
  ].join('\n')

  const bin = cliCommand(plan.cli, settings)
  const probe = await shell.exec(`command -v ${shellQuote(bin)}`)
  if (probe.code !== 0) {
    return { plan, refined: false, error: `${bin} not found on PATH on ${shell.host.label}` }
  }

  const file = `$HOME/.cache/mxwl/ai/planner-${Date.now()}.md`
  const delimiter = 'MXWL_PLANNER_EOF'
  const write = await shell.exec(
    `mkdir -p $HOME/.cache/mxwl/ai && cat > ${file} <<'${delimiter}'\n${instruction}\n${delimiter}\n`
  )
  if (write.code !== 0) {
    return { plan, refined: false, error: write.stderr.trim() || 'could not stage planner prompt' }
  }
  // `$HOME` must be expanded before it is quoted into the `"$(cat …)"` argument.
  const { stdout: resolved } = await shell.exec(`printf %s ${file}`)

  const cmd = buildHeadlessCommand(plan.cli, settings, shellQuote(resolved.trim() || file))
  const { stdout, stderr, code } = await shell.exec(
    `timeout ${PLANNER_TIMEOUT_SEC} ${cmd} 2>/dev/null`
  )
  if (code !== 0) {
    return {
      plan,
      refined: false,
      error: `${plan.cli} planner exited ${code}${stderr.trim() ? `: ${stderr.trim()}` : ''}`
    }
  }

  const parsed = parseJsonArray(stdout)
  if (!parsed) return { plan, refined: false, error: 'planner did not return JSON' }

  const byId = new Map(parsed.map((p) => [p.id, p.prompt]))
  let hits = 0
  const targets = plan.targets.map((t) => ({
    ...t,
    tasks: t.tasks.map((k) => {
      const next = byId.get(k.id)
      if (typeof next !== 'string' || next.trim().length < 40) return k
      hits++
      return { ...k, prompt: next.trim() }
    })
  }))

  return hits > 0
    ? { plan: { ...plan, targets }, refined: true }
    : { plan, refined: false, error: 'planner returned no usable prompts' }
}

function parseJsonArray(text: string): { id: string; prompt: string }[] | null {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) return null
  try {
    const value = JSON.parse(text.slice(start, end + 1))
    if (!Array.isArray(value)) return null
    return value.filter(
      (v): v is { id: string; prompt: string } =>
        Boolean(v) && typeof v.id === 'string' && typeof v.prompt === 'string'
    )
  } catch {
    return null
  }
}
