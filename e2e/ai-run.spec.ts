import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import type { AiRunState } from '../src/shared/types'
import { expect, test, useLocalHost, setAiSettings } from './fixtures'

/**
 * Exercises the whole run against the local machine: the brief's setup command
 * creates the ticket folders, the runner waits for them, then opens a workspace
 * and a terminal per ticket. Nothing here touches a remote host.
 */
test('runs the brief setup command, waits for it, then opens the ticket tabs', async ({
  page,
  workRoot
}) => {
  const repo = join(workRoot, 'zipper')
  mkdirSync(repo, { recursive: true })
  const init = join(repo, 'init.sh')
  writeFileSync(
    init,
    '#!/bin/bash\nsleep 1\nmkdir -p ../zipper-PLAT-5583 ../zipper-PLAT-5577\necho init done\n'
  )
  chmodSync(init, 0o755)

  const hostId = await useLocalHost(page, workRoot)
  await setAiSettings(page, {
    workspaceFolderTemplate: 'zipper-${key}',
    initTimeoutSec: 60,
    refinePrompts: false,
    // Keep the per-ticket launch inert — this test is about orchestration.
    commandOverrides: { claude: 'echo' }
  })

  const brief = `in ${repo}, run ./init.sh, then run the qa checks for PLAT-5583 and PLAT-5577`

  const plan = await page.evaluate(
    ([b, host]) => window.api.ai.plan({ brief: b, hostId: host, cli: 'claude', refine: false }),
    [brief, hostId] as const
  )
  expect(plan.plan.prep?.kind).toBe('shell')
  expect(plan.plan.prep?.command).toBe('./init.sh')
  expect(plan.plan.prep?.cwd).toBe(repo)

  const started = await page.evaluate((p) => window.api.ai.run(p), plan.plan)

  const final = await expect
    .poll(
      async () => {
        const runs: AiRunState[] = await page.evaluate(() => window.api.ai.runs())
        return runs.find((r) => r.runId === started.runId)?.status
      },
      { timeout: 90_000, intervals: [1000] }
    )
    .toBe('done')
    .then(() =>
      page.evaluate(
        (id) => window.api.ai.runs().then((rs) => rs.find((r) => r.runId === id)!),
        started.runId
      )
    )

  // The setup command actually ran on the host.
  expect(existsSync(join(workRoot, 'zipper-PLAT-5583'))).toBe(true)
  expect(existsSync(join(workRoot, 'zipper-PLAT-5577'))).toBe(true)

  expect(final.prep?.status).toBe('done')
  expect(final.targets.map((t) => t.status)).toEqual(['running', 'running'])
  expect(final.tasks).toHaveLength(2)
  expect(final.tasks.every((t) => t.status === 'running')).toBe(true)

  // A workspace and an AI-labelled terminal exist for each ticket.
  const workspaces = await page.evaluate(() => window.api.workspace.list())
  const paths = workspaces.map((w) => w.remotePath)
  expect(paths).toContain(join(workRoot, 'zipper-PLAT-5583'))
  expect(paths).toContain(join(workRoot, 'zipper-PLAT-5577'))

  for (const target of final.targets) {
    const ws = workspaces.find((w) => w.id === target.wsId)!
    expect(ws.terminal.sessions.some((s) => s.aiTaskId)).toBe(true)
  }
})

/**
 * A blocking `/slash-command` setup goes through the CLI headlessly. This stands
 * in for `claude`. The same override is used for the per-ticket launches too, so
 * each invocation records itself under its own pid; only the setup one does the
 * slow work, so an early release is visible in the timestamps.
 */
function fakeCli(dir: string, folders: string[], sleepSec: number): string {
  const cap = join(dir, 'calls')
  mkdirSync(cap, { recursive: true })
  const bin = join(dir, 'fake-claude.sh')
  writeFileSync(
    bin,
    [
      '#!/bin/bash',
      `d="${cap}/$$"`,
      'mkdir -p "$d"',
      'for a in "$@"; do case "$a" in -*) printf "%s\\n" "$a" >> "$d/argv";; esac; done',
      'printf "%s" "${!#}" > "$d/prompt"',
      'case "${!#}" in',
      '  "# Setup"*)',
      `    sleep ${sleepSec}`,
      ...folders.map((f) => `    mkdir -p ${f}`),
      `    date +%s%3N > ${join(dir, 'cli-finished')}`,
      '    ;;',
      'esac',
      'echo cli done',
      ''
    ].join('\n')
  )
  chmodSync(bin, 0o755)
  return bin
}

