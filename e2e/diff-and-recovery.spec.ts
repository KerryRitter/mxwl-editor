import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { _electron as electron } from 'playwright'
import { expect, test, useLocalHost } from './fixtures'

test('reviews live changes and persists renamed workspace and terminal tabs', async ({
  app,
  page,
  workRoot
}) => {
  const src = join(workRoot, 'src')
  mkdirSync(src, { recursive: true })
  writeFileSync(join(src, 'answer.ts'), 'export const answer = 41\n', 'utf8')
  execFileSync('git', ['init', '-q'], { cwd: workRoot })
  execFileSync('git', ['config', 'user.email', 'mxwl@example.test'], { cwd: workRoot })
  execFileSync('git', ['config', 'user.name', 'mxwl test'], { cwd: workRoot })
  execFileSync('git', ['add', '.'], { cwd: workRoot })
  execFileSync('git', ['commit', '-qm', 'base'], { cwd: workRoot })
  writeFileSync(join(src, 'answer.ts'), 'export const answer = 42\nexport const unit = "life"\n', 'utf8')
  writeFileSync(join(src, 'new.ts'), 'export const fresh = true\n', 'utf8')

  const hostId = await useLocalHost(page, workRoot)
  await page.evaluate(
    ([host, path]) => window.api.workspace.open(host, path),
    [hostId, workRoot] as const
  )
  await page.reload()

  const changes = page.getByRole('button', { name: 'Changes' })
  await expect(changes).toBeVisible()
  await changes.click()
  await expect(page.getByText('Changed files')).toBeVisible()
  await expect(page.getByText('answer.ts')).toBeVisible()
  await expect(page.getByText('new.ts')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Unified' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Split' })).toBeVisible()
  await page.locator('button[title^="src/answer.ts"]').click()
  await expect(page.locator('.monaco-diff-editor')).toBeVisible()
  await page.getByRole('button', { name: 'Unified' }).click()

  await page.getByTitle('Rename tab').click()
  const workspaceName = page.getByRole('textbox', { name: 'Workspace tab name' })
  await workspaceName.fill('Release train')
  await workspaceName.press('Enter')
  await expect(page.getByText('Release train')).toBeVisible()

  await page.getByRole('button', { name: 'Terminal', exact: true }).click()
  const shellTab = page.locator('button[title^="shell — double-click"]')
  await expect(shellTab).toBeVisible()
  await shellTab.dblclick()
  const terminalName = page.getByRole('textbox', { name: 'Terminal tab name' })
  await terminalName.fill('watch tests')
  await terminalName.press('Enter')
  await expect(page.getByText('watch tests')).toBeVisible()

  await page.getByRole('button', { name: 'Zoom app in' }).click()
  await expect(page.getByRole('button', { name: 'Reset app zoom' })).toHaveText('UI 110%')

  const sessionFile = await app.evaluate(({ app: electronApp }) =>
    `${electronApp.getPath('userData')}/session.json`
  )
  await expect
    .poll(() => JSON.parse(readFileSync(sessionFile, 'utf8')))
    .toMatchObject({
      workspaces: [
        {
          title: 'Release train',
          terminals: [{ label: 'watch tests' }]
        }
      ]
    })

  // A new Electron process gets new PTYs, but the user's named tabs and bounded
  // terminal output checkpoint should come back from the durable session file.
  await app.close()
  const relaunched = await electron.launch({
    args: [
      'out/main/index.js',
      `--user-data-dir=${dirname(sessionFile)}`,
      '--no-sandbox',
      '--disable-gpu'
    ],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      MXWL_DISABLE_KEEP_ALIVE: '1',
      MXWL_CONTROL_PORT: '0'
    }
  })
  try {
    const restored = await relaunched.firstWindow()
    await restored.waitForLoadState('domcontentloaded')
    await expect(restored.getByText('Release train')).toBeVisible()
    await expect(restored.getByText('watch tests')).toBeVisible()
    await expect(restored.getByText(/restored after restart/)).toBeVisible()
    await expect(restored.getByRole('button', { name: 'Reset app zoom' })).toHaveText('UI 110%')
  } finally {
    await relaunched.close()
  }
})
