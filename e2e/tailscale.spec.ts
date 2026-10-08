import { expect, test } from './fixtures'
import { generateKeyPairSync } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { Server } from 'ssh2'

test.beforeEach(async ({ page }) => {
  await page
    .getByRole('button', { name: 'Manage connections', exact: true })
    .click()
})

test('discovers SSH peers, saves Tailscale auth as a remote host, and preserves it on reload', async ({
  app,
  page
}) => {
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('host:discoverTailscale')
    ipcMain.handle('host:discoverTailscale', () => ({
      state: 'ready',
      message: '',
      tailnet: 'test.example',
      suggestedUsername: 'alice',
      devices: [
        {
          id: 'dev',
          name: 'devbox',
          dnsName: 'devbox.tail.example',
          address: '100.64.0.2',
          ips: ['100.64.0.2'],
          os: 'linux',
          online: true,
          sshAdvertised: true,
          tags: ['tag:dev']
        },
        {
          id: 'ordinary',
          name: 'ordinary-server',
          dnsName: '',
          address: '100.64.0.3',
          ips: ['100.64.0.3'],
          os: 'linux',
          online: true,
          sshAdvertised: false,
          tags: []
        },
        {
          id: 'offline',
          name: 'offline-devbox',
          dnsName: '',
          address: '100.64.0.4',
          ips: ['100.64.0.4'],
          os: 'linux',
          online: false,
          sshAdvertised: true,
          tags: []
        }
      ]
    }))
  })
  await page
    .getByRole('button', { name: 'Discover Tailscale', exact: true })
    .click()
  const picker = page.getByRole('dialog', { name: 'Tailscale devices' })
  await expect(picker.getByText('devbox', { exact: true })).toBeVisible()
  await expect(
    picker.getByText('ordinary-server', { exact: true })
  ).toHaveCount(0)
  await expect(
    picker.getByText('linux · Offline', { exact: true })
  ).toBeVisible()
  await picker.getByRole('checkbox').check()
  await expect(
    picker.getByText('ordinary-server', { exact: true })
  ).toBeVisible()
  await expect(
    picker.getByText('SSH access unknown', { exact: true })
  ).toBeVisible()
  await picker
    .getByRole('textbox', { name: 'Search Tailscale devices' })
    .fill('tag:dev')
  await expect(
    picker.getByText('ordinary-server', { exact: true })
  ).toHaveCount(0)
  await picker.getByRole('button', { name: /devbox.*Tailscale SSH/ }).click()

  await expect(page.getByLabel('Host', { exact: true })).toHaveValue(
    '100.64.0.2'
  )
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue(
    'alice'
  )
  await page.getByLabel('Username', { exact: true }).fill('remote-user')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page
    .getByRole('checkbox', { name: 'Save without connecting for now' })
    .check()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByText('remote-user@100.64.0.2:22', { exact: true })
  ).toBeVisible()
  expect(
    await page.evaluate(async () =>
      (await window.api.host.list()).find((host) => host.host === '100.64.0.2')
    )
  ).toMatchObject({
    kind: 'ssh',
    auth: { kind: 'tailscale' },
    username: 'remote-user',
    port: 22
  })
  await page.reload()
  await page
    .getByRole('button', { name: 'Manage connections', exact: true })
    .click()
  await expect(
    page.getByText('remote-user@100.64.0.2:22', { exact: true })
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Discover Tailscale', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: /devbox.*Already configured/ })
  ).toBeDisabled()
})

test('explains a missing Tailscale install and supports refresh', async ({
  app,
  page
}) => {
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('host:discoverTailscale')
    ipcMain.handle('host:discoverTailscale', () => ({
      state: 'missing',
      message:
        'Tailscale was not found. Install Tailscale on this computer, sign in, then refresh.',
      tailnet: '',
      suggestedUsername: 'alice',
      devices: []
    }))
  })
  await page
    .getByRole('button', { name: 'Discover Tailscale', exact: true })
    .click()
  await expect(page.getByRole('status')).toContainText(
    'Tailscale was not found'
  )
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByRole('status')).toContainText(
    'Tailscale was not found'
  )
  await page.keyboard.press('Escape')
  await expect(
    page.getByRole('dialog', { name: 'Tailscale devices' })
  ).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Machine connections', exact: true })).toBeVisible()
})

test('offers Tailscale directly in Add Host and selecting or refreshing does not submit the form', async ({
  app,
  page
}) => {
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('host:discoverTailscale')
    ipcMain.handle('host:discoverTailscale', () => ({
      state: 'ready',
      message: '',
      tailnet: 'test.example',
      suggestedUsername: 'alice',
      devices: [
        {
          id: 'mesh',
          name: 'meshbox',
          dnsName: 'meshbox.tail.example',
          address: '100.64.0.8',
          ips: ['100.64.0.8'],
          os: 'linux',
          online: true,
          sshAdvertised: true,
          tags: []
        }
      ]
    }))
  })
  await page
    .getByRole('button', { name: 'Add host', exact: true })
    .first()
    .click()
  await expect(
    page.getByRole('button', { name: 'SSH', exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'This Machine', exact: true })
  ).toBeVisible()
  await page.getByRole('button', { name: 'Tailscale', exact: true }).click()
  const picker = page.getByRole('region', { name: 'Tailscale devices' })
  await picker.getByRole('button', { name: 'Refresh', exact: true }).click()
  expect(await page.evaluate(() => window.api.host.list())).toEqual([])
  await picker.getByRole('button', { name: /meshbox.*Tailscale SSH/ }).click()
  await expect(page.getByLabel('Host', { exact: true })).toHaveValue(
    '100.64.0.8'
  )
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue(
    'alice'
  )
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await picker.getByRole('button', { name: 'Refresh', exact: true }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByLabel('Host', { exact: true })).toHaveValue(
    '100.64.0.8'
  )
  await expect(
    page.getByRole('heading', { name: 'Connect a machine', exact: true })
  ).toBeVisible()
  expect(await page.evaluate(() => window.api.host.list())).toEqual([])
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page
    .getByRole('checkbox', { name: 'Save without connecting for now' })
    .check()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByText('alice@100.64.0.8:22', { exact: true })
  ).toBeVisible()
})

test('connects using SSH none authentication for Tailscale without a key or password', async ({
  page
}) => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const methods: string[] = []
  const server = new Server(
    { hostKeys: [privateKey.export({ type: 'pkcs1', format: 'pem' })] },
    (client) => {
      client.on('error', () => undefined)
      client.on('authentication', (context) => {
        methods.push(context.method)
        if (context.method === 'none' && context.username === 'alice')
          context.accept()
        else context.reject()
      })
    }
  )
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const result = await page.evaluate(
      (port) =>
        window.api.host.test({
          kind: 'ssh',
          label: 'Tailscale test',
          host: '127.0.0.1',
          port,
          username: 'alice',
          auth: { kind: 'tailscale' }
        }),
      (server.address() as AddressInfo).port
    )
    expect(result.ok).toBe(true)
    expect(methods).toEqual(['none'])
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
})
