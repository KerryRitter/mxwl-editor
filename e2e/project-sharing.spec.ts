import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { emptyProject } from '../src/shared/projects'
import { expect, test, useLocalHost } from './fixtures'

test('exports selected projects, previews a settings file, and imports copies without overwriting credentials', async ({
  app,
  page,
  workRoot
}) => {
  const hostId = await useLocalHost(page, workRoot)
  const other = await page.evaluate(
    (defaults) => window.api.project.save({ ...defaults, label: 'Other app' }),
    emptyProject()
  )
  const project = await page.evaluate(
    async ({ hostId, root }) => {
      const [project] = await window.api.project.list()
      const remote = await window.api.host.save({
        kind: 'ssh',
        label: 'Build server',
        host: 'dev.example.test',
        port: 2222,
        username: 'developer',
        auth: { kind: 'password', password: 'do-not-share-this-password' }
      })
      await window.api.project.saveLocation({
        projectId: project.id,
        hostId: remote.id,
        label: 'Server checkout',
        checkoutPath: '/srv/test-app',
        workspacesRoot: '/srv/worktrees',
        folderFilter: 'task-*',
        appSubdirectory: 'apps/web',
        browserProfileId: null,
        overrides: { terminalStartup: 'echo sharing-test' }
      })
      return { ...project, remoteId: remote.id, hostId, root }
    },
    { hostId, root: workRoot }
  )
  const file = join(workRoot, 'shared.mxwl.json')
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path })
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, file)
  await page.reload()
  await page.getByRole('button', { name: 'Share settings', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Share project and host settings' })
  await modal.getByRole('checkbox', { name: 'Export Other app', exact: true }).uncheck()
  await modal.getByRole('button', { name: 'Export 1 project…', exact: true }).click()
  await expect(modal.getByRole('status')).toContainText('Settings saved to')
  const bundle = JSON.parse(readFileSync(file, 'utf8'))
  expect(bundle.projects.map((p: { id: string }) => p.id)).toEqual([project.id])
  expect(bundle.locations).toHaveLength(2)
  expect(bundle.hosts).toHaveLength(2)
  expect(readFileSync(file, 'utf8')).not.toContain('encryptedPassword')
  expect(readFileSync(file, 'utf8')).not.toContain('do-not-share-this-password')
  await modal.getByRole('tab', { name: 'Import', exact: true }).click()
  await modal.getByRole('button', { name: 'Choose settings file…', exact: true }).click()
  await expect(
    modal.getByText('/srv/test-app · workspaces: /srv/worktrees', { exact: true })
  ).toBeVisible()
  expect((await page.evaluate(() => window.api.project.list())).length).toBe(2)
  await modal.getByRole('checkbox', { name: 'Import Test project', exact: true }).uncheck()
  await expect(modal.getByRole('button', { name: 'Import 0 projects', exact: true })).toBeDisabled()
  await modal.getByRole('checkbox', { name: 'Import Test project', exact: true }).check()
  const originalHost = await page.evaluate((id) => window.api.host.get(id), project.remoteId)
  await modal.getByRole('button', { name: 'Import 1 project', exact: true }).click()
  await expect(modal.getByRole('status')).toContainText(
    'Imported 1 project, added 0 connections, and reused 2'
  )
  const imported = (await page.evaluate(() => window.api.project.list())).find(
    (p) => p.label === 'Test project (imported)'
  )!
  expect(imported.id).not.toBe(project.id)
  const locations = (await page.evaluate(() => window.api.project.locations())).filter(
    (l) => l.projectId === imported.id
  )
  expect(locations.find((l) => l.builtinLocal)?.hostId).toBe(hostId)
  expect(locations.find((l) => !l.builtinLocal)).toMatchObject({
    checkoutPath: '/srv/test-app',
    appSubdirectory: 'apps/web',
    overrides: { terminalStartup: 'echo sharing-test' }
  })
  expect(await page.evaluate((id) => window.api.host.get(id), project.remoteId)).toEqual(
    originalHost
  )
  expect(
    (await page.evaluate(() => window.api.project.list())).find((p) => p.id === other.id)
  ).toEqual(other)
  await modal.getByTitle('Close (Esc)').click()
  await expect(
    page.getByRole('button', { name: 'Overview of Test project (imported)', exact: true })
  ).toBeVisible()
})

test('rejects malformed files and canceled file dialogs without changing settings', async ({
  app,
  page,
  workRoot
}) => {
  await useLocalHost(page, workRoot)
  const before = await page.evaluate(async () => ({
    projects: await window.api.project.list(),
    hosts: await window.api.host.list(),
    locations: await window.api.project.locations()
  }))
  const file = join(workRoot, 'broken.json')
  writeFileSync(file, '{this is not JSON')
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
    dialog.showSaveDialog = async () => ({ canceled: true, filePath: undefined })
  }, file)
  await page.reload()
  await page.getByRole('button', { name: 'Share settings', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Share project and host settings' })
  await modal.getByRole('button', { name: 'Export 1 project…', exact: true }).click()
  await expect(modal.getByRole('button', { name: 'Export 1 project…', exact: true })).toBeEnabled()
  await expect(modal.getByRole('status')).toHaveCount(0)
  await modal.getByRole('tab', { name: 'Import', exact: true }).click()
  await modal.getByRole('button', { name: 'Choose settings file…', exact: true }).click()
  await expect(modal.getByRole('alert')).toContainText('This file is not valid JSON')
  writeFileSync(file, JSON.stringify({ format: 'mxwl-project-settings', version: 99 }))
  await modal.getByRole('button', { name: 'Choose settings file…', exact: true }).click()
  await expect(modal.getByRole('alert')).toContainText('Invalid mxwl settings file')
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] })
  })
  await modal.getByRole('button', { name: 'Choose settings file…', exact: true }).click()
  await expect(modal.getByRole('alert')).toHaveCount(0)
  expect(
    await page.evaluate(async () => ({
      projects: await window.api.project.list(),
      hosts: await window.api.host.list(),
      locations: await window.api.project.locations()
    }))
  ).toEqual(before)
})

test('opens sharing from one project with only that project selected', async ({
  page,
  workRoot
}) => {
  await useLocalHost(page, workRoot)
  await page.evaluate(
    (defaults) => window.api.project.save({ ...defaults, label: 'Other app' }),
    emptyProject()
  )
  await page.reload()
  await page.getByRole('button', { name: 'Overview of Other app', exact: true }).click()
  await page.getByRole('button', { name: 'Share settings', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Share project and host settings' })
  await expect(modal.getByRole('checkbox', { name: 'Export Other app', exact: true })).toBeChecked()
  await expect(
    modal.getByRole('checkbox', { name: 'Export Test project', exact: true })
  ).not.toBeChecked()
})
