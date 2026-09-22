import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, useLocalHost } from './fixtures'

test('links an external plugin path and runs a permission-gated workspace tool', async ({
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

  const externalPlugin = join(workRoot, 'external-plugins', 'task-board')
  mkdirSync(join(workRoot, 'external-plugins'), { recursive: true })
  cpSync(join(process.cwd(), 'examples', 'plugins', 'task-board'), externalPlugin, {
    recursive: true
  })

  const discovered = await page.evaluate((path) => window.api.plugins.installPath(path), externalPlugin)
  expect(discovered).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'dev.mxwl.task-board',
        source: 'user',
        installation: 'linked',
        directory: externalPlugin,
        enabled: false
      })
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

  const manifestPath = join(externalPlugin, 'mxwl.plugin.json')
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
  const unlinked = await page.evaluate((path) => window.api.plugins.unlink(path), externalPlugin)
  expect(unlinked).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ id: 'dev.mxwl.task-board' })])
  )
  expect(readFileSync(manifestPath, 'utf8')).toContain('dev.mxwl.task-board')
})

test('serves the browser SDK to a linked plugin with scoped hidden-directory reads', async ({
  page,
  workRoot
}) => {
  const projectRoot = join(workRoot, 'zipper-ZPR-42')
  const dossier = join(projectRoot, '.zipper-agent', 'local', 'ZPR-42')
  mkdirSync(dossier, { recursive: true })
  writeFileSync(join(dossier, 'QA_PREP.md'), '# QA Prep\n', 'utf8')

  const externalPlugin = join(workRoot, 'external-plugins', 'hidden-reader')
  mkdirSync(externalPlugin, { recursive: true })
  writeFileSync(
    join(externalPlugin, 'mxwl.plugin.json'),
    JSON.stringify({
      apiVersion: 1,
      id: 'dev.mxwl.hidden-reader',
      name: 'Hidden Reader',
      version: '1.0.0',
      permissions: ['workspace:read', 'files:read'],
      contributes: {
        workspaceTools: [
          { id: 'probe', title: 'Probe', icon: 'book', order: 250, entry: 'index.html' }
        ]
      }
    }),
    'utf8'
  )
  writeFileSync(
    join(externalPlugin, 'index.html'),
    '<!doctype html><div id="context"></div><div id="result"></div><script src="/__mxwl/sdk/v1.js"></script><script src="./index.js"></script>',
    'utf8'
  )
  writeFileSync(
    join(externalPlugin, 'index.js'),
    `window.mxwl.onContext(async ({ workspace }) => {
      document.querySelector('#context').textContent = workspace.title
      const entries = await window.mxwl.call('files.readDirectory', {
        path: '.zipper-agent/local/ZPR-42'
      })
      document.querySelector('#result').textContent = entries.map((entry) => entry.name).join(', ')
    })`,
    'utf8'
  )

  const hostId = await useLocalHost(page, workRoot)
  const workspace = await page.evaluate(
    ([host, root]) => window.api.workspace.open(host, root),
    [hostId, projectRoot] as const
  )
  await page.reload()
  await page.evaluate(
    (path) => window.api.plugins.installPath(path),
    join(externalPlugin, 'mxwl.plugin.json')
  )
  await page.evaluate(() => window.api.plugins.setEnabled('dev.mxwl.hidden-reader', true))

  await page.getByRole('button', { name: 'Probe', exact: true }).click()
  const plugin = page.frameLocator('iframe[title="Hidden Reader: Probe"]')
  await expect(plugin.locator('#context')).toContainText('zipper-ZPR-42')
  await expect(plugin.locator('#result')).toHaveText('QA_PREP.md')

  const escapedDirectory = await page.evaluate(async ({ pluginId, wsId }) => {
    try {
      await window.api.plugins.call(pluginId, wsId, 'files.readDirectory', { path: '../outside' })
      return ''
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }, { pluginId: 'dev.mxwl.hidden-reader', wsId: workspace.id })
  expect(escapedDirectory).toContain('stay inside the workspace')
})

test('prefers a linked plugin over an obsolete managed copy', async ({ app, page, workRoot }) => {
  const source = join(process.cwd(), 'examples', 'plugins', 'task-board')
  const externalPlugin = join(workRoot, 'task-board')
  cpSync(source, externalPlugin, { recursive: true })

  const userData = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'))
  const managedPlugin = join(userData, 'plugins', 'task-board')
  mkdirSync(join(userData, 'plugins'), { recursive: true })
  cpSync(source, managedPlugin, { recursive: true })

  const catalog = await page.evaluate((path) => window.api.plugins.installPath(path), externalPlugin)
  const taskBoards = catalog.filter((plugin) => plugin.id === 'dev.mxwl.task-board')
  expect(taskBoards).toEqual([
    expect.objectContaining({ installation: 'linked', directory: externalPlugin })
  ])
})
