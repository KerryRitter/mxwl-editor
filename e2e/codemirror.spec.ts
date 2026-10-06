import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, useLocalHost } from './fixtures'

test('Ctrl+S saves from the editor search panel and file tree and reports write failures', async ({
  app,
  page,
  workRoot
}) => {
  const file = join(workRoot, 'save.ts')
  const original = 'export const value = true\n'
  writeFileSync(file, original)
  const host = await useLocalHost(page, workRoot)
  await page.evaluate(
    ([id, root]) => window.api.workspace.open(id, root),
    [host, workRoot]
  )
  await page.reload()
  await page
    .getByRole('combobox', { name: 'Workspace layout preset' })
    .selectOption('code')
  const treeFile = page.getByRole('button', { name: 'save.ts', exact: true })
  await treeFile.click()
  const editor = page
    .getByLabel('Code editor', { exact: true })
    .filter({ visible: true })
  await expect(editor).toContainText('value = true')
  await editor.focus()
  await page.keyboard.press('Control+Home')
  await page.keyboard.insertText('// saved from search\n')
  await page.keyboard.press('Control+f')
  const search = page
    .locator('.cm-search input[name="search"]')
    .filter({ visible: true })
  await expect(search).toBeFocused()
  await page.keyboard.press('Control+s')
  await expect
    .poll(() => readFileSync(file, 'utf8'))
    .toBe('// saved from search\n' + original)
  await page.keyboard.press('Escape')
  await editor.focus()
  await page.keyboard.press('Control+End')
  await page.keyboard.insertText('// saved from tree\n')
  await treeFile.focus()
  await expect(treeFile).toBeFocused()
  await page.keyboard.press('Control+s')
  await expect
    .poll(() => readFileSync(file, 'utf8'))
    .toBe('// saved from search\n' + original + '// saved from tree\n')
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('fs:writefile')
    ipcMain.handle('fs:writefile', () => {
      throw new Error('Disk full fixture')
    })
  })
  await editor.focus()
  await page.keyboard.press('Control+End')
  await page.keyboard.insertText('// keep this unsaved draft\n')
  await page.keyboard.press('Control+s')
  await expect(page.getByRole('alert')).toContainText('Disk full fixture')
  await expect(editor).toContainText('keep this unsaved draft')
  expect(readFileSync(file, 'utf8')).toBe(
    '// saved from search\n' + original + '// saved from tree\n'
  )
})

test('file tabs retain drafts, undo history, cursor and scroll, and save the correct file', async ({
  page,
  workRoot
}) => {
  const first = join(workRoot, 'first.tsx')
  const second = join(workRoot, 'second.ts')
  const firstText =
    'export const Greeting = () => <h1>Hello</h1>\n' +
    Array.from({ length: 250 }, (_, i) => `export const line${i} = ${i}`).join(
      '\n'
    )
  writeFileSync(first, firstText)
  writeFileSync(second, 'export const second = true\r\n')
  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(error.message))
  const host = await useLocalHost(page, workRoot)
  await page.evaluate(
    ([id, root]) => window.api.workspace.open(id, root),
    [host, workRoot]
  )
  await page.reload()
  await page
    .getByRole('combobox', { name: 'Workspace layout preset' })
    .selectOption('code')
  await page.getByRole('button', { name: 'first.tsx', exact: true }).click()
  const source = page
    .getByLabel('Code editor', { exact: true })
    .filter({ visible: true })
  await expect(source).toContainText('Greeting')
  // Language support is loaded on demand, including the JSX parser.
  await expect
    .poll(() => source.locator('.cm-line span').count())
    .toBeGreaterThan(0)
  await source.focus()
  await page.keyboard.press('Control+Home')
  await page.keyboard.insertText('// first draft\n')
  await page.keyboard.press('Control+End')
  await expect
    .poll(() => source.evaluate((el) => el.closest('.cm-scroller')!.scrollTop))
    .toBeGreaterThan(0)
  const scroll = await source.evaluate(
    (el) => el.closest('.cm-scroller')!.scrollTop
  )

  await page.getByRole('button', { name: 'second.ts', exact: true }).click()
  await expect(source).toContainText('second = true')
  await source.focus()
  await page.keyboard.press('Control+Home')
  await page.keyboard.type('// second draft\n')
  await page.keyboard.press('Control+s')
  await expect
    .poll(() => readFileSync(second, 'utf8'))
    .toBe('// second draft\r\nexport const second = true\r\n')
  expect(readFileSync(first, 'utf8')).toBe(firstText)

  await page.getByRole('button', { name: 'first.tsx', exact: true }).click()
  await expect
    .poll(() => source.evaluate((el) => el.closest('.cm-scroller')!.scrollTop))
    .toBeCloseTo(scroll, 0)
  await source.focus()
  await page.keyboard.type(' // cursor restored')
  await page.keyboard.press('Control+s')
  await expect
    .poll(() => readFileSync(first, 'utf8'))
    .toBe('// first draft\n' + firstText + ' // cursor restored')
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+s')
  await expect.poll(() => readFileSync(first, 'utf8')).toBe(firstText)
  await page.keyboard.press('Control+Shift+z')
  await page.keyboard.press('Control+s')
  await expect
    .poll(() => readFileSync(first, 'utf8'))
    .toBe('// first draft\n' + firstText)
  expect(readFileSync(second, 'utf8')).toContain('// second draft')
  expect(failures).toEqual([])
})

