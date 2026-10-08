import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { emptyProject } from '../src/shared/projects'
import { expect, test, useLocalHost } from './fixtures'

test('connection wizard validates fields, explains a failed test, and retains details when going back', async ({
  app,
  page
}) => {
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('host:test')
    ipcMain.handle('host:test', (_event, input) => ({
      ok:
        input.host === 'working.example' &&
        input.auth.keyPath === '~/.ssh/build',
      latencyMs: 12,
      error:
        input.host === 'working.example' ? undefined : 'SSH connection refused'
    }))
  })
  await page
    .getByRole('button', { name: 'Manage connections', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Add host', exact: true })
    .first()
    .click()
  const wizard = page.getByRole('dialog', {
    name: 'Connect a machine',
    exact: true
  })
  await expect(wizard.getByLabel('Host', { exact: true })).toHaveCount(0)
  await wizard.getByRole('button', { name: 'SSH', exact: true }).click()
  await wizard.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(
    wizard.getByRole('button', { name: 'Continue', exact: true })
  ).toBeDisabled()
  await wizard.getByLabel('Label', { exact: true }).fill('Build server')
  await wizard.getByLabel('Host', { exact: true }).fill('offline.example')
  await wizard.getByLabel('Username', { exact: true }).fill('builder')
  await wizard.getByLabel('Authentication', { exact: true }).selectOption('key')
  await expect(
    wizard.getByRole('button', { name: 'Continue', exact: true })
  ).toBeDisabled()
  await wizard
    .getByLabel('Private key path', { exact: true })
    .fill('~/.ssh/build')
  await wizard.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(
    wizard.getByRole('button', { name: 'Save', exact: true })
  ).toBeDisabled()
  expect(await page.evaluate(() => window.api.host.list())).toEqual([])
  await wizard
    .getByRole('button', { name: 'Test connection', exact: true })
    .click()
  await expect(wizard.getByRole('status')).toContainText(
    'SSH connection refused'
  )
  await wizard.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(wizard.getByLabel('Username', { exact: true })).toHaveValue(
    'builder'
  )
  await expect(
    wizard.getByLabel('Private key path', { exact: true })
  ).toHaveValue('~/.ssh/build')
  await wizard.getByLabel('Host', { exact: true }).fill('working.example')
  await wizard.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(wizard.getByRole('status')).toHaveCount(0)
  await wizard
    .getByRole('button', { name: 'Test connection', exact: true })
    .click()
  await expect(wizard.getByRole('status')).toContainText(
    'Connected successfully'
  )
  await wizard.getByRole('button', { name: 'Save', exact: true }).click()
  expect(await page.evaluate(() => window.api.host.list())).toMatchObject([
    {
      label: 'Build server',
      host: 'working.example',
      username: 'builder',
      auth: { kind: 'key', keyPath: expect.stringMatching(/\/\.ssh\/build$/) }
    }
  ])
})

test('adding a new project host guides through a connection and checkout, then opens the checkout directly', async ({
  page,
  workRoot
}) => {
  const checkout = join(workRoot, 'build')
  mkdirSync(checkout)
  await useLocalHost(page, workRoot)
  await page.reload()
  await page
    .getByRole('button', { name: 'Overview of Test project', exact: true })
    .click()
  await page.getByRole('button', { name: '+ Add host', exact: true }).click()
  await page
    .getByRole('button', { name: 'New machine connection', exact: true })
    .click()
  await page.getByRole('button', { name: 'This Machine', exact: true }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByLabel('Label', { exact: true }).fill('Build machine')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByRole('heading', {
      name: 'Where is the repository on Build machine?'
    })
  ).toBeVisible()
  expect(await page.evaluate(() => window.api.host.list())).toHaveLength(2)
  expect(
    await page.evaluate(() => window.api.project.locations())
  ).toHaveLength(1)
  await page
    .getByLabel('Repository checkout path', { exact: true })
    .fill(checkout)
  await expect(
    page.getByLabel('Worktrees / workspaces root', { exact: true })
  ).toHaveValue(workRoot)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(
    page.getByLabel('App subdirectory (optional, relative)')
  ).not.toBeVisible()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByText(checkout, { exact: true })).toBeVisible()
  await page
    .getByRole('button', { name: 'Save project host', exact: true })
    .click()
  const host = page.getByRole('region', {
    name: 'Host Build machine in Test project',
    exact: true
  })
  await host.getByRole('button', { name: 'Open checkout', exact: true }).click()
  await expect(
    page.getByRole('dialog', { name: 'Open Workspace' })
  ).toHaveCount(0)
  await expect
    .poll(() => page.evaluate(() => window.api.workspace.list()))
    .toMatchObject([
      {
        hostLabel: 'Build machine',
        remotePath: checkout,
        projectLabel: 'Test project'
      }
    ])
  await expect(
    page.getByRole('button', {
      name: 'Open build on Build machine in Test project',
      exact: true
    })
  ).toHaveAttribute('aria-current', 'page')
})

