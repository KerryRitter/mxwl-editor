import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'
import { emptyProject } from '../src/shared/projects'
import { expect, test, useLocalHost } from './fixtures'

test('host setup is connection-only and project/location setup opens the configured app', async ({
  page,
  workRoot
}) => {
  const checkout = join(workRoot, 'one')
  mkdirSync(join(checkout, 'apps', 'web'), { recursive: true })
  await page.getByRole('button', { name: 'Add project', exact: false }).click()
  await page.getByLabel('Project name', { exact: true }).fill('UI App')
  const generalTab = page.getByRole('tab', { name: 'General', exact: true })
  await generalTab.focus()
  await page.keyboard.press('ArrowRight')
  await expect(
    page.getByRole('tab', { name: 'Browser', exact: true })
  ).toBeFocused()
  await expect(
    page.getByRole('tab', { name: 'Browser', exact: true })
  ).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('End')
  await expect(
    page.getByRole('tab', { name: 'Plugins', exact: true })
  ).toBeFocused()
  await page.keyboard.press('Home')
  await expect(generalTab).toBeFocused()
  await expect(page.getByRole('tabpanel')).toHaveAttribute(
    'aria-labelledby',
    (await generalTab.getAttribute('id')) as string
  )
  await page.getByRole('tab', { name: 'Browser', exact: true }).click()
  await page.getByRole('button', { name: 'Add browser profile' }).click()
  await page.getByLabel('Profile name', { exact: true }).fill('Local QA')
  await page.getByLabel('Browser URL', { exact: true }).fill('about:blank')
  await page.getByRole('tab', { name: 'Services', exact: true }).click()
  await page.getByRole('button', { name: 'Add service', exact: false }).click()
  await page.getByLabel('Service label', { exact: true }).fill('Web UI')
  await page.getByLabel('Service start', { exact: true }).fill('echo ready')
  await page.getByRole('button', { name: 'Save project', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'UI App', exact: true })
  ).toBeVisible()
  expect(
    (await page.evaluate(() => window.api.project.list())).map((p) => p.label)
  ).toEqual(['UI App'])
  expect(await page.evaluate(() => window.api.host.list())).toHaveLength(1)
  await expect(
    page.getByRole('heading', { name: 'This machine', exact: true })
  ).toBeVisible()
  await expect(
    page.getByText('Always available', { exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Remove host checkout', exact: false })
  ).toHaveCount(0)
  await page.getByRole('button', { name: '+ Add host', exact: true }).click()
  const machineSelect = page.getByLabel('Machine connection', { exact: true })
  await expect(
    page.getByLabel('Repository checkout path', { exact: true })
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Continue', exact: true })
  ).toBeDisabled()
  await machineSelect.selectOption(
    await page.evaluate(async () => (await window.api.host.list())[0].id)
  )
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page
    .getByLabel('Repository checkout path', { exact: true })
    .fill(checkout)
  await expect(
    page.getByLabel('Worktrees / workspaces root', { exact: true })
  ).toHaveValue(workRoot)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await page
    .getByRole('button', { name: 'New machine connection', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Tailscale', exact: true })
  ).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(
    page.getByLabel('Repository checkout path', { exact: true })
  ).toHaveValue(checkout)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page
    .getByRole('button', { name: 'Configure checkout', exact: true })
    .click()
  await expect(
    page.getByLabel('Machine connection', { exact: true })
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'New machine connection' })
  ).toHaveCount(0)
  await page
    .getByLabel('Repository checkout path', { exact: true })
    .fill(checkout)
  await page
    .getByLabel('Worktrees / workspaces root', { exact: true })
    .fill(workRoot)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page
    .getByRole('button', { name: 'New browser profile', exact: true })
    .click()
  await page.getByLabel('Profile name', { exact: true }).fill('Staging')
  await page.getByLabel('Browser URL', { exact: true }).fill('about:blank')
  await page
    .getByRole('button', { name: 'Create profile', exact: true })
    .click()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(
    page.getByLabel('Repository checkout path', { exact: true })
  ).toHaveValue(checkout)
  await expect(
    page.getByLabel('Worktrees / workspaces root', { exact: true })
  ).toHaveValue(workRoot)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  const profileId = await page.evaluate(
    async () =>
      (await window.api.project.list())[0].browserProfiles.find(
        (p) => p.label === 'Staging'
      )!.id
  )
  await expect(page.getByLabel('Browser profile', { exact: true })).toHaveValue(
    profileId
  )
  await page.getByText('Advanced checkout settings', { exact: true }).click()
  await page
    .getByLabel('Folder filter (optional glob or /regex/)', { exact: true })
    .fill('one*')
  await page
    .getByLabel('App subdirectory (optional, relative)', { exact: true })
    .fill('apps/web')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByText(checkout, { exact: true })).toBeVisible()
  await page
    .getByRole('button', { name: 'Save project host', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Other workspaces', exact: true })
    .last()
    .click()
  await page
    .getByRole('button', { name: 'Change location or profile', exact: true })
    .click()
  await expect(page.getByLabel('Workspace project')).toHaveValue(
    await page.evaluate(
      async () =>
        (await window.api.project.list()).find((p) => p.label === 'UI App')!.id
    )
  )
  await page.getByRole('button', { name: 'one', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => window.api.workspace.list()))
    .toMatchObject([
      {
        projectLabel: 'UI App',
        remotePath: checkout,
        projectSettings: { services: [{ label: 'Web UI' }] }
      }
    ])
  await expect(
    page.getByRole('button', { name: 'Overview of UI App', exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole('button', {
      name: 'Switch to This machine in UI App',
      exact: true
    })
  ).toBeVisible()
  const wsId = await page.evaluate(
    async () => (await window.api.workspace.list())[0].id
  )
  expect(
    await page.evaluate(
      async () => (await window.api.workspace.list())[0].terminal.sessions
    )
  ).toEqual([])
  await page.getByRole('button', { name: 'Terminal', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await window.api.workspace.list())[0].terminal.sessions.length
      )
    )
    .toBe(1)
  await page.evaluate(async (id) => {
    const ws = (await window.api.workspace.list()).find((w) => w.id === id)!
    await window.api.terminal.input(
      id,
      ws.terminal.sessions[0].id,
      'pwd > .mxwl-terminal-cwd\r'
    )
  }, wsId)
  await expect
    .poll(() => {
      try {
        return readFileSync(
          join(checkout, 'apps', 'web', '.mxwl-terminal-cwd'),
          'utf8'
        ).trim()
      } catch {
        return ''
      }
    })
    .toBe(join(checkout, 'apps', 'web'))
})

test('This machine persists on each project and cannot be removed or reassigned through the API', async ({
  page
}) => {
  const saved = await page.evaluate(async (defaults) => {
    const a = await window.api.project.save({ ...defaults, label: 'First app' })
    const b = await window.api.project.save({
      ...defaults,
      label: 'Second app'
    })
    const locations = await window.api.project.locations()
    const local = locations.find((l) => l.projectId === a.id)!
    const errors: string[] = []
    for (const action of [
      () => window.api.project.deleteLocation(local.id),
      () => window.api.host.delete(local.hostId),
      () =>
        window.api.project.saveLocation({
          ...local,
          projectId: b.id,
          checkoutPath: '/repo'
        }),
      () =>
        window.api.host.save({
          id: local.hostId,
          label: 'Remote',
          kind: 'ssh',
          host: 'example.test',
          port: 22,
          username: 'test',
          auth: { kind: 'agent' }
        })
    ]) {
      try {
        await action()
        errors.push('unexpected success')
      } catch (e) {
        errors.push(String(e))
      }
    }
    return { local, locations, errors }
  }, emptyProject())
  expect(saved.locations).toHaveLength(2)
  expect(saved.locations.every((l) => l.builtinLocal && !l.checkoutPath)).toBe(
    true
  )
  expect(saved.errors[0]).toContain('cannot be removed')
  expect(saved.errors[1]).toContain('project locations')
  expect(saved.errors[2]).toContain('cannot be moved')
  expect(saved.errors[3]).toContain('cannot be converted')
  await page.reload()
  await page
    .getByRole('button', { name: 'Overview of First app', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'This machine', exact: true })
  ).toBeVisible()
  await expect(
    page.getByText('Always available', { exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Remove host checkout', exact: false })
  ).toHaveCount(0)
  expect(
    (await page.evaluate(() => window.api.project.locations())).find(
      (l) => l.id === saved.local.id
    )
  ).toEqual(saved.local)
})

test('multiple apps share hosts without leaking services, URL rules, plugins, or browser cookies', async ({
  app,
  page,
  workRoot
}) => {
  const aPath = join(workRoot, 'a', 'main'),
    bPath = join(workRoot, 'b', 'main')
  mkdirSync(join(aPath, 'apps', 'web'), { recursive: true })
  mkdirSync(bPath, { recursive: true })
  const config = await page.evaluate(
    async ({ defaults, aPath, bPath, root }) => {
      const host = await window.api.host.ensureLocal()
      const secondHost = await window.api.host.save({
        kind: 'local',
        label: 'Second host',
        host: 'localhost',
        username: 'local',
        port: 0,
        auth: { kind: 'none' }
      })
      const a = await window.api.project.save({
        ...defaults,
        label: 'Example App',
        hide: ['private-a'],
        plugins: { 'mxwl.changes': false },
        services: [
          {
            id: 'web',
            label: 'Example App Web',
            start: 'pwd > service-pwd.txt',
            stop: '',
            restart: '',
            logs: ''
          }
        ],
        browserProfiles: [
          { id: 'qa', label: 'QA', url: 'https://qa.example.test' }
        ],
        defaultBrowserProfileId: 'qa'
      })
      const b = await window.api.project.save({
        ...defaults,
        label: 'Site',
        hide: ['private-b'],
        browserProfiles: [
          { id: 'qa', label: 'QA', url: 'https://site.example.test' }
        ],
        defaultBrowserProfileId: 'qa'
      })
      const base = {
        label: 'Dev',
        workspacesRoot: root,
        folderFilter: '',
        browserProfileId: null,
        overrides: {}
      }
      const aLocation = await window.api.project.saveLocation({
        ...base,
        projectId: a.id,
        hostId: host.id,
        checkoutPath: aPath,
        appSubdirectory: 'apps/web'
      })
      const bLocation = await window.api.project.saveLocation({
        ...base,
        projectId: b.id,
        hostId: host.id,
        checkoutPath: bPath,
        appSubdirectory: ''
      })
      const other = await window.api.project.saveLocation({
        ...aLocation,
        id: undefined,
        hostId: secondHost.id,
        label: 'Other machine'
      })
      const aWs = await window.api.workspace.open(host.id, aPath, aLocation.id)
      const bWs = await window.api.workspace.open(host.id, bPath, bLocation.id)
      const overlapLocation = await window.api.project.saveLocation({
        ...bLocation,
        id: undefined,
        checkoutPath: aPath,
        label: 'Shared monorepo'
      })
      const overlapWs = await window.api.workspace.open(
        host.id,
        aPath,
        overlapLocation.id
      )
      const reopenedA = await window.api.workspace.open(
        host.id,
        aPath,
        aLocation.id
      )
      if (reopenedA.id !== aWs.id)
        throw new Error('Duplicate workspace for the same identity')
      const otherWs = await window.api.workspace.open(
        secondHost.id,
        aPath,
        other.id
      )
      return { a, b, aWs, bWs, overlapWs, otherWs, aLocation, bLocation }
    },
    { defaults: emptyProject(), aPath, bPath, root: workRoot }
  )
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await window.api.workspace.list()).every(
          (w) => w.status === 'connected'
        )
      )
    )
    .toBe(true)
  expect(config.aWs.projectId).toBe(config.a.id)
  expect(config.bWs.projectId).toBe(config.b.id)
  expect(config.otherWs.projectId).toBe(config.a.id)
  expect(config.overlapWs.remotePath).toBe(config.aWs.remotePath)
  expect(config.overlapWs.id).not.toBe(config.aWs.id)
  expect(config.overlapWs.projectSettings.services).toEqual([])
  expect(config.aWs.projectSettings.hide).toEqual(['private-a'])
  expect(config.bWs.projectSettings.hide).toEqual(['private-b'])
  expect(config.aWs.derived.browserUrl).toBe('https://qa.example.test')
  expect(config.bWs.derived.browserUrl).toBe('https://site.example.test')
  expect(
    await page.evaluate((id) => window.api.dev.services(id), config.bWs.id)
  ).toEqual([])
  await page.evaluate(
    (id) => window.api.dev.run(id, 'web', 'start'),
    config.aWs.id
  )
  await expect
    .poll(() => {
      try {
        return readFileSync(
          join(aPath, 'apps', 'web', 'service-pwd.txt'),
          'utf8'
        ).trim()
      } catch {
        return ''
      }
    })
    .toBe(join(aPath, 'apps', 'web'))
  const partitions = await page.evaluate(
    async ({ a, b }) => [
      (await window.api.browser.snapshot(a))!.groups[0].partition,
      (await window.api.browser.snapshot(b))!.groups[0].partition
    ],
    { a: config.aWs.id, b: config.bWs.id }
  )
  expect(partitions[0]).not.toBe(partitions[1])
  expect(partitions[0]).toMatch(/^persist:mxwl-project-/)
  await app.evaluate(async ({ session }, partition) => {
    await session.fromPartition(partition).cookies.set({
      url: 'https://qa.example.test',
      name: 'identity',
      value: 'myapp'
    })
  }, partitions[0])
  expect(
    await app.evaluate(
      async ({ session }, partition) =>
        session.fromPartition(partition).cookies.get({ name: 'identity' }),
      partitions[1]
    )
  ).toEqual([])
  await page.evaluate(
    async ({ project, input }) =>
      window.api.project.save({
        ...project,
        browserProfiles: project.browserProfiles.map((p) => ({
          id: p.id,
          label: p.label,
          url: p.url
        })),
        terminalStartup: input
      }),
    { project: config.a, input: 'echo updated' }
  )
  const states = await page.evaluate(() => window.api.workspace.list())
  expect(
    states.find((w) => w.id === config.aWs.id)?.projectSettings.terminalStartup
  ).toBe('echo updated')
  expect(
    states.find((w) => w.id === config.bWs.id)?.projectSettings.terminalStartup
  ).toBe('')
})

