import { describe, expect, it } from 'vitest'
import {
  compilePlan,
  folderForTarget,
  isMxwlAction,
  parseBrief,
  parsePrep,
  renderPrepPrompt,
  stepLabel,
  stripTicketList
} from './aiPrompt'

const BRIEF = `1. PLAT-5874 — [Bugs] Payments, Stripe & checkout (1/2)
  2. PLAT-5687 — Purchase limits & payment transparency
  3. PLAT-4978 — PaymentCell rewrite — punch card credit display
  4. PLAT-5170 — Credit refund & transfer correctness

for eeach of the epics that need worked, please open tabs to:
2. $agent-pre-merge
3. $agent-dev any remaining issues
4. $agent-qa (and take notes as we use platwright to examine the UI)
5. $agent-playwright to lock down the playwright tests as determinstic tests - make sure all ACs for all bugs/sstories are GREEN with NO SKIPS and no "Needs data" -  seed all data
necessary to run the tests

if the branch doesn't exist, open a terminal to ~/Workspaces/zipper (in the host) and run $agent-init-branch first to the branch exists.`

describe('parseBrief', () => {
  const parsed = parseBrief(BRIEF)

  it('splits targets from steps at the divider line', () => {
    expect(parsed.targets).toHaveLength(4)
    expect(parsed.steps).toHaveLength(4)
  })

  it('keeps issue keys and titles apart', () => {
    expect(parsed.targets[0]).toEqual({
      key: 'PLAT-5874',
      title: '[Bugs] Payments, Stripe & checkout (1/2)'
    })
    expect(parsed.targets[2].key).toBe('PLAT-4978')
    expect(parsed.targets[2].title).toBe('PaymentCell rewrite — punch card credit display')
  })

  it('numbers restarting in the step list do not leak into targets', () => {
    expect(parsed.targets.map((t) => t.key)).not.toContain(null)
    expect(parsed.steps[0].instruction).toBe('$agent-pre-merge')
  })

  it('folds a wrapped step line into that step', () => {
    expect(parsed.steps[3].instruction).toContain('seed all data necessary to run the tests')
  })

  it('does not fold the post-blank-line paragraph into the last step', () => {
    expect(parsed.steps[3].instruction).not.toContain('if the branch')
    expect(parsed.context).toContain("if the branch doesn't exist")
  })

  it('keeps the divider sentence as context', () => {
    expect(parsed.context).toContain('for eeach of the epics')
  })
})

describe('stepLabel', () => {
  it('strips the $agent- prefix', () => {
    expect(stepLabel('$agent-pre-merge', 0)).toBe('pre-merge')
    expect(stepLabel('$agent-qa (and take notes)', 2)).toBe('qa')
  })

  it('falls back to leading words', () => {
    expect(stepLabel('run the type checker please', 0)).toBe('run-the-type')
  })
})

describe('folderForTarget', () => {
  it('applies the folder template', () => {
    const target = { key: 'PLAT-5874', title: 'Payments' }
    expect(folderForTarget(target, 'zipper-${key}')).toBe('zipper-PLAT-5874')
    expect(folderForTarget(target, '${keyLower}')).toBe('plat-5874')
    expect(folderForTarget(target, 'wt/${keyNum}')).toBe('wt/5874')
  })

  it('falls back to a slug when there is no key', () => {
    expect(folderForTarget({ key: null, title: 'Fix the thing' }, '${key}')).toBe('fix-the-thing')
  })
})