test('explorer switches straight across projects, remembers each host workspace, and filters without closing sessions', async ({
  page,
  workRoot
}) => {
  for (const name of ['one', 'two', 'other']) mkdirSync(join(workRoot, name))
  await useLocalHost(page, workRoot)
  const saved = await page.evaluate(
    async ({ root, defaults }) => {
      const local = await window.api.host.ensureLocal()
      const location = (await window.api.project.locations())[0]
      const other = await window.api.project.save({
        ...defaults,
        label: 'Other project'
      })
      const otherLocation = (await window.api.project.locations()).find(
        (l) => l.projectId === other.id
      )!
      await window.api.project.saveLocation({
        ...otherLocation,
        checkoutPath: `${root}/other`,
        workspacesRoot: root
      })
      const one = await window.api.workspace.open(
        local.id,
        `${root}/one`,
        location.id
      )
      const two = await window.api.workspace.open(
        local.id,
        `${root}/two`,
        location.id
      )
      const third = await window.api.workspace.open(
        local.id,
        `${root}/other`,
        otherLocation.id
      )
      return [one.id, two.id, third.id]
    },
    { root: workRoot, defaults: emptyProject() }
  )
  await page.reload()
  const tree = page.getByRole('navigation', { name: 'Workspace explorer' })
  const rows = tree.locator('[data-workspace-id]')
  const active = rows.locator('button[aria-current="page"]')
  await tree
    .getByRole('button', {
      name: 'Open two on This machine in Test project',
      exact: true
    })
    .click()
  await expect(rows).toHaveCount(3)
  await tree
    .getByRole('button', {
      name: 'Switch to This machine in Other project',
      exact: true
    })
    .click()
  await expect(rows).toHaveCount(3)
  await expect(active).toContainText('other')
  await tree
    .getByRole('button', {
      name: 'Switch to This machine in Test project',
      exact: true
    })
    .click()
  await expect(
    tree.getByRole('button', {
      name: 'Open two on This machine in Test project',
      exact: true
    })
  ).toHaveAttribute('aria-current', 'page')
  await tree.getByLabel('Filter projects and workspaces').fill('Other')
  await expect(
    tree.getByRole('button', { name: 'Overview of Test project', exact: true })
  ).toHaveCount(0)
  await tree
    .getByRole('button', {
      name: 'Open other on This machine in Other project',
      exact: true
    })
    .click()
  await expect(rows).toHaveCount(1)
  await tree.getByLabel('Filter projects and workspaces').fill('')
  await tree.getByRole('button', { name: 'Hide workspace explorer' }).click()
  await expect(tree).toHaveCount(0)
  await page.evaluate(
    (id) => window.api.workspace.rename(id, 'Updated while hidden'),
    saved[2]
  )
  await page.getByRole('button', { name: 'Show workspace explorer' }).click()
  await expect(
    tree.getByRole('button', {
      name: 'Open Updated while hidden on This machine in Other project',
      exact: true
    })
  ).toHaveAttribute('aria-current', 'page')
  expect(
    (await page.evaluate(() => window.api.workspace.list()))
      .map((w) => w.id)
      .sort()
  ).toEqual(saved.sort())
})

