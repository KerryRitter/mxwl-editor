import { applyTemplate } from './derive'
import type { AiCliId, AiPlan, AiPlanPrep, AiPlanTarget, AiPlanTask } from './types'

export type ParsedTarget = { key: string | null; title: string }
export type ParsedStep = { label: string; instruction: string }
export type ParsedPrep = {
  cwd: string
  command: string
  kind: 'cli' | 'shell'
  blocking: boolean
  /** The clause this was read from, so it can be stripped from the step text */
  clause: string
}

export type ParsedBrief = {
  /** Prose that isn't part of either list — orientation for every task */
  context: string
  targets: ParsedTarget[]
  steps: ParsedStep[]
  /** A setup command to run once on the host before the per-ticket work */
  prep: ParsedPrep | null
}

const NUMBERED = /^\s*\d+[.)]\s+(.*)$/
const BULLET = /^\s*[-*•]\s+(.*)$/
const ISSUE_KEY = /^([A-Z][A-Z0-9]*-\d+)\b\s*[—–:-]?\s*(.*)$/
/** A line like "…please open tabs to:" that separates the target list from the step list */
const DIVIDER = /(open (a )?tabs? to|for each|run these|do the following|steps?)\s*:?\s*$/i
/** Ticket keys named inline in prose, e.g. "open up PLAT-5583 and PLAT-5577" */
const KEY_ANYWHERE = /\b([A-Z][A-Z0-9]{1,9})-(\d+)\b/g
/** Standards that look like ticket keys but aren't */
const NOT_A_KEY = new Set(['UTF', 'ISO', 'RFC', 'SHA', 'CVE'])

/** `in ~/Workspaces/zipper` / `open a terminal to /srv/repo` — needs a real path */
const PREP_DIR = /\b(?:in|at|cd(?:\s+to)?|open\s+(?:a\s+)?terminal\s+(?:to|in))\s+(~[\w./@-]*|\/[\w./@-]+)/i
const PREP_RUN = /\brun\s+(\S+)/i
/** Where the prep clause stops and the mxwl work begins ("theb" is a common typo) */
const PREP_END = /\b(?:and\s+then|then|theb|after\s+that|afterwards|next)\b|[.;\n]/i
const PREP_PARALLEL = /\b(?:in\s+parallel|at\s+the\s+same\s+time|simultaneously|while\s+that)\b/i

/**
 * Reads a leading "in <dir>, run <cmd>" clause. A command starting with `/` is a
 * CLI slash-command (it goes to the agent as a prompt); anything else is typed
 * straight into the shell.
 */
export function parsePrep(brief: string): ParsedPrep | null {
  const dir = PREP_DIR.exec(brief)
  if (!dir) return null
  const run = PREP_RUN.exec(brief.slice(dir.index))
  if (!run) return null

  const afterRun = dir.index + run.index + run[0].length
  const rest = brief.slice(afterRun)
  const end = PREP_END.exec(rest)
  const tail = (end ? rest.slice(0, end.index) : rest).replace(/^[\s,;]+|[\s,;]+$/g, '')
  const clause = brief.slice(dir.index, end ? afterRun + end.index : brief.length).trim()

  // `run ./init.sh, then …` — the comma is sentence punctuation, not the command.
  const token = run[1].replace(/[,;.]+$/, '')
  const kind = token.startsWith('/') ? 'cli' : 'shell'
  return {
    cwd: dir[1],
    // A slash-command keeps its trailing phrase ("for both branches"); a shell
    // command would choke on the prose, so it keeps only the token.
    command: kind === 'cli' && tail ? `${token} ${tail}` : token,
    kind,
    blocking: !PREP_PARALLEL.test(brief),
    clause
  }
}

const DANGLING = /\s+\b(?:for|on|in|to|with|and|of|from|both|branches)\b[\s,]*$/i
/** Stand-in for a removed key, so a conjunction that only joined keys can be spotted */
const MARK = '\u0000'
const MARK_RUN = /[\s,]*\u0000(?:[\s,]*(?:and|&|or)?[\s,]*\u0000)*/g

/** `open up tabs for PLAT-1 and PLAT-2` → `open up tabs` */
export function stripTicketList(text: string): string {
  // Mark the keys first so the commas and "and"s that only joined them go too,
  // instead of leaving "rebase and onto main".
  let out = text
    .replace(KEY_ANYWHERE, (m, prefix: string) => (NOT_A_KEY.has(prefix) ? m : MARK))
    .replace(MARK_RUN, ' ')
    .replace(/[\s,]+/g, ' ')
    .trim()
  while (DANGLING.test(out)) out = out.replace(DANGLING, '')
  return out.trim()
}

/**
 * Phrases that name what mxwl itself does with the tickets — open their
 * workspaces. They are not work for an agent: handed to a CLI, `open up tabs`
 * gets literal editor windows opened instead of workspace tabs.
 */
