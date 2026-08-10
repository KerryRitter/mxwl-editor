import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test, useLocalHost } from './fixtures'

/** Sets a cookie on /set, echoes whatever cookie it receives on /read. */
async function cookieServer(): Promise<{ url: string; close: () => Promise<void>; server: Server }> {
  const server = createServer((req, res) => {
    if (req.url?.startsWith('/set')) {
      res.setHeader('Set-Cookie', 'sid=group-one; Path=/')
      res.end('set')
      return
    }
    res.end(`cookie:${req.headers.cookie ?? 'none'}`)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    server,
    close: () => new Promise<void>((r) => server.close(() => r()))
  }
}

test('a tab in a second group does not see the first group’s cookies', async ({
  app,
  page,
  workRoot
}) => {
  const site = await cookieServer()
  try {
    const hostId = await useLocalHost(page, workRoot)
    const wsId = await page.evaluate(
      ([host, path]) => window.api.workspace.open(host, path).then((w) => w.id),
      [hostId, workRoot] as const
    )

    // Default group: log in. The load is async, so wait for the jar to fill.
    await page.evaluate(
      ([id, url]) => window.api.browser.newTab(id, `${url}/set`),
      [wsId, site.url] as const
    )
    await expect
      .poll(
        () =>
          app.evaluate(async ({ session }) =>
            (await session.defaultSession.cookies.get({ name: 'sid' })).length
          ),
        { timeout: 20_000 }
      )
      .toBe(1)

    // Second sandbox with its own tab.
    const groupId = await page.evaluate((id) => window.api.browser.newGroup(id), wsId)
    await page.evaluate(
      ([id, url, g]) => window.api.browser.newTab(id, `${url}/read`, g as string),
      [wsId, site.url, groupId] as const
    )

    const snap = await page.evaluate((id) => window.api.browser.snapshot(id), wsId)
    expect(snap!.groups).toHaveLength(2)
    const [defaultGroup, second] = snap!.groups
    expect(defaultGroup.partition).toBe('')
    expect(second.partition).toBe(`persist:mxwl-${wsId}-${groupId}`)
    expect(second.color).not.toBe(defaultGroup.color)
    expect(snap!.tabs.map((t) => t.groupId)).toEqual([defaultGroup.id, second.id])

    // The cookie landed in the default jar and nowhere else.
    const jars = await app.evaluate(async ({ session }, partition) => {
      const mine = await session.defaultSession.cookies.get({ name: 'sid' })
      const theirs = await session.fromPartition(partition).cookies.get({ name: 'sid' })
      return { mine: mine.length, theirs: theirs.length }
    }, second.partition)

    expect(jars.mine).toBe(1)
    expect(jars.theirs).toBe(0)

    // Clearing one group leaves the other alone.
    await page.evaluate(
      ([id, g]) => window.api.browser.clearGroup(id, g),
      [wsId, defaultGroup.id] as const
    )
    const after = await app.evaluate(async ({ session }) =>
      (await session.defaultSession.cookies.get({ name: 'sid' })).length
    )
    expect(after).toBe(0)
  } finally {
    await site.close()
  }
})
