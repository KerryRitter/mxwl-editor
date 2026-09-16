import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { expect, test, useLocalHost } from './fixtures'

async function openWorkspace(page: Page, root: string): Promise<string> {
  const hostId = await useLocalHost(page, root)
  const workspace = await page.evaluate(
    ([host, path]) => window.api.workspace.open(host, path),
    [hostId, root] as const
  )
  await expect
    .poll(async () => {
      const state = (await page.evaluate(() => window.api.workspace.list())).find(
        (item) => item.id === workspace.id
      )
      return state?.status
    })
    .toBe('connected')
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  return workspace.id
}

function initializeRepo(root: string): void {
  execFileSync('git', ['init', '-q'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'mxwl@example.test'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'mxwl test'], { cwd: root })
}

test('stages individual hunks, stages the rest, and commits from Changes', async ({
  page,
  workRoot
}) => {
  initializeRepo(workRoot)
  const base = Array.from({ length: 45 }, (_, index) => `line ${index + 1}`)
  writeFileSync(join(workRoot, 'multi.txt'), `${base.join('\n')}\n`, 'utf8')
  execFileSync('git', ['add', '.'], { cwd: workRoot })
  execFileSync('git', ['commit', '-qm', 'base'], { cwd: workRoot })
  execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:example/mxwl-test.git'], {
    cwd: workRoot
  })
  const changed = [...base]
  changed[1] = 'line 2 changed'
  changed[38] = 'line 39 changed'
  writeFileSync(join(workRoot, 'multi.txt'), `${changed.join('\n')}\n`, 'utf8')

  const wsId = await openWorkspace(page, workRoot)
  await page.getByRole('button', { name: 'Changes' }).click()
  const changedFile = page.locator('button[title^="multi.txt"]')
  await expect(changedFile).toBeVisible()
  await changedFile.click()
  await expect(page.getByRole('button', { name: /Stage #1/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Stage #2/ })).toBeVisible()

  await page.getByRole('button', { name: /Stage #1/ }).click()
  await expect
    .poll(() => execFileSync('git', ['diff', '--cached', '--', 'multi.txt'], { cwd: workRoot }).toString())
    .toContain('line 2 changed')
  expect(
    execFileSync('git', ['diff', '--cached', '--', 'multi.txt'], { cwd: workRoot }).toString()
  ).not.toContain('line 39 changed')
  expect(execFileSync('git', ['diff', '--', 'multi.txt'], { cwd: workRoot }).toString()).toContain(
    'line 39 changed'
  )

  await page.getByRole('button', { name: 'Stage file' }).click()
  await expect
    .poll(() => execFileSync('git', ['diff', '--', 'multi.txt'], { cwd: workRoot }).toString())
    .toBe('')
  await page.getByPlaceholder('Commit message…').fill('test review workflow')
  await page.getByRole('button', { name: 'Commit', exact: true }).click()
  await expect
    .poll(() => execFileSync('git', ['log', '-1', '--pretty=%s'], { cwd: workRoot }).toString().trim())
    .toBe('test review workflow')

  const branch = execFileSync('git', ['branch', '--show-current'], { cwd: workRoot }).toString().trim()
  const prUrl = await page.evaluate((id) => window.api.workspace.gitPullRequestUrl(id), wsId)
  expect(prUrl).toBe(`https://github.com/example/mxwl-test/compare/${branch}?expand=1`)
})

test('searches everything, applies layouts, maximizes panes, and creates a tmux tab', async ({
  page,
  workRoot
}) => {
  mkdirSync(join(workRoot, 'src'), { recursive: true })
  writeFileSync(join(workRoot, 'src', 'RareWidgetController.ts'), 'export const rare = true\n', 'utf8')
  const wsId = await openWorkspace(page, workRoot)

  await page.keyboard.press('Control+k')
  await expect(page.getByText('Search everything', { exact: true })).toBeVisible()
  await page.getByPlaceholder('Files, tabs, commands, agents, terminals…').fill('rwc')
  await expect(page.getByText('RareWidgetController.ts', { exact: true })).toBeVisible()
  await page.getByText('RareWidgetController.ts', { exact: true }).click()
  await expect(page.getByText('RareWidgetController.ts', { exact: true })).toBeVisible()

  const preset = page.getByRole('combobox', { name: 'Workspace layout preset' })
  await preset.selectOption('review')
  await expect(page.getByText('Working tree', { exact: true })).toBeVisible()
  const workspace = (await page.evaluate(() => window.api.workspace.list())).find(
    (item) => item.id === wsId
  )!
  await expect
    .poll(() =>
      page.evaluate(
        ([hostId, root]) =>
          localStorage.getItem(`mxwl.workspace.${hostId}::${root}.layoutPreset`),
        [workspace.hostId, workspace.remotePath] as const
      )
    )
    .toBe('review')

  const maximize = page.getByTitle(/Maximize code pane/)
  await maximize.click()
  await expect(page.getByTitle(/Restore layout/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTitle(/Maximize code pane/)).toBeVisible()

  await page.getByRole('button', { name: 'Terminal', exact: true }).click()
  const tmuxButton = page.getByTitle('Attach or create a persistent tmux shell')
  await expect(tmuxButton).toBeEnabled()
  await expect(tmuxButton).toBeVisible()
  await page.evaluate(
    ([id, root]) =>
      window.api.terminal.open(id, {
        cwd: root,
        cols: 100,
        rows: 28,
        label: 'tmux:mxwl-e2e-persist',
        tmuxName: 'mxwl-e2e-persist'
      }),
    [wsId, workRoot] as const
  )
  await expect
    .poll(async () => {
      const workspace = (await page.evaluate(() => window.api.workspace.list())).find(
        (item) => item.id === wsId
      )
      return workspace?.terminal.sessions.some((session) => session.tmuxName === 'mxwl-e2e-persist')
    })
    .toBe(true)
})

test('launches a ticket worktree with a browser sandbox and seeded agent mission', async ({
  page,
  workRoot
}) => {
  initializeRepo(workRoot)
  writeFileSync(join(workRoot, 'README.md'), 'base\n', 'utf8')
  execFileSync('git', ['add', '.'], { cwd: workRoot })
  execFileSync('git', ['commit', '-qm', 'base'], { cwd: workRoot })
  const sourceId = await openWorkspace(page, workRoot)
  const target = `${workRoot}-DEV-42`

  try {
    await page.getByTitle(/Launch ticket worktree/).click()
    await page.getByRole('textbox', { name: 'Ticket' }).fill('DEV-42')
    await page.getByRole('button', { name: 'Launch everything' }).click()
    await expect(page.getByText('DEV-42', { exact: true })).toBeVisible()

    await expect
      .poll(async () => {
        const workspaces = await page.evaluate(() => window.api.workspace.list())
        return workspaces.find((item) => item.remotePath === target) ?? null
      })
      .not.toBeNull()

    const worktree = (await page.evaluate(() => window.api.workspace.list())).find(
      (item) => item.remotePath === target
    )!
    expect(execFileSync('git', ['branch', '--show-current'], { cwd: target }).toString().trim()).toBe(
      'dev-42'
    )
    const browser = await page.evaluate((id) => window.api.browser.snapshot(id), worktree.id)
    expect(browser?.groups.some((group) => group.label === 'DEV-42')).toBe(true)

    await expect
      .poll(async () => {
        const state = await page.evaluate((id) => window.api.agent.get(id), worktree.id)
        return state?.messages
          .flatMap((message) => message.blocks.map((block) => ('text' in block ? block.text : '')))
          .join('\n')
      }, { timeout: 30_000 })
      .toContain('Ticket: DEV-42')

    await page.evaluate((id) => window.api.workspace.close(id), worktree.id)
  } finally {
    if (existsSync(target)) {
      execFileSync('git', ['worktree', 'remove', '--force', target], { cwd: workRoot })
    }
    // Keep the source reference live so the test cannot accidentally clean the wrong workspace.
    expect(sourceId).toBeTruthy()
  }
})