test('split and unified reviews stay read-only and send original or modified selections to agents', async ({
  page,
  workRoot
}) => {
  const original =
    'export const unchanged = 1\nexport const legacy = "before"\nexport const oldFlag = false\nexport const footer = true\n'
  const modified =
    'export const unchanged = 1\nexport const current = "after"\nexport const newFlag = true\nexport const footer = true\n'
  const file = join(workRoot, 'review.ts')
  writeFileSync(file, original)
  execFileSync('git', ['init', '-q'], { cwd: workRoot })
  execFileSync('git', ['add', '.'], { cwd: workRoot })
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
  writeFileSync(file, modified)
  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(error.message))
  const host = await useLocalHost(page, workRoot)
  const workspace = await page.evaluate(
    ([id, root]) => window.api.workspace.open(id, root),
    [host, workRoot]
  )
  await page.reload()
  const preset = page.getByRole('combobox', { name: 'Workspace layout preset' })
  const explain = page.getByTitle('Ask the agent to explain the selected lines')

  for (const mode of ['Split', 'Unified']) {
    for (const side of ['before', 'after'] as const) {
      await preset.selectOption('review')
      await page.getByRole('button', { name: mode, exact: true }).click()
      await expect(
        page.getByRole('region', { name: 'Code changes' })
      ).toBeVisible()
      const selected =
        side === 'before'
          ? 'export const legacy = "before"'
          : 'export const current = "after"'
      if (mode === 'Unified' && side === 'before') {
        const line = page
          .locator('.cm-deletedChunk > .cm-deletedLine')
          .filter({ hasText: 'legacy' })
        await expect(line).toBeVisible()
        await line.evaluate((el) => {
          const range = document.createRange()
          range.selectNodeContents(el)
          const selection = document.getSelection()!
          selection.removeAllRanges()
          selection.addRange(range)
        })
      } else {
        const review = page.getByLabel(
          side === 'before' ? 'Before changes' : 'After changes',
          { exact: true }
        )
        await review.focus()
        await page.keyboard.press('Control+Home')
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Home')
        await page.keyboard.press('Shift+End')
        // Typing must never change a review document.
        await page.keyboard.type('DO NOT EDIT')
        await expect(review).not.toContainText('DO NOT EDIT')
        await page.keyboard.press('Control+Home')
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Home')
        await page.keyboard.press('Shift+End')
      }
      await expect(explain).toBeEnabled()
      await explain.click()
      await expect
        .poll(async () => {
          const state = await page.evaluate(
            (id) => window.api.agent.get(id),
            workspace.id
          )
          return state?.messages
            .filter((message) => message.role === 'user')
            .at(-1)
            ?.blocks.map((block) => ('text' in block ? block.text : ''))
            .join('\n')
        })
        .toContain(
          `File: review.ts\nSide: ${side}\nLines: 2-2\n\n\`\`\`\n${selected}\n\`\`\``
        )
      await expect
        .poll(
          async () =>
            (
              await page.evaluate(
                (id) => window.api.agent.get(id),
                workspace.id
              )
            )?.turn
        )
        .toBe('idle')
    }
  }
  expect(readFileSync(file, 'utf8')).toBe(modified)
  expect(failures).toEqual([])
})
