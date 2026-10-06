import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Page } from 'playwright'
import { expect, test, useLocalHost } from './fixtures'

const runFile = promisify(execFile)
const issue = {
  number: 42,
  title: 'Handle payment retries without duplicate charges',
  state: 'open',
  html_url: 'https://github.com/acme/checkout/issues/42',
  body: 'Retry transient payment failures safely.\n\nUse an idempotency key for each order, preserve successful charges, and cover repeated requests in the checkout tests.',
  labels: [{ name: 'payments' }, { name: 'bug' }],
  assignee: { login: 'studio-developer' }
}
const pull = {
  number: 88,
  title: 'Guard payment retries with idempotency keys',
  state: 'open',
  html_url: 'https://github.com/acme/checkout/pull/88',
  user: { login: 'studio-developer' },
  draft: true
}

async function mockGithub(app: ElectronApplication): Promise<void> {
  await app.evaluate(
    (_electron, data) => {
      const originalFetch = globalThis.fetch
      globalThis.fetch = async (input, init) => {
        const url = new URL(
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url
        )
        if (url.host !== 'api.github.com' && url.host !== 'ghe.example.test')
          return originalFetch(input, init)
        const path = url.pathname.replace(/^\/api\/v3/, '')
        if (path === '/user')
          return Response.json({ login: 'studio-developer' })
        if (path === '/rate_limit') return Response.json({})
        if (path.endsWith('/issues/42')) return Response.json(data.issue)
        if (path.endsWith('/issues/88'))
          return Response.json({ ...data.issue, number: 88, pull_request: {} })
        if (path.endsWith('/issues'))
          return Response.json([
            data.issue,
            { ...data.issue, number: 88, pull_request: {} }
          ])
        if (path.endsWith('/pulls')) return Response.json([data.pull])
        return Response.json({}, { status: 404 })
      }
    },
    { issue, pull }
  )
}

async function openGithubWorkspace(
  page: Page,
  workRoot: string
): Promise<string> {
  writeFileSync(join(workRoot, 'README.md'), '# Checkout\n')
  await runFile('git', ['init', '-q', '-b', 'gh-42'], { cwd: workRoot })
  await runFile('git', ['add', '.'], { cwd: workRoot })
  await runFile(
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
  await runFile(
    'git',
    ['remote', 'add', 'origin', 'git@github.com:acme/checkout.git'],
    { cwd: workRoot }
  )
  const host = await useLocalHost(page, workRoot)
  const workspace = await page.evaluate(
    async ({ host, root }) => {
      const [project] = await window.api.project.list()
      await window.api.project.save({
        ...project,
        integrations: {
          ...project.integrations,
          taskProvider: 'github-issues',
          scmProvider: 'github'
        },
        derive: {
          ...project.derive,
          folderPattern: '(?<name>.+)-(?<issue>GH-\\d+)$',
          titleTemplate: '${name}',
          issueKeyTemplate: '${issue}'
        }
      })
      const [location] = await window.api.project.locations()
      return window.api.workspace.open(host, root, location.id)
    },
    { host, root: workRoot }
  )
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Ticket & PR', exact: true })
  ).toBeVisible()
  return workspace.id
}

test('GitHub accounts preserve saved tokens and reset them when the host or method changes', async ({
  app,
  page
}) => {
  await mockGithub(app)
  await page.getByTitle('Settings (Ctrl+,)').click()
  await page
    .getByRole('combobox', { name: 'GitHub authentication', exact: true })
    .selectOption('token')
  await page
    .getByLabel('GitHub token', { exact: true })
    .fill('fixture-github-token')
  await page.getByRole('button', { name: 'Test GitHub connection' }).click()
  await expect(page.getByRole('status')).toContainText('studio-developer')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const saved = await page.evaluate(() => window.api.settings.get())
  expect(saved.github?.tokenEnc).toBeTruthy()
  expect(saved.github?.tokenEnc).not.toBe('fixture-github-token')
  const again = await page.evaluate(() =>
    window.api.settings.update({
      github: { host: 'https://github.com', auth: 'token' }
    })
  )
  expect(again.github?.tokenEnc).toBe(saved.github?.tokenEnc)
  const moved = await page.evaluate(() =>
    window.api.settings.update({
      github: { host: 'ghe.example.test', auth: 'token' }
    })
  )
  expect(moved.github?.tokenEnc).toBe('')
  const cli = await page.evaluate(() =>
    window.api.settings.update({
      github: { host: 'github.com', auth: 'cli', token: 'unused-fixture' }
    })
  )
  expect(cli.github?.tokenEnc).toBe('')
})