/** The recorded invocation whose prompt is the setup prompt. */
function setupCall(dir: string): { argv: string[]; prompt: string } {
  const cap = join(dir, 'calls')
  for (const pid of readdirSync(cap)) {
    const prompt = readFileSync(join(cap, pid, 'prompt'), 'utf8')
    if (!prompt.startsWith('# Setup')) continue
    const argvFile = join(cap, pid, 'argv')
    return {
      argv: existsSync(argvFile) ? readFileSync(argvFile, 'utf8').trim().split('\n') : [],
      prompt
    }
  }
  throw new Error(`no setup invocation recorded in ${cap}`)
}

test('a blocking slash-command setup runs headless with the configured flags', async ({
  page,
  workRoot
}) => {
  const repo = join(workRoot, 'zipper')
  mkdirSync(repo, { recursive: true })
  const folders = ['zipper-PLAT-5583', 'zipper-PLAT-5577'].map((f) => join(workRoot, f))
  const bin = fakeCli(workRoot, folders, 5)

  const hostId = await useLocalHost(page, workRoot)
  await setAiSettings(page, {
    workspaceFolderTemplate: 'zipper-${key}',
    initTimeoutSec: 60,
    refinePrompts: false,
    commandOverrides: { claude: bin },
    argsOverrides: { claude: '--dangerously-skip-permissions' }
  })

  const brief =
    `in ${repo}, run /agent:init-branch for both branches, ` +
    'then run the qa checks for PLAT-5583 and PLAT-5577'

  const plan = await page.evaluate(
    ([b, host]) => window.api.ai.plan({ brief: b, hostId: host, cli: 'claude', refine: false }),
    [brief, hostId] as const
  )
  expect(plan.plan.prep?.kind).toBe('cli')
  expect(plan.plan.prep?.blocking).toBe(true)

  const started = await page.evaluate((p) => window.api.ai.run(p), plan.plan)
  await expect
    .poll(
      async () => {
        const runs: AiRunState[] = await page.evaluate(() => window.api.ai.runs())
        return runs.find((r) => r.runId === started.runId)?.status
      },
      { timeout: 90_000, intervals: [500] }
    )
    .toBe('done')

  // Headless flag plus the operator's own args, on the same line.
  const { argv, prompt } = setupCall(workRoot)
  expect(argv).toContain('-p')
  expect(argv).toContain('--dangerously-skip-permissions')

  // The prompt survived the file round-trip and names both folders to create.
  expect(prompt).toContain('zipper-PLAT-5583')
  expect(prompt).toContain('zipper-PLAT-5577')

  // Tabs opened only after the CLI exited.
  const finishedAt = Number(readFileSync(join(workRoot, 'cli-finished'), 'utf8').trim())
  const workspaces = await page.evaluate(() => window.api.workspace.list())
  for (const folder of folders) {
    const ws = workspaces.find((w) => w.remotePath === folder)!
    expect(ws, folder).toBeTruthy()
    expect(ws.createdAt).toBeGreaterThan(finishedAt)
  }
})

/**
 * The shape of `/agent/init-branch`: it makes the folder in its first step and
 * then works inside it for a long time. Gating on the folder would open the
 * ticket tabs almost immediately, onto a checkout that isn't ready.
 */
test('waits for the setup command to exit, not for the folders to appear', async ({
  page,
  workRoot
}) => {
  const repo = join(workRoot, 'zipper')
  mkdirSync(repo, { recursive: true })
  // Both folders exist before the run starts — a folder check passes at t=0.
  mkdirSync(join(workRoot, 'zipper-PLAT-5583'), { recursive: true })
  mkdirSync(join(workRoot, 'zipper-PLAT-5577'), { recursive: true })

  const stamp = join(workRoot, 'init-finished')
  const init = join(repo, 'init.sh')
  writeFileSync(init, `#!/bin/bash\nsleep 6\ndate +%s%3N > ${stamp}\n`)
  chmodSync(init, 0o755)

  const hostId = await useLocalHost(page, workRoot)
  await setAiSettings(page, {
    workspaceFolderTemplate: 'zipper-${key}',
    initTimeoutSec: 60,
    refinePrompts: false,
    commandOverrides: { claude: 'echo' }
  })

  const brief = `in ${repo}, run ./init.sh, then run the qa checks for PLAT-5583 and PLAT-5577`
  const plan = await page.evaluate(
    ([b, host]) => window.api.ai.plan({ brief: b, hostId: host, cli: 'claude', refine: false }),
    [brief, hostId] as const
  )
  const started = await page.evaluate((p) => window.api.ai.run(p), plan.plan)

  await expect
    .poll(
      async () => {
        const runs: AiRunState[] = await page.evaluate(() => window.api.ai.runs())
        return runs.find((r) => r.runId === started.runId)?.status
      },
      { timeout: 90_000, intervals: [500] }
    )
    .toBe('done')

  // The setup script's own clock says it finished before the tabs opened.
  expect(existsSync(stamp), 'run finished before the setup script did').toBe(true)
  const finishedAt = Number(readFileSync(stamp, 'utf8').trim())
  const workspaces = await page.evaluate(() => window.api.workspace.list())
  for (const folder of ['zipper-PLAT-5583', 'zipper-PLAT-5577']) {
    const ws = workspaces.find((w) => w.remotePath === join(workRoot, folder))!
    expect(ws, `${folder} workspace`).toBeTruthy()
    expect(ws.createdAt).toBeGreaterThan(finishedAt)
  }
})