describe('compilePlan', () => {
  const plan = compilePlan(BRIEF, {
    hostId: 'host-1',
    cli: 'claude',
    folderTemplate: 'zipper-${key}'
  })

  it('produces one task per step per target', () => {
    expect(plan.targets).toHaveLength(4)
    expect(plan.targets[0].tasks).toHaveLength(4)
    expect(plan.targets[0].folder).toBe('zipper-PLAT-5874')
  })

  it('gives every task a unique id', () => {
    const ids = plan.targets.flatMap((t) => t.tasks.map((k) => k.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('scopes each prompt to its own ticket and step', () => {
    const prompt = plan.targets[1].tasks[2].prompt
    expect(prompt).toContain('PLAT-5687')
    expect(prompt).toContain('zipper-PLAT-5687')
    expect(prompt).toContain('$agent-qa')
    expect(prompt).not.toContain('PLAT-5874')
  })

  it('passes the brief context through to every prompt', () => {
    for (const target of plan.targets) {
      for (const task of target.tasks) {
        expect(task.prompt).toContain("if the branch doesn't exist")
      }
    }
  })
})

describe('parseBrief without a divider', () => {
  it('treats keyed lines as targets and the rest as steps', () => {
    const parsed = parseBrief('- PLAT-1 — Thing\n- run the tests')
    expect(parsed.targets).toEqual([{ key: 'PLAT-1', title: 'Thing' }])
    expect(parsed.steps.map((s) => s.instruction)).toEqual(['run the tests'])
  })
})

describe('prose brief with no lists', () => {
  const parsed = parseBrief('open up PLAT-5583 and PLAT-5577')

  it('pulls ticket keys out of the sentence', () => {
    expect(parsed.targets).toEqual([
      { key: 'PLAT-5583', title: 'PLAT-5583' },
      { key: 'PLAT-5577', title: 'PLAT-5577' }
    ])
  })

  it('leaves no agent step — `open up` is the opening, which mxwl does itself', () => {
    expect(parsed.steps).toEqual([])
    expect(parsed.context).toBe('')
  })

  it('uses the brief itself as the single step when it asks for real work', () => {
    const p = parseBrief('run the qa checks on PLAT-5583 and PLAT-5577')
    expect(p.steps).toHaveLength(1)
    // The ticket list is the target set, so it is stripped from the step itself.
    expect(p.steps[0].instruction).toBe('run the qa checks')
    expect(p.context).toBe('')
  })

  it('keeps an $agent token as the step label', () => {
    expect(parseBrief('$agent-pre-merge PLAT-1').steps[0].label).toBe('pre-merge')
  })

  it('de-dupes repeated keys and ignores standards', () => {
    const p = parseBrief('fix PLAT-1, then re-check PLAT-1 for UTF-8 handling')
    expect(p.targets.map((t) => t.key)).toEqual(['PLAT-1'])
  })

  it('compiles one task per ticket', () => {
    const plan = compilePlan('run the qa checks on PLAT-5583 and PLAT-5577', {
      hostId: 'h1',
      cli: 'codex',
      folderTemplate: 'zipper-${key}'
    })
    expect(plan.targets.map((t) => t.folder)).toEqual(['zipper-PLAT-5583', 'zipper-PLAT-5577'])
    expect(plan.targets.every((t) => t.tasks.length === 1)).toBe(true)
    expect(plan.targets[0].tasks[0].prompt).toContain('PLAT-5583')
    expect(plan.targets[0].tasks[0].prompt).not.toContain('PLAT-5583 — PLAT-5583')
  })
})

describe('prep clause', () => {
  const BRIEF =
    'in ~/Workspaces/zipper, run /agent:init-branch for both branches, theb open up tabs for PLAT-5583 and PLAT-5577'

  it('reads the directory and the slash-command', () => {
    const prep = parsePrep(BRIEF)!
    expect(prep.cwd).toBe('~/Workspaces/zipper')
    expect(prep.command).toBe('/agent:init-branch for both branches')
    expect(prep.kind).toBe('cli')
    expect(prep.blocking).toBe(true)
  })

  it('keeps the prep clause out of the per-ticket step', () => {
    const parsed = parseBrief(BRIEF.replace('open up tabs for', 'run the qa checks for'))
    expect(parsed.targets.map((t) => t.key)).toEqual(['PLAT-5583', 'PLAT-5577'])
    expect(parsed.steps).toHaveLength(1)
    expect(parsed.steps[0].instruction).toBe('run the qa checks')
    expect(parsed.steps[0].label).toBe('run-the-qa')
  })

  it('runs the setup and then just opens the tabs, with no agent step', () => {
    const parsed = parseBrief(BRIEF)
    expect(parsed.prep?.command).toBe('/agent:init-branch for both branches')
    expect(parsed.steps).toEqual([])
  })

  it('treats a non-slash command as a shell command and drops the prose', () => {
    const prep = parsePrep('open a terminal to ~/Workspaces/zipper and run $agent-init-branch first.')!
    expect(prep.kind).toBe('shell')
    expect(prep.command).toBe('$agent-init-branch')
  })

  it('does not block when the brief says in parallel', () => {
    expect(parsePrep('in /srv/app, run ./setup.sh in parallel with the tickets')!.blocking).toBe(
      false
    )
  })

  it('needs a real path, not just the word in', () => {
    expect(parsePrep('run the tests in the host')).toBeNull()
    expect(parsePrep('open up PLAT-1 and PLAT-2')).toBeNull()
  })

  it('names the expected folders in the prep prompt', () => {
    const plan = compilePlan(BRIEF, {
      hostId: 'h1',
      cli: 'codex',
      folderTemplate: 'zipper-${key}'
    })
    expect(plan.prep?.cwd).toBe('~/Workspaces/zipper')
    expect(plan.prep?.prompt).toContain('zipper-PLAT-5583')
    expect(plan.prep?.prompt).toContain('zipper-PLAT-5577')
    expect(plan.targets).toHaveLength(2)
  })
})

describe('stripTicketList', () => {
  it('drops the ticket list and the dangling preposition', () => {
    expect(stripTicketList('open up tabs for PLAT-1 and PLAT-2')).toBe('open up tabs')
    expect(stripTicketList('rebase PLAT-1, PLAT-2 and PLAT-3 onto main')).toBe('rebase onto main')
  })

  it('leaves text with no keys alone', () => {
    expect(stripTicketList('run the tests')).toBe('run the tests')
  })

  it('only eats a conjunction that joined two keys', () => {
    expect(stripTicketList('test and build')).toBe('test and build')
    expect(stripTicketList('test PLAT-1 and build')).toBe('test and build')
  })
})

describe('prep command punctuation', () => {
  it('does not swallow the comma before "then"', () => {
    const prep = parsePrep('in /srv/app, run ./init.sh, then open PLAT-1')!
    expect(prep.command).toBe('./init.sh')
    expect(prep.kind).toBe('shell')
  })
})

describe('renderPrepPrompt invocations', () => {
  const targets = [
    { id: 'plat-5583', key: 'PLAT-5583', title: 'PLAT-5583', folder: 'zipper-PLAT-5583', tasks: [] },
    { id: 'plat-5577', key: 'PLAT-5577', title: 'PLAT-5577', folder: 'zipper-PLAT-5577', tasks: [] }
  ]
  const prep = {
    cwd: '~/Workspaces/zipper',
    command: '/agent:init-branch for both branches',
    kind: 'cli' as const,
    blocking: true,
    clause: ''
  }

  it('spells the slash command out per ticket instead of passing prose as the key', () => {
    const out = renderPrepPrompt(prep, targets)
    expect(out).toContain('    /agent:init-branch PLAT-5583')
    expect(out).toContain('    /agent:init-branch PLAT-5577')
    expect(out).not.toContain('for both branches')
  })

  it('keeps real flags while dropping the prose', () => {
    const out = renderPrepPrompt({ ...prep, command: '/agent:init-branch --fresh for both' }, targets)
    expect(out).toContain('    /agent:init-branch --fresh PLAT-5583')
  })

  it('leaves a command that already names a ticket alone', () => {
    const out = renderPrepPrompt({ ...prep, command: '/agent:init-branch PLAT-5583' }, [targets[0]])
    expect(out).toContain('    /agent:init-branch PLAT-5583')
    expect(out).toContain('- Create every folder listed above.')
  })

  it('never rewrites a shell command — the prose may be part of it', () => {
    const out = renderPrepPrompt({ ...prep, command: './init.sh', kind: 'shell' }, targets)
    expect(out).toContain('    ./init.sh')
  })
})

describe('open up tabs is mxwl’s job, not an agent task', () => {
  const opts = { hostId: 'h', cli: 'claude' as const, folderTemplate: 'zipper-${key}' }

  it('opens the workspaces and launches nothing', () => {
    const plan = compilePlan('open up tabs for PLAT-5583 and PLAT-5577', opts)
    expect(plan.targets.map((t) => t.key)).toEqual(['PLAT-5583', 'PLAT-5577'])
    expect(plan.targets.flatMap((t) => t.tasks)).toEqual([])
  })

  it('still runs the setup the brief asked for first', () => {
    const plan = compilePlan(
      'in ~/Workspaces/zipper, run /agent:init-branch for both branches, then open up tabs for PLAT-5583 and PLAT-5577',
      opts
    )
    expect(plan.prep?.blocking).toBe(true)
    expect(plan.targets.flatMap((t) => t.tasks)).toEqual([])
  })

  it('keeps real work that sits alongside the phrasing', () => {
    const plan = compilePlan('run the qa checks for PLAT-5583 and PLAT-5577', opts)
    expect(plan.targets[0].tasks.map((t) => t.instruction)).toEqual(['run the qa checks'])
  })

  it.each([
    'open up tabs',
    'open tabs',
    'open the tabs',
    'open up the workspaces',
    'open them',
    'then open up tabs'
  ])('treats %j as mxwl’s own action', (text) => {
    expect(isMxwlAction(text)).toBe(true)
  })

  it.each(['open up tabs and run the tests', 'open a PR', 'reopen the tabs'])(
    'leaves %j as agent work',
    (text) => {
      expect(isMxwlAction(text)).toBe(false)
    }
  )
})