test('workspace tree keeps opening defaults and switches without closing other hosts', async ({
  page,
  workRoot
}) => {
  for (const name of ['alpha-one', 'alpha-two', 'remote-one', 'beta-one'])
    mkdirSync(join(workRoot, name))
  const saved = await page.evaluate(
    async ({ defaults, root }) => {
      const local = await window.api.host.ensureLocal()
      const remote = await window.api.host.save({
        kind: 'local',
        label: 'Build machine',
        host: 'localhost',
        port: 0,
        username: 'local',
        auth: { kind: 'none' }
      })
      const alpha = await window.api.project.save({
        ...defaults,
        label: 'Alpha'
      })
      const beta = await window.api.project.save({
        ...defaults,
        label: 'Beta'
      })
      for (const [project, host, checkout, filter] of [
        [alpha, local, 'alpha-one', 'alpha-*'],
        [alpha, remote, 'remote-one', 'remote-*'],
        [beta, local, 'beta-one', 'beta-*']
      ] as const) {
        await window.api.project.saveLocation({
          projectId: project.id,
          hostId: host.id,
          label: 'Development',
          checkoutPath: `${root}/${checkout}`,
          workspacesRoot: root,
          folderFilter: filter,
          appSubdirectory: '',
          browserProfileId: null,
          overrides: {}
        })
      }
      return { alpha, beta, local, remote }
    },
    { defaults: emptyProject(), root: workRoot }
  )
  await page.reload()
  const rows = page.locator('[data-workspace-id]')
  const active = rows.locator('button[aria-current="page"]')
  const alphaLocal = rows.getByRole('button', {
    name: /^Open .+ on This machine in Alpha$/
  })
  const hostCard = (name: string, project: string) =>
    page.getByRole('region', {
      name: `Host ${name} in ${project}`,
      exact: true
    })
  const openProject = async (name: string) => {
    await page
      .getByRole('button', { name: `Overview of ${name}`, exact: true })
      .click()
  }
  const openHost = async (name: string, project = 'Alpha') => {
    await page
      .getByRole('button', {
        name: `Switch to ${name} in ${project}`,
        exact: true
      })
      .click()
  }
  const openFolder = async (
    name: string,
    host = 'This machine',
    project = 'Alpha'
  ) => {
    await hostCard(host, project)
      .getByRole('button', { name: 'Other workspaces', exact: true })
      .click()
    await page.getByRole('button', { name, exact: true }).click()
  }
  await openProject('Alpha')
  await expect(
    page.getByRole('heading', { name: 'This machine', exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Build machine', exact: true })
  ).toBeVisible()
  await openFolder('alpha-one')
  await page.keyboard.press('Control+t')
  await page
    .getByRole('button', { name: 'Change location or profile', exact: true })
    .click()
  await expect(page.getByLabel('Workspace project')).toHaveValue(saved.alpha.id)
  await expect(page.getByLabel('Workspace host')).toHaveValue(saved.local.id)
  await page.getByRole('button', { name: 'alpha-two', exact: true }).click()
  await expect(alphaLocal).toHaveCount(2)
  await openProject('Alpha')
  await openFolder('remote-one', 'Build machine')
  await expect(rows).toHaveCount(3)
  await expect(active).toContainText('remote-one')
  await openProject('Beta')
  await expect(
    page.getByRole('heading', { name: 'Build machine', exact: true })
  ).toHaveCount(0)
  await openFolder('beta-one', 'This machine', 'Beta')
  await expect(rows).toHaveCount(4)
  await expect(active).toContainText('beta-one')
  expect(
    await page.evaluate(async () => (await window.api.workspace.list()).length)
  ).toBe(4)
  await openProject('Alpha')
  await openHost('This machine')
  await expect(alphaLocal).toHaveCount(2)
  await alphaLocal.filter({ hasText: 'alpha-two' }).click()
  await page
    .getByRole('button', { name: 'Close workspace alpha-two', exact: true })
    .click()
  await expect(alphaLocal).toHaveCount(1)
  await page
    .getByRole('button', { name: 'Close workspace alpha-one', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Alpha', exact: true })
  ).toBeVisible()
  await expect(alphaLocal).toHaveCount(0)
  await expect(rows).toHaveCount(2)
  expect(
    await page.evaluate(async () => (await window.api.workspace.list()).length)
  ).toBe(2)
  await page.keyboard.press('Control+t')
  await page
    .getByRole('button', { name: 'Change location or profile', exact: true })
    .click()
  await expect(page.getByLabel('Workspace project')).toHaveValue(saved.alpha.id)
  await expect(page.getByLabel('Workspace host')).toHaveValue(saved.local.id)
})

test('location validation and deletion guards do not mutate source files or open workspace identity', async ({
  page,
  workRoot
}) => {
  const hostId = await useLocalHost(page, workRoot)
  const location = await page.evaluate(
    async () => (await window.api.project.locations())[0]
  )
  const ws = await page.evaluate(
    ({ hostId, root, id }) => window.api.workspace.open(hostId, root, id),
    { hostId, root: workRoot, id: location.id }
  )
  await expect(
    page.evaluate((id) => window.api.project.delete(id), location.projectId)
  ).rejects.toThrow('Close this project')
  await expect(
    page.evaluate((id) => window.api.host.delete(id), hostId)
  ).rejects.toThrow('project locations')
  await expect(
    page.evaluate(
      (l) =>
        window.api.project.saveLocation({ ...l, appSubdirectory: '../escape' }),
      { ...location, id: undefined }
    )
  ).rejects.toThrow('inside the workspace')
  await expect(
    page.evaluate(
      (l) =>
        window.api.project.saveLocation({ ...l, appSubdirectory: 'different' }),
      location
    )
  ).rejects.toThrow('Close this location')
  expect(await page.evaluate(() => window.api.workspace.list())).toMatchObject([
    { id: ws.id, locationId: location.id }
  ])
})

test('restart restores project/location/profile identity and its cookie partition', async ({
  app,
  page,
  workRoot
}) => {
  const hostId = await useLocalHost(page, workRoot)
  const location = await page.evaluate(
    async () => (await window.api.project.locations())[0]
  )
  await page.evaluate(async (id) => {
    const project = (await window.api.project.list()).find((p) => p.id === id)!
    await window.api.project.save({
      ...project,
      browserProfiles: [{ id: 'qa', label: 'QA', url: 'about:blank' }],
      defaultBrowserProfileId: 'qa'
    })
  }, location.projectId)
  const original = await page.evaluate(
    ({ hostId, root, id }) => window.api.workspace.open(hostId, root, id),
    { hostId, root: workRoot, id: location.id }
  )
  await expect
    .poll(() =>
      page.evaluate(async () => (await window.api.workspace.list())[0]?.status)
    )
    .toBe('connected')
  const partition = await page.evaluate(
    async (id) => (await window.api.browser.snapshot(id))!.groups[0].partition,
    original.id
  )
  const userData = await app.evaluate(({ app }) => app.getPath('userData'))
  await app.close()
  const restarted = await electron.launch({
    args: [
      'out/main/index.js',
      `--user-data-dir=${userData}`,
      '--no-sandbox',
      '--disable-gpu'
    ],
    env: {
      ...process.env,
      MXWL_DISABLE_KEEP_ALIVE: '1',
      MXWL_CONTROL_PORT: '0'
    }
  })
  try {
    const restoredPage = await restarted.firstWindow()
    await expect
      .poll(() => restoredPage.evaluate(() => window.api.workspace.list()))
      .toMatchObject([
        {
          projectId: location.projectId,
          locationId: location.id,
          browserProfileId: 'qa'
        }
      ])
    const restored = await restoredPage.evaluate(async () => {
      const ws = (await window.api.workspace.list())[0]
      return {
        ws,
        partition: (await window.api.browser.snapshot(ws.id))!.groups[0]
          .partition
      }
    })
    expect(restored.partition).toBe(partition)
  } finally {
    await restarted.close()
  }
})
