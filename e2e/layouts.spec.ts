import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, useLocalHost } from './fixtures'

const presetSizes: Record<string, [number, number]> = {
  balanced: [48, 58],
  code: [24, 78],
  review: [18, 84],
  debug: [42, 34],
  agent: [30, 28]
}

test('all layouts preserve a live editor and safely leave a loaded split/unified diff', async ({
  page,
  workRoot
}) => {
  const file = join(workRoot, 'layout.ts')
  writeFileSync(file, 'export const layout = "base"\n')
  execFileSync('git', ['init', '-q'], { cwd: workRoot })
  execFileSync(
    'git',
    [
      '-c',
      'user.name=mxwl test',
      '-c',
      'user.email=mxwl@example.test',
      'add',
      '.'
    ],
    { cwd: workRoot }
  )
  execFileSync(
    'git',
    [
      '-c',
      'user.name=mxwl test',
      '-c',
      'user.email=mxwl@example.test',
      'commit',
      '-qm',
      'base'
    ],
    { cwd: workRoot }
  )
  writeFileSync(file, 'export const layout = "changed"\n')
  writeFileSync(join(workRoot, 'other.ts'), 'export const other = true\n')
  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(error.message))
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /renderer crash|disposed|read failed/.test(message.text())
    )
      failures.push(message.text())
  })
  const hostId = await useLocalHost(page, workRoot)
  await page.evaluate(
    ([hostId, root]) => window.api.workspace.open(hostId, root),
    [hostId, workRoot]
  )
  await page.reload()
  const preset = page.getByRole('combobox', { name: 'Workspace layout preset' })
  await page.getByRole('button', { name: 'layout.ts', exact: true }).click()
  const source = page.locator('.monaco-editor:visible .view-lines').first()
  await expect(source).toContainText('changed')
  const input = page.locator('.monaco-editor:visible textarea').first()
  await input.focus()
  await page.keyboard.press('Control+Home')
  await page.keyboard.type('// unsaved layout draft\n')
  for (const diffMode of ['Split', 'Unified']) {
    await preset.selectOption('review')
    await page.locator('button[title^="layout.ts"]').click()
    await expect(page.locator('.monaco-diff-editor:visible')).toBeVisible()
    await page.getByRole('button', { name: diffMode, exact: true }).click()
    for (const layout of ['code', 'balanced', 'debug', 'agent', 'review']) {
      await preset.selectOption(layout)
      await expect(preset).toHaveValue(layout)
      for (const [direction, size] of [
        ['horizontal', presetSizes[layout][0]],
        ['vertical', presetSizes[layout][1]]
      ] as const) {
        const panel = page
          .locator(`[data-panel-group-direction="${direction}"]`)
          .first()
          .locator(':scope > [data-panel-id]')
          .first()
        await expect
          .poll(async () => Number(await panel.getAttribute('data-panel-size')))
          .toBe(size)
      }
      await expect(
        page.getByText('Something crashed in the UI', { exact: true })
      ).toHaveCount(0)
      if (layout === 'code')
        await expect(source).toContainText('unsaved layout draft')
      if (layout === 'debug')
        await expect(page.locator('.xterm:visible').first()).toBeVisible()
      if (layout === 'agent')
        await expect(page.getByLabel('Agent conversation')).toBeVisible()
      if (layout === 'review')
        await expect(page.locator('.monaco-diff-editor:visible')).toBeVisible()
      expect(failures).toEqual([])
    }
    // Replacing diff models and maximizing/collapsing panes must also be safe.
    await page.locator('button[title^="other.ts"]').click()
    await expect(page.locator('.monaco-diff-editor:visible')).toBeVisible()
    await page.locator('button[title^="layout.ts"]').click()
    await expect(page.locator('.monaco-diff-editor:visible')).toBeVisible()
    for (const pane of ['browser', 'code', 'bottom']) {
      await page.keyboard.press(
        `Control+Shift+${pane === 'browser' ? '1' : pane === 'code' ? '2' : '3'}`
      )
      await expect(page.getByTitle(/Restore layout/)).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByTitle(/Restore layout/)).toHaveCount(0)
      expect(failures).toEqual([])
    }
  }
  await preset.selectOption('code')
  await expect(source).toContainText('unsaved layout draft')
  await page.getByTitle('Save (⌘S)').click()
  await expect
    .poll(() => readFileSync(file, 'utf8'))
    .toContain('unsaved layout draft')
  expect(failures).toEqual([])
})

test('every layout restores on reload and plugin/workspace teardown releases loaded Monaco editors safely', async ({
  page,
  workRoot
}) => {
  writeFileSync(join(workRoot, 'restore.ts'), 'export const restored = true\n')
  execFileSync('git', ['init', '-q'], { cwd: workRoot })
  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(error.message))
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /renderer crash|disposed|read failed/.test(message.text())
    )
      failures.push(message.text())
  })
  const hostId = await useLocalHost(page, workRoot)
  const ws = await page.evaluate(
    ([hostId, root]) => window.api.workspace.open(hostId, root),
    [hostId, workRoot]
  )
  await page.reload()
  await page.getByRole('button', { name: 'restore.ts', exact: true }).click()
  await expect(
    page.locator('.monaco-editor:visible .view-lines').first()
  ).toContainText('restored')
  const preset = page.getByRole('combobox', { name: 'Workspace layout preset' })
  for (const layout of ['balanced', 'code', 'review', 'debug', 'agent']) {
    await preset.selectOption(layout)
    await page.reload()
    await expect(preset).toHaveValue(layout)
    await expect(
      page.getByText('Something crashed in the UI', { exact: true })
    ).toHaveCount(0)
    if (layout === 'review')
      await expect(page.locator('.monaco-diff-editor:visible')).toBeVisible()
    if (layout === 'code')
      await expect(
        page.locator('.monaco-editor:visible .view-lines').first()
      ).toContainText('restored')
    expect(failures).toEqual([])
  }
  await preset.selectOption('review')
  await expect(page.locator('.monaco-diff-editor:visible')).toBeVisible()
  await page.evaluate(() =>
    window.api.plugins.setEnabled('mxwl.changes', false)
  )
  await expect(
    page.getByRole('button', { name: 'Changes', exact: true })
  ).toHaveCount(0)
  await page.evaluate(() => window.api.plugins.setEnabled('mxwl.changes', true))
  await preset.selectOption('review')
  await expect(page.locator('.monaco-diff-editor:visible')).toBeVisible()
  await preset.selectOption('code')
  await expect(
    page.locator('.monaco-editor:visible .view-lines').first()
  ).toContainText('restored')
  await page.evaluate(() => window.api.plugins.setEnabled('mxwl.code', false))
  expect(failures).toEqual([])
  await expect(
    page.getByRole('button', { name: 'Code', exact: true })
  ).toHaveCount(0)
  await page.evaluate(() => window.api.plugins.setEnabled('mxwl.code', true))
  expect(failures).toEqual([])
  await preset.selectOption('code')
  await expect(
    page.locator('.monaco-editor:visible .view-lines').first()
  ).toContainText('restored')
  await preset.selectOption('review')
  await expect(page.locator('.monaco-diff-editor:visible')).toBeVisible()
  await page
    .getByRole('button', { name: `Close workspace ${ws.title}`, exact: true })
    .click()
  await expect(preset).toHaveCount(0)
  expect(failures).toEqual([])
})
