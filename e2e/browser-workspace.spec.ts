import { createServer, get } from 'node:http'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Page } from 'playwright'
import { emptyProject } from '../src/shared/projects'
import { expect, test, useLocalHost } from './fixtures'

async function openWorkspace(page: Page, root: string) {
  const host = await useLocalHost(page, root)
  const ws = await page.evaluate(
    async ({ host, root }) => {
      const location = (await window.api.project.locations()).find(
        (l) => l.hostId === host
      )!
      return window.api.workspace.open(host, root, location.id)
    },
    { host, root }
  )
  await page.reload()
  await expect
    .poll(() => page.evaluate((id) => window.api.agent.get(id), ws.id))
    .toMatchObject({ status: 'ready' })
  return ws.id
}

async function site() {
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html')
    res.end(
      `<title>Embedded preview</title><input aria-label="Name"><button onclick="document.querySelector('p').textContent=document.querySelector('input').value">Save</button><p>${req.url}</p>`
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

test('host name opens a project tree and switches directly to another host workspace', async ({
  page,
  workRoot
}) => {
  mkdirSync(join(workRoot, 'first'))
  mkdirSync(join(workRoot, 'second'))
  await useLocalHost(page, workRoot)
  const ids = await page.evaluate(
    async ({ root, defaults }) => {
      const project = (await window.api.project.list())[0]
      const firstHost = await window.api.host.ensureLocal()
      const secondHost = await window.api.host.save({
        kind: 'local',
        label: 'Build machine',
        host: 'localhost',
        username: 'local',
        port: 0,
        auth: { kind: 'none' }
      })
      const location = await window.api.project.saveLocation({
        projectId: project.id,
        hostId: secondHost.id,
        label: 'Build',
        checkoutPath: root,
        workspacesRoot: root,
        folderFilter: '',
        appSubdirectory: '',
        browserProfileId: null,
        overrides: {}
      })
      const firstLocation = (await window.api.project.locations()).find(
        (l) => l.projectId === project.id && l.hostId === firstHost.id
      )!
      const first = await window.api.workspace.open(
        firstHost.id,
        `${root}/first`,
        firstLocation.id
      )
      const second = await window.api.workspace.open(
        secondHost.id,
        `${root}/second`,
        location.id
      )
      const unrelated = await window.api.project.save({
        ...defaults,
        label: 'Unrelated'
      })
      return { first: first.id, second: second.id, unrelated: unrelated.id }
    },
    { root: workRoot, defaults: emptyProject() }
  )
  await page.reload()
  await page.locator('button[title="Switch host workspace"]:visible').click()
  await expect(
    page.getByRole('heading', { name: 'Switch host workspace' })
  ).toBeVisible()
  await expect(
    page
      .getByRole('dialog', { name: 'Switch host workspace' })
      .getByText('Unrelated', { exact: true })
  ).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Switch to second on Build machine' })
    .click()
  await expect(
    page.locator('button[title="Switch host workspace"]:visible')
  ).toContainText('Build machine')
  await expect(
    page.locator('[data-workspace-id] button[aria-current="page"]')
  ).toContainText('second')
  await page
    .locator('button[title="Switch host workspace"]:visible')
    .last()
    .click()
  await page
    .getByRole('button', { name: 'Switch to first on This machine' })
    .click()
  await expect(
    page.locator('[data-workspace-id] button[aria-current="page"]')
  ).toContainText('first')
  expect(
    (await page.evaluate(() => window.api.workspace.list()))
      .map((w) => w.id)
      .sort()
  ).toEqual([ids.first, ids.second].sort())
})

test('terminal spinner persists off-screen, settles, and exposes the embedded Playwright endpoint', async ({
  page,
  workRoot
}) => {
  const wsId = await openWorkspace(page, workRoot)
  await page.getByRole('button', { name: 'Terminal', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(
        async (id) =>
          (await window.api.workspace.list()).find((w) => w.id === id)?.terminal
            .sessions.length,
        wsId
      )
    )
    .toBe(1)
  const sessionId = await page.evaluate(
    async (id) =>
      (await window.api.workspace.list()).find((w) => w.id === id)!.terminal
        .sessions[0].id,
    wsId
  )
  await page.evaluate(
    ({ wsId, sessionId }) =>
      window.api.terminal.input(
        wsId,
        sessionId,
        `node -e "require('fs').writeFileSync('.bridge-env.json',JSON.stringify({cdp:process.env.PLAYWRIGHT_MCP_CDP_ENDPOINT,mcp:process.env.MXWL_MCP_URL}));let i=0;const t=setInterval(()=>{process.stdout.write('\\r⠋ Working ('+(i++)+'s)');if(i>20){clearInterval(t);process.stdout.write('\\nDone\\n')}},100)"\r`
      ),
    { wsId, sessionId }
  )
  await expect
    .poll(() =>
      page.evaluate(
        async (id) =>
          (await window.api.workspace.list()).find((w) => w.id === id)?.terminal
            .sessions[0].busy,
        wsId
      )
    )
    .toBe(true)
  await expect(page.getByLabel('Terminal working').first()).toBeVisible()
  await page.getByRole('button', { name: 'Agent', exact: true }).click()
  await expect(
    page
      .getByRole('button', { name: 'Terminal', exact: false })
      .getByLabel('Terminal working')
  ).toBeVisible()
  const status = await page.evaluate((id) => window.api.mcp.status(id), wsId)
  await expect
    .poll(() => {
      try {
        return JSON.parse(
          readFileSync(join(workRoot, '.bridge-env.json'), 'utf8')
        )
      } catch {
        return null
      }
    })
    .toEqual({ cdp: status.cdpUrl, mcp: status.mcpUrl })
  await expect
    .poll(() =>
      page.evaluate(
        async (id) =>
          (await window.api.workspace.list()).find((w) => w.id === id)?.terminal
            .sessions[0].busy,
        wsId
      )
    )
    .toBe(false)
})

test('chat Markdown and terminal links open inside the workspace browser', async ({
  page,
  workRoot
}) => {
  const preview = await site()
  try {
    const wsId = await openWorkspace(page, workRoot)
    await page.evaluate(
      ({ wsId, url }) =>
        window.api.agent.prompt(
          wsId,
          `Open [Local preview](${url}/chat) or ${url}/bare.`
        ),
      { wsId, url: preview.url }
    )
    await expect(
      page.getByRole('link', { name: 'Local preview' }).last()
    ).toBeVisible()
    await page.getByRole('link', { name: 'Local preview' }).last().click()
    await expect
      .poll(() => page.evaluate((id) => window.api.browser.snapshot(id), wsId))
      .toMatchObject({
        tabs: expect.arrayContaining([
          expect.objectContaining({ url: `${preview.url}/chat` })
        ])
      })
    await expect(
      page.getByRole('link', { name: `${preview.url}/bare` }).last()
    ).toHaveAttribute('href', `${preview.url}/bare`)
    await page.getByRole('button', { name: 'Terminal', exact: true }).click()
    await expect
      .poll(() =>
        page.evaluate(
          async (id) =>
            (await window.api.workspace.list()).find((w) => w.id === id)
              ?.terminal.sessions.length,
          wsId
        )
      )
      .toBe(1)
    await page.evaluate(
      async ({ wsId, url }) => {
        const terminal = (await window.api.workspace.list()).find(
          (w) => w.id === wsId
        )!.terminal.sessions[0]
        await window.api.terminal.input(
          wsId,
          terminal.id,
          `printf '\\n${url}/terminal\\n'\r`
        )
      },
      { wsId, url: preview.url }
    )
    const link = page
      .locator('.xterm-rows span')
      .filter({ hasText: `${preview.url}/terminal` })
      .last()
    await expect(link).toBeVisible()
    await link.hover()
    await link.click()
    await expect
      .poll(() => page.evaluate((id) => window.api.browser.snapshot(id), wsId))
      .toMatchObject({
        tabs: expect.arrayContaining([
          expect.objectContaining({ url: `${preview.url}/terminal` })
        ])
      })
  } finally {
    await preview.close()
  }
})

test('MCP browser tools are scoped and authenticate both MCP and CDP', async ({
  page,
  workRoot
}) => {
  await page.evaluate(() =>
    window.api.settings.update({ mcpAuthToken: 'mxwl-e2e-secret' })
  )
  const wsId = await openWorkspace(page, workRoot)
  const status = await page.evaluate((id) => window.api.mcp.enable(id), wsId)
  expect(status.enabled).toBe(true)
  const config = JSON.parse(status.config!)
  expect(config.mcpServers.playwright.args).toContain(status.cdpUrl)
  expect((await fetch(`${status.cdpUrl}/json/version`)).status).toBe(401)
  const forwarded = await new Promise<{ webSocketDebuggerUrl: string }>(
    (resolve, reject) => {
      get(
        `${status.cdpUrl}/json/version`,
        {
          headers: {
            Authorization: 'Bearer mxwl-e2e-secret',
            Host: '127.0.0.1:54321'
          }
        },
        (response) => {
          let body = ''
          response.on('data', (chunk) => {
            body += chunk
          })
          response.on('end', () => resolve(JSON.parse(body)))
        }
      ).on('error', reject)
    }
  )
  expect(forwarded.webSocketDebuggerUrl).toBe(
    `ws://127.0.0.1:54321/cdp/${wsId}`
  )
  const rpc = async (method: string, params = {}) => {
    const response = await fetch(status.mcpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer mxwl-e2e-secret'
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
    })
    expect(response.ok).toBe(true)
    return response.json() as Promise<any>
  }
  const tools = await rpc('tools/list')
  expect(tools.result.tools.map((tool: { name: string }) => tool.name)).toEqual(
    expect.arrayContaining([
      'browser_tabs',
      'browser_evaluate',
      'browser_screenshot',
      'browser_connect'
    ])
  )
  const workspace = await rpc('tools/call', {
    name: 'workspace_list',
    arguments: {}
  })
  expect(JSON.parse(workspace.result.content[0].text)).toMatchObject([
    { id: wsId }
  ])
  const evaluated = await rpc('tools/call', {
    name: 'browser_evaluate',
    arguments: { expression: '1 + 2' }
  })
  expect(evaluated.result.content[0].text).toBe('3')
  const rejected = await rpc('tools/call', {
    name: 'browser_tabs',
    arguments: { workspaceId: 'another-workspace' }
  })
  expect(rejected.result.isError).toBe(true)
  const image = await rpc('tools/call', {
    name: 'browser_screenshot',
    arguments: {}
  })
  expect(image.result.content[0]).toMatchObject({
    type: 'image',
    mimeType: 'image/png'
  })
  expect(image.result.content[0].data).toMatch(/^iVBOR/)
  await page.evaluate(
    (id) => window.api.agent.prompt(id, 'mcp browser check'),
    wsId
  )
  await expect(page.getByLabel('Agent conversation')).toContainText(
    'MCP browser value: 3'
  )
  await expect(page.getByLabel('Agent conversation')).toContainText(
    status.cdpUrl
  )
})

test('Playwright sees only embedded workspace pages and new pages become mxwl tabs', async ({
  page,
  workRoot
}) => {
  const preview = await site()
  try {
    const wsId = await openWorkspace(page, workRoot)
    mkdirSync(join(workRoot, 'other'))
    await page.evaluate(async (root) => {
      const host = await window.api.host.ensureLocal()
      const location = (await window.api.project.locations()).find(
        (l) => l.hostId === host.id
      )!
      const other = await window.api.workspace.open(
        host.id,
        `${root}/other`,
        location.id
      )
      await window.api.mcp.enable(other.id)
    }, workRoot)
    const status = await page.evaluate((id) => window.api.mcp.enable(id), wsId)
    const browser = await chromium.connectOverCDP(status.cdpUrl)
    try {
      const context = browser.contexts()[0]
      expect(context.pages()).toHaveLength(1)
      const embedded = context.pages()[0]
      await embedded.goto(preview.url)
      await context.addCookies([
        { name: 'workspace', value: 'isolated', url: preview.url }
      ])
      expect(await context.cookies(preview.url)).toMatchObject([
        expect.objectContaining({ name: 'workspace', value: 'isolated' })
      ])
      expect(await embedded.evaluate(() => document.cookie)).toContain(
        'workspace=isolated'
      )
      await embedded.getByRole('textbox', { name: 'Name' }).fill('Inside mxwl')
      await embedded.getByRole('button', { name: 'Save' }).click()
      await expect(embedded.locator('p')).toHaveText('Inside mxwl')
      const created = await context.newPage()
      await created.goto(`${preview.url}/new-page`)
      await expect
        .poll(() =>
          page.evaluate((id) => window.api.browser.snapshot(id), wsId)
        )
        .toMatchObject({
          tabs: expect.arrayContaining([
            expect.objectContaining({ url: `${preview.url}/new-page` })
          ])
        })
      await created.close()
      await expect
        .poll(() =>
          page.evaluate(
            async (id) => (await window.api.browser.snapshot(id))!.tabs.length,
            wsId
          )
        )
        .toBe(1)
      await expect(browser.newContext()).rejects.toThrow(
        'Use browser.contexts()[0]'
      )
      const disconnected = new Promise<void>((resolve) =>
        browser.once('disconnected', resolve)
      )
      await page.evaluate((id) => window.api.mcp.disable(id), wsId)
      await disconnected
    } finally {
      await browser.close()
    }
    expect(
      (await page.evaluate((id) => window.api.browser.snapshot(id), wsId))!.tabs
    ).toHaveLength(1)
  } finally {
    await preview.close()
  }
})