const MXWL_ACTION =
  /^(?:(?:and|then|please|also)\s+)*(?:go\s+)?open(?:\s+up)?(?:\s+(?:the|a|new|their))?(?:\s+(?:tabs?|workspaces?|windows?|them|these|those|it))?$/i

export function isMxwlAction(instruction: string): boolean {
  return MXWL_ACTION.test(instruction.trim())
}

function listItem(line: string): string | null {
  const m = NUMBERED.exec(line) ?? BULLET.exec(line)
  return m ? m[1].trim() : null
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

/** `$agent-qa (and take notes…)` → `qa`; otherwise the first few words. */
export function stepLabel(instruction: string, index: number): string {
  const agent = /\$([a-z0-9][a-z0-9_-]*)/i.exec(instruction)
  if (agent) return agent[1].replace(/^agent[-_]?/i, '') || agent[1]
  const words = instruction
    .replace(/[^\w\s-]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join('-')
  return slugify(words) || `step-${index + 1}`
}

/**
 * Split a free-form brief into: the things to work (targets) and the steps to
 * run against each of them. The divider is the line that introduces the step
 * list; everything listed before it is a target, everything after is a step.
 * Prose outside both lists becomes shared context.
 */
export function parseBrief(brief: string): ParsedBrief {
  const lines = brief.replace(/\r\n/g, '\n').split('\n')

  let dividerIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (listItem(lines[i])) continue
    if (DIVIDER.test(lines[i].trim())) {
      dividerIdx = i
      break
    }
  }

  const targets: ParsedTarget[] = []
  const steps: ParsedStep[] = []
  const context: string[] = []
  let lastStep: ParsedStep | null = null

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = raw.trim()
    const item = listItem(raw)
    const afterDivider = dividerIdx >= 0 && i > dividerIdx

    if (!line) {
      lastStep = null
      continue
    }

    if (item) {
      if (afterDivider || dividerIdx < 0) {
        // No divider at all → treat a leading issue key as the signal for a target.
        const keyed = ISSUE_KEY.exec(item)
        if (dividerIdx < 0 && keyed) {
          targets.push({ key: keyed[1], title: keyed[2].trim() || keyed[1] })
          continue
        }
        lastStep = { label: stepLabel(item, steps.length), instruction: item }
        steps.push(lastStep)
      } else {
        const keyed = ISSUE_KEY.exec(item)
        targets.push(
          keyed
            ? { key: keyed[1], title: keyed[2].trim() || keyed[1] }
            : { key: null, title: item }
        )
      }
      continue
    }

    if (i === dividerIdx) {
      context.push(line)
      continue
    }

    // Unnumbered line directly under a step wraps that step; otherwise it's context.
    if (lastStep && afterDivider) {
      lastStep.instruction = `${lastStep.instruction} ${line}`
      continue
    }
    context.push(line)
  }

  // No target list at all — pull the ticket keys out of the prose instead.
  if (targets.length === 0) {
    for (const m of brief.matchAll(KEY_ANYWHERE)) {
      if (NOT_A_KEY.has(m[1])) continue
      const key = `${m[1]}-${m[2]}`
      if (targets.some((t) => t.key === key)) continue
      targets.push({ key, title: key })
    }
  }

  const prep = parsePrep(brief)
  let ctx = context.join('\n').trim()
  // Tickets but no step list — the brief itself is the one step to run per ticket,
  // minus the prep clause, which is a one-off and not per-ticket work.
  if (steps.length === 0 && targets.length > 0 && ctx) {
    const body = (prep ? ctx.replace(prep.clause, '') : ctx)
      .replace(/^[\s,;]*(?:and\s+)?(?:then|theb)\b/i, '')
      .replace(/\s+/g, ' ')
      .replace(/^[\s,;]+|[\s,;]+$/g, '')
      .trim()
    // The ticket list belongs to the targets, not to the step — leaving it in
    // would tell every agent to work every ticket.
    const scoped = stripTicketList(body)
    if (scoped) {
      steps.push({ label: stepLabel(scoped, 0), instruction: scoped })
      ctx = ''
    }
  }

  // `open up tabs for PLAT-1 and PLAT-2` is the whole point of the run, not a task
  // to hand an agent — opening the workspaces is mxwl's own job.
  return { context: ctx, targets, steps: steps.filter((s) => !isMxwlAction(s.instruction)), prep }
}

export type CompileOptions = {
  hostId: string
  cli: AiCliId
  /** Vars: ${key} ${keyLower} ${keyNum} ${slug} ${title} */
  folderTemplate: string
}

export function folderForTarget(target: ParsedTarget, template: string): string {
  const key = target.key ?? ''
  const vars = {
    key,
    keyLower: key.toLowerCase(),
    keyNum: /\d+/.exec(key)?.[0] ?? '',
    slug: slugify(target.title),
    title: target.title
  }
  const folder = applyTemplate(template || '${key}', vars).trim()
  return folder || key || slugify(target.title)
}