test('workspace picker supports single click and an explicit multiple selection mode', async ({
  page,
  workRoot
}) => {
  for (const name of ['one', 'two']) mkdirSync(join(workRoot, name))
  await useLocalHost(page, workRoot)
  await page.evaluate(async () => {
    const location = (await window.api.project.locations())[0]
    await window.api.project.saveLocation({ ...location, folderFilter: '*' })
  })
  await page.reload()
  await page
    .getByRole('button', { name: 'Other workspaces', exact: true })
    .click()
  const picker = page.getByRole('dialog', {
    name: 'Open Workspace',
    exact: true
  })
  await expect(picker.getByLabel('Workspace project')).toHaveCount(0)
  await expect(picker.getByText('Test project · This machine')).toBeVisible()
  await picker
    .getByRole('button', { name: 'Select multiple', exact: true })
    .click()
  await picker.getByRole('button', { name: 'one', exact: true }).click()
  await picker.getByRole('button', { name: 'two', exact: true }).click()
  expect(await page.evaluate(() => window.api.workspace.list())).toHaveLength(0)
  await picker.getByRole('button', { name: 'Open 2', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => window.api.workspace.list()))
    .toHaveLength(2)
  await page.keyboard.press('Control+t')
  await picker.getByRole('button', { name: 'one', exact: true }).click()
  await expect(picker).toHaveCount(0)
  expect(await page.evaluate(() => window.api.workspace.list())).toHaveLength(2)
})

test('picker inherits the current browser profile and a tree action opens the requested project context', async ({
  page,
  workRoot
}) => {
  for (const name of ['one', 'two']) mkdirSync(join(workRoot, name))
  const hostId = await useLocalHost(page, workRoot)
  const otherProject = await page.evaluate(
    async ({ hostId, root, defaults }) => {
      const project = (await window.api.project.list())[0]
      await window.api.project.save({
        ...project,
        browserProfiles: [
          { id: 'default', label: 'Default account', url: 'about:blank' },
          { id: 'qa', label: 'QA account', url: 'about:blank' }
        ],
        defaultBrowserProfileId: 'default'
      })
      const location = (await window.api.project.locations()).find(
        (l) => l.projectId === project.id
      )!
      await window.api.project.saveLocation({ ...location, folderFilter: '*' })
      await window.api.workspace.open(hostId, `${root}/one`, location.id, 'qa')
      const other = await window.api.project.save({
        ...defaults,
        label: 'Other project'
      })
      const otherLocation = (await window.api.project.locations()).find(
        (l) => l.projectId === other.id
      )!
      await window.api.project.saveLocation({
        ...otherLocation,
        checkoutPath: root,
        workspacesRoot: root,
        folderFilter: '*'
      })
      return other.id
    },
    { hostId, root: workRoot, defaults: emptyProject() }
  )
  await page.reload()
  await expect(
    page.getByRole('button', {
      name: 'Open one on This machine in Test project',
      exact: true
    })
  ).toHaveAttribute('aria-current', 'page')
  await page.keyboard.press('Control+t')
  const picker = page.getByRole('dialog', {
    name: 'Open Workspace',
    exact: true
  })
  await expect(picker.getByText('QA account', { exact: true })).toBeVisible()
  await picker
    .getByRole('button', { name: 'Change location or profile' })
    .click()
  await expect(picker.getByLabel('Workspace browser profile')).toHaveValue('qa')
  await picker.getByRole('button', { name: 'two', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => window.api.workspace.list()))
    .toMatchObject([{ browserProfileId: 'qa' }, { browserProfileId: 'qa' }])
  await page
    .getByRole('button', {
      name: 'Open workspace on This machine in Other project',
      exact: true
    })
    .click()
  await expect(
    picker.getByText('Other project · This machine', { exact: true })
  ).toBeVisible()
  await picker
    .getByRole('button', { name: 'Change location or profile' })
    .click()
  await expect(picker.getByLabel('Workspace project')).toHaveValue(otherProject)
  await expect(picker.getByLabel('Workspace browser profile')).toHaveValue('')
  await picker.getByRole('button', { name: 'one', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => window.api.workspace.list()))
    .toHaveLength(3)
  expect(
    await page.evaluate(
      (id) =>
        window.api.workspace
          .list()
          .then((workspaces) => workspaces.find((w) => w.projectId === id)),
      otherProject
    )
  ).toMatchObject({ browserProfileId: null, remotePath: join(workRoot, 'one') })
})