/**
 * The point of blocking is that the tickets depend on what setup builds. If setup
 * failed there is nothing to work in, so launching the agents anyway is worse than
 * launching them early.
 */
test('a failed blocking setup stops the run instead of launching the agents', async ({
  page,
  workRoot
}) => {
  const repo = join(workRoot, 'zipper')
  mkdirSync(repo, { recursive: true })
  const init = join(repo, 'init.sh')
  writeFileSync(init, '#!/bin/bash\necho "clone failed: no such remote" >&2\nexit 3\n')
  chmodSync(init, 0o755)

  const hostId = await useLocalHost(page, workRoot)
  await setAiSettings(page, {
    workspaceFolderTemplate: 'zipper-${key}',
    initTimeoutSec: 60,
    refinePrompts: false,
    commandOverrides: { claude: 'echo' }
  })

  const brief = `in ${repo}, run ./init.sh, then run the qa checks for PLAT-5583 and PLAT-5577`
  const plan = await page.evaluate(
    ([b, host]) => window.api.ai.plan({ brief: b, hostId: host, cli: 'claude', refine: false }),
    [brief, hostId] as const
  )
  const started = await page.evaluate((p) => window.api.ai.run(p), plan.plan)

  const final = await expect
    .poll(
      async () => {
        const runs: AiRunState[] = await page.evaluate(() => window.api.ai.runs())
        return runs.find((r) => r.runId === started.runId)?.status
      },
      { timeout: 90_000, intervals: [500] }
    )
    .toBe('error')
    .then(async () => {
      const runs: AiRunState[] = await page.evaluate(() => window.api.ai.runs())
      return runs.find((r) => r.runId === started.runId)!
    })

  expect(final.prep?.status).toBe('error')
  expect(final.prep?.message).toContain('exited 3')
  // Nothing downstream ran, and the modal says so rather than sitting on `pending`.
  expect(final.tasks.map((t) => t.status)).toEqual(['skipped', 'skipped'])
  expect(final.targets.every((t) => t.status === 'skipped')).toBe(true)

  // No ticket workspace was ever opened — only the setup one, in the base repo.
  const workspaces = await page.evaluate(() => window.api.workspace.list())
  expect(workspaces.map((w) => w.remotePath)).toEqual([repo])
})

/**
 * The reported bug: `open up tabs for PLAT-1 and PLAT-2` was compiled into a task
 * whose prompt was the literal string "open up tabs", so the CLI went and opened
 * editor windows. Opening the workspaces is mxwl's own job, not agent work.
 */
test('“open up tabs” opens the workspaces and launches no agent', async ({ page, workRoot }) => {
  mkdirSync(join(workRoot, 'zipper-PLAT-5583'), { recursive: true })
  mkdirSync(join(workRoot, 'zipper-PLAT-5577'), { recursive: true })

  const hostId = await useLocalHost(page, workRoot)
  await setAiSettings(page, {
    workspaceFolderTemplate: 'zipper-${key}',
    refinePrompts: false,
    commandOverrides: { claude: 'echo' }
  })

  const brief = 'open up tabs for PLAT-5583 and PLAT-5577'
  const plan = await page.evaluate(
    ([b, host]) => window.api.ai.plan({ brief: b, hostId: host, cli: 'claude', refine: false }),
    [brief, hostId] as const
  )
  expect(plan.plan.targets.flatMap((t) => t.tasks)).toEqual([])

  const started = await page.evaluate((p) => window.api.ai.run(p), plan.plan)
  await expect
    .poll(
      async () => {
        const runs: AiRunState[] = await page.evaluate(() => window.api.ai.runs())
        return runs.find((r) => r.runId === started.runId)?.status
      },
      { timeout: 60_000, intervals: [500] }
    )
    .toBe('done')

  // Both workspaces are open …
  const workspaces = await page.evaluate(() => window.api.workspace.list())
  expect(workspaces.map((w) => w.remotePath).sort()).toEqual(
    [join(workRoot, 'zipper-PLAT-5577'), join(workRoot, 'zipper-PLAT-5583')].sort()
  )
  // … and nothing was launched into them.
  expect(workspaces.flatMap((w) => w.terminal.sessions)).toEqual([])
})