test('GitHub issue and draft PR cards work with an inferred origin repository', async ({
  app,
  page,
  workRoot
}) => {
  await mockGithub(app)
  const folder = join(workRoot, 'checkout-GH-42')
  mkdirSync(folder)
  const id = await openGithubWorkspace(page, folder)
  const context = await page.evaluate(
    (id) => window.api.integrations.context(id),
    id
  )
  expect(context.githubRepository).toEqual({ owner: 'acme', repo: 'checkout' })
  expect(context.issueUrl).toBe(issue.html_url)
  await page.getByRole('button', { name: 'Ticket & PR', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'GitHub issue', exact: true })
  ).toBeVisible()
  await expect(page.getByText(issue.title, { exact: true })).toBeVisible()
  await expect(page.getByText(pull.title, { exact: true })).toBeVisible()
  await expect(page.getByText('Draft', { exact: true })).toBeVisible()
  await expect(page.getByText('payments', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Open in GitHub', exact: true })
  ).toHaveCount(2)
  if (process.env.MXWL_CAPTURE_GITHUB === '1') {
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]
      window.unmaximize()
      window.setSize(1440, 1000)
    })
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({
      path: join(process.cwd(), 'docs/assets/mxwl-github.png'),
      animations: 'disabled'
    })
  }
})

test('a selected GitHub issue launches a worktree with its description and browser sandbox', async ({
  app,
  page,
  workRoot
}) => {
  await mockGithub(app)
  await openGithubWorkspace(page, workRoot)
  await page.getByTitle(/Launch ticket worktree/).click()
  const before = await page.evaluate(() => window.api.workspace.list())
  await page
    .getByRole('textbox', { name: 'Ticket', exact: true })
    .fill('#88')
  await page.getByRole('button', { name: 'Launch everything' }).click()
  await expect(page.getByText(/pull-request numbers cannot launch/)).toBeVisible()
  expect(
    (await page.evaluate(() => window.api.workspace.list())).map(
      (workspace) => workspace.id
    )
  ).toEqual(before.map((workspace) => workspace.id))
  await page.getByRole('button', { name: /#42 Handle payment retries/ }).click()
  await expect(
    page.getByRole('textbox', { name: 'Ticket', exact: true })
  ).toHaveValue('#42')
  await expect(
    page.getByRole('textbox', { name: 'Branch', exact: true })
  ).toHaveValue('gh-42')
  await page
    .getByRole('textbox', { name: 'Branch', exact: true })
    .fill('fix/gh-42-payment-retries')
  await page.getByRole('button', { name: 'Launch everything' }).click()
  await expect
    .poll(async () => {
      const workspaces = await page.evaluate(() => window.api.workspace.list())
      return workspaces.find(
        (workspace) => workspace.derived.branch === 'fix/gh-42-payment-retries'
      )?.derived.issueKey
    })
    .toBe('GH-42')
  const workspace = (
    await page.evaluate(() => window.api.workspace.list())
  ).find(
    (workspace) => workspace.derived.branch === 'fix/gh-42-payment-retries'
  )!
  const browser = await page.evaluate(
    (id) => window.api.browser.snapshot(id),
    workspace.id
  )
  expect(browser?.groups.some((group) => group.label === '#42')).toBe(true)
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
    .toContain(`Issue: ${issue.html_url}\n\nIssue description:\n${issue.body}`)
  await page.evaluate((id) => window.api.workspace.close(id), workspace.id)
})
