import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, useLocalHost } from './fixtures'

test('manages built-ins and runs a permission-gated local workspace tool', async ({
  app,
  page,
  workRoot
}) => {
  const hostId = await useLocalHost(page, workRoot)
  const workspace = await page.evaluate(
    ([host, root]) => window.api.workspace.open(host, root),
    [hostId, workRoot] as const
  )
  await page.reload()

  await expect(page.getByRole('button', { name: 'Code', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Changes', exact: true })).toBeVisible()

  await page.evaluate(() => window.api.plugins.setEnabled('mxwl.changes', false))
  await expect(page.getByRole('button', { name: 'Changes', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Changes', exact: true })).toHaveCount(0)
  await page.evaluate(() => window.api.plugins.setEnabled('mxwl.changes', true))
  await expect(page.getByRole('button', { name: 'Changes', exact: true })).toBeVisible()

  const userData = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'))
  const pluginsDirectory = join(userData, 'plugins')
  mkdirSync(pluginsDirectory, { recursive: true })
  cpSync(join(process.cwd(), 'examples', 'plugins', 'task-board'), join(pluginsDirectory, 'task-board'), {
    recursive: true
  })

  const discovered = await page.evaluate(() => window.api.plugins.reload())
  expect(discovered).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'dev.mxwl.task-board', source: 'user', enabled: false })
    ])
  )
  await expect(page.getByRole('button', { name: 'Tasks', exact: true })).toHaveCount(0)

  await page.evaluate(() => window.api.plugins.setEnabled('dev.mxwl.task-board', true))
  await page.getByRole('button', { name: 'Tasks', exact: true }).click()
  const plugin = page.frameLocator('iframe[title="Task Board: Tasks"]')
  await expect(plugin.getByText('Task Board', { exact: true })).toBeVisible()
  await expect(plugin.locator('#context')).toContainText(workRoot)
  await plugin.getByPlaceholder('Add something worth shipping…').fill('Wire up Acme tickets')
  await plugin.getByRole('button', { name: 'Add task' }).click()
  await expect(plugin.getByText('Wire up Acme tickets')).toBeVisible()

  const denied = await page.evaluate(async ({ pluginId, wsId }) => {
    try {
      await window.api.plugins.call(pluginId, wsId, 'files.write', {
        path: 'should-not-exist.txt',
        content: 'denied'
      })
      return ''
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }, { pluginId: 'dev.mxwl.task-board', wsId: workspace.id })
  expect(denied).toContain('lacks files:write permission')

  await page.reload()
  const restoredPlugin = page.frameLocator('iframe[title="Task Board: Tasks"]')
  await expect(restoredPlugin.getByText('Wire up Acme tickets')).toBeVisible()

  const manifestPath = join(pluginsDirectory, 'task-board', 'mxwl.plugin.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    permissions: string[]
  }
  manifest.permissions.push('files:write')
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
  const changedPermissions = await page.evaluate(() => window.api.plugins.reload())
  expect(changedPermissions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'dev.mxwl.task-board',
        enabled: false,
        permissionReviewRequired: true
      })
    ])
  )
  await expect(page.getByRole('button', { name: 'Tasks', exact: true })).toHaveCount(0)
  await page.evaluate(() => window.api.plugins.setEnabled('dev.mxwl.task-board', true))
  await expect(page.getByRole('button', { name: 'Tasks', exact: true })).toBeVisible()
  await page.evaluate(() => window.api.plugins.setEnabled('dev.mxwl.task-board', false))
  await expect(page.getByRole('button', { name: 'Tasks', exact: true })).toHaveCount(0)
})