export function renderPrompt(
  target: ParsedTarget,
  folder: string,
  step: ParsedStep,
  context: string
): string {
  const heading =
    target.key && target.title !== target.key
      ? `${target.key} — ${target.title}`
      : target.title
  const sections = [
    `# ${step.label}: ${heading}`,
    '',
    `You are in \`${folder}\` — the working copy for **${heading}**. Everything below applies to this ticket only; do not touch other tickets or branches.`,
    '',
    '## What to do',
    step.instruction
  ]
  if (context) {
    sections.push(
      '',
      '## Operator brief (verbatim — for context, not a task list)',
      context
    )
  }
  sections.push(
    '',
    '## Ground rules',
    `- Scope: ${heading}. Confirm the checkout is on the right branch before changing anything.`,
    '- Finish the step above completely; report what you did and anything you could not do.',
    '- Do not start the other steps in the brief — they run in their own terminals.'
  )
  return sections.join('\n')
}

/**
 * Prep runs once, before the ticket workspaces open. The prompt names the exact
 * folders mxwl will wait for, so the agent knows what "done" means.
 */
/**
 * The exact command lines to run. A slash command takes the ticket as its
 * argument, so a brief that says `/agent:init-branch for both branches` would
 * hand the CLI "for both branches" as the key and it would have nothing to act
 * on. When the tickets are known, spell one invocation out per ticket instead —
 * keeping any real flags, dropping the prose that only said "do it twice".
 */
function prepInvocations(prep: ParsedPrep, targets: AiPlanTarget[]): string[] {
  const keys = targets.map((t) => t.key).filter((k): k is string => !!k)
  const [token, ...rest] = prep.command.split(/\s+/)
  const args = rest.join(' ')
  // A fresh regex: KEY_ANYWHERE is global, so `.test` on it carries lastIndex over.
  const hasKey = new RegExp(KEY_ANYWHERE.source).test(args)
  if (prep.kind !== 'cli' || keys.length === 0 || hasKey) {
    return [prep.command]
  }
  const flags = rest.filter((a) => a.startsWith('-')).join(' ')
  return keys.map((key) => [token, flags, key].filter(Boolean).join(' '))
}

export function renderPrepPrompt(prep: ParsedPrep, targets: AiPlanTarget[]): string {
  const runs = prepInvocations(prep, targets)
  const lines = [
    '# Setup: prepare the branch checkouts',
    '',
    `Run ${runs.length > 1 ? 'these, in order,' : 'this'} in \`${prep.cwd}\`:`,
    '',
    ...runs.map((r) => `    ${r}`),
    '',
    'When you are done these folders must exist, one per ticket, each on that ticket’s branch:',
    ...targets.map((t) => `- \`${t.folder}\`${t.key ? ` — ${t.key}` : ''}`),
    '',
    '## Ground rules',
    runs.length > 1
      ? '- Run every line above, all of them, so that every folder listed above exists.'
      : '- Create every folder listed above. If the command handles one ticket at a time, run it once per ticket.',
    `- Finish completely before you exit${
      targets.length > 1 ? ' — including the last ticket' : ''
    }. mxwl waits for this command to exit and then opens the ticket workspaces, so exiting early hands the next agents a half-built checkout.`,
    '- Do not background the work and return; stay until it is genuinely done.',
    '- Do not start work on the tickets themselves — each gets its own agent afterwards.',
    '- Say what you did and stop.'
  ]
  return lines.join('\n')
}

/** Deterministic brief → plan. The AI planner (when enabled) refines this, never replaces it. */
export function compilePlan(brief: string, opts: CompileOptions): AiPlan {
  const parsed = parseBrief(brief)
  const targets: AiPlanTarget[] = parsed.targets.map((t, ti) => {
    const folder = folderForTarget(t, opts.folderTemplate)
    const targetId = t.key ? t.key.toLowerCase() : `target-${ti + 1}`
    const tasks: AiPlanTask[] = parsed.steps.map((s, si) => ({
      id: `${targetId}--${s.label}-${si + 1}`,
      label: s.label,
      instruction: s.instruction,
      prompt: renderPrompt(t, folder, s, parsed.context)
    }))
    return { id: targetId, key: t.key, title: t.title, folder, tasks }
  })

  const prep: AiPlanPrep | null = parsed.prep
    ? {
        cwd: parsed.prep.cwd,
        command: parsed.prep.command,
        kind: parsed.prep.kind,
        blocking: parsed.prep.blocking,
        prompt: renderPrepPrompt(parsed.prep, targets)
      }
    : null

  return {
    brief,
    context: parsed.context,
    hostId: opts.hostId,
    cli: opts.cli,
    prep,
    targets
  }
}
