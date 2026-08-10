import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright'
import type { AgentSessionState } from '../src/shared/types'
import { expect, setAgentSettings, test, useFakeAgent, useLocalHost } from './fixtures'

/**
 * Drives the Agent tab against `e2e/fake-acp-agent.mjs` — a real ACP process on
 * the other end of real stdio, so this covers the spawn, the JSON-RPC handshake,
 * streaming updates and the permission round trip.
 */

async function openWorkspace(page: Page, workRoot: string): Promise<string> {
  const dir = join(workRoot, 'proj')
  mkdirSync(dir, { recursive: true })
  const hostId = await useLocalHost(page, workRoot)
  const ws = await page.evaluate(
    ([host, path]) => window.api.workspace.open(host, path),
    [hostId, dir] as const
  )
  return ws.id
}

/**
 * The workspace store is filled at startup, so a workspace opened through the
 * API only reaches the UI after a reload. Agent sessions live in main, so an
 * already-running agent survives it.
 */
async function showWorkspace(page: Page): Promise<void> {
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  // Exact: the panel's own "Restart agent" button also matches a loose name.
  await page.getByRole('button', { name: 'Agent', exact: true }).click()
}

function agentState(page: Page, wsId: string): Promise<AgentSessionState | null> {
  return page.evaluate((id) => window.api.agent.get(id), wsId)
}

async function startAgent(page: Page, wsId: string): Promise<AgentSessionState> {
  await page.evaluate((id) => window.api.agent.open(id), wsId)
  await expect
    .poll(async () => (await agentState(page, wsId))?.status, { timeout: 30_000 })
    .toBe('ready')
  return (await agentState(page, wsId))!
}

/** Waits for the turn to finish and returns the transcript as plain text. */
async function transcript(page: Page, wsId: string): Promise<string> {
  await expect
    .poll(async () => (await agentState(page, wsId))?.turn, { timeout: 30_000 })
    .toBe('idle')
  const state = await agentState(page, wsId)
  return (state?.messages ?? [])
    .flatMap((m) => m.blocks.map((b) => (b.kind === 'tool' ? b.title : b.text)))
    .join('\n')
}

test('connects over ACP and reports what the agent published', async ({ page, workRoot }) => {
  await useFakeAgent(page)
  const wsId = await openWorkspace(page, workRoot)
  const state = await startAgent(page, wsId)

  expect(state.agentInfo).toBe('fake-acp 9.9.9')
  expect(state.sessionId).toBe('sess-1')
  expect(state.error).toBeNull()

  // The agent's own commands, plus mxwl's, with the canonical synonyms attached.
  const compress = state.commands.find((c) => c.name === 'compress')!
  expect(compress.canonical).toBe('compact')
  expect(compress.aliases).toContain('compact')
  expect(state.commands.find((c) => c.name === 'cancel')?.source).toBe('client')

  // Modes are canonicalised from whatever the agent called them.
  expect(state.modes.current).toBe('default')
  expect(state.modes.available.map((m) => m.canonical)).toEqual(['ask', 'auto', 'plan'])
})

test('showing the tab starts the configured agent, with no pick', async ({ page, workRoot }) => {
  await useFakeAgent(page)
  const wsId = await openWorkspace(page, workRoot)

  // No agent.open() here — the workspace showing its default tab is the trigger.
  await showWorkspace(page)

  await expect
    .poll(async () => (await agentState(page, wsId))?.status, { timeout: 30_000 })
    .toBe('ready')
  await expect(page.getByPlaceholder(/Message Custom/)).toBeVisible()
  await expect(page.getByText('Pick an agent for this workspace')).toBeHidden()
})

test('streams a turn back as merged blocks', async ({ page, workRoot }) => {
  await useFakeAgent(page)
  const wsId = await openWorkspace(page, workRoot)
  await startAgent(page, wsId)

  await page.evaluate((id) => window.api.agent.prompt(id, 'hello there'), wsId)
  expect(await transcript(page, wsId)).toContain('echo: hello there')

  const state = (await agentState(page, wsId))!
  const agentMsg = state.messages.find((m) => m.role === 'agent')!
  // Word-by-word chunks must collapse into one text block, not seven.
  expect(agentMsg.blocks.filter((b) => b.kind === 'text')).toHaveLength(1)
  expect(agentMsg.blocks.some((b) => b.kind === 'thought')).toBe(true)
  expect(state.usage).toEqual({ used: 120, size: 1000 })
})

test('a permission request is answered from the panel', async ({ page, workRoot }) => {
  await useFakeAgent(page)
  const wsId = await openWorkspace(page, workRoot)
  await startAgent(page, wsId)

  await showWorkspace(page)
  const composer = page.getByPlaceholder(/Message Custom/)
  await composer.fill('permission please')
  await composer.press('Enter')

  await expect(page.getByText('Write hello.txt').first()).toBeVisible()
  await expect(page.getByText('+hello')).toBeVisible()
  await page.getByRole('button', { name: 'Allow' }).click()

  await expect(page.getByText('wrote the file')).toBeVisible()
  expect((await agentState(page, wsId))?.permission).toBeNull()
})

test('auto-approve answers the permission request and picks the permissive mode', async ({
  page,
  workRoot
}) => {
  await useFakeAgent(page)
  await setAgentSettings(page, { autoApprove: true })
  const wsId = await openWorkspace(page, workRoot)
  const state = await startAgent(page, wsId)

  // This agent's most permissive posture is acceptEdits; it has no bypass mode.
  expect(state.modes.current).toBe('acceptEdits')

  await showWorkspace(page)
  const composer = page.getByPlaceholder(/Message Custom/)
  await composer.fill('permission please')
  await composer.press('Enter')

  // The agent only says this when the client selected the allow option.
  await expect(page.getByText('wrote the file')).toBeVisible()
  expect((await agentState(page, wsId))?.permission).toBeNull()
  await expect(page.getByRole('button', { name: 'Allow' })).toBeHidden()
})

test('the conversation is saved and readable after the agent is gone', async ({
  page,
  workRoot
}) => {
  await useFakeAgent(page)
  const wsId = await openWorkspace(page, workRoot)
  await startAgent(page, wsId)

  await showWorkspace(page)
  const composer = page.getByPlaceholder(/Message Custom/)
  await composer.fill('remember this line')
  await composer.press('Enter')
  await transcript(page, wsId)

  // Closing flushes the pending save, so the file is on disk without the debounce.
  const cwd = (await agentState(page, wsId))!.cwd
  await page.evaluate((id) => window.api.agent.close(id), wsId)

  const saved = await page.evaluate((dir) => window.api.agent.history(dir), cwd)
  expect(saved).toHaveLength(1)
  expect(saved[0].title).toContain('remember this line')
  expect(saved[0].agentLabel).toBe('Custom')

  const full = await page.evaluate((id) => window.api.agent.transcript(id), saved[0].id)
  const text = (full?.messages ?? [])
    .flatMap((m) => m.blocks.map((b) => (b.kind === 'text' ? b.text : '')))
    .join('\n')
  expect(text).toContain('echo: remember this line')
})

test('a saved conversation opens read-only from the history list', async ({ page, workRoot }) => {
  await useFakeAgent(page)
  const wsId = await openWorkspace(page, workRoot)
  await startAgent(page, wsId)

  await showWorkspace(page)
  const composer = page.getByPlaceholder(/Message Custom/)
  await composer.fill('first conversation')
  await composer.press('Enter')
  await transcript(page, wsId)

  // Clearing saves what it drops, so the live transcript and the archive differ.
  await page.getByTitle('Clear conversation').click()
  await expect(page.getByText('echo: first conversation')).toBeHidden()

  await page.getByTitle('Saved conversations').click()
  await page.getByText('first conversation').first().click()

  await expect(page.getByText('echo: first conversation')).toBeVisible()
  await expect(page.getByPlaceholder(/Viewing a saved conversation/)).toBeVisible()

  await page.getByRole('button', { name: 'Back to live' }).click()
  await expect(page.getByText('echo: first conversation')).toBeHidden()
})

test('a cancelled turn stops without killing the session', async ({ page, workRoot }) => {
  await useFakeAgent(page)
  const wsId = await openWorkspace(page, workRoot)
  await startAgent(page, wsId)

  void page.evaluate((id) => window.api.agent.prompt(id, 'slow work'), wsId)
  await expect.poll(async () => (await agentState(page, wsId))?.turn).toBe('running')

  await page.evaluate((id) => window.api.agent.cancel(id), wsId)
  await expect.poll(async () => (await agentState(page, wsId))?.turn).toBe('idle')
  expect((await agentState(page, wsId))?.status).toBe('ready')

  // Still usable afterwards.
  await page.evaluate((id) => window.api.agent.prompt(id, 'again'), wsId)
  expect(await transcript(page, wsId)).toContain('echo: again')
})

test('autocomplete finds a command by the name another agent uses', async ({ page, workRoot }) => {
  await useFakeAgent(page)
  const wsId = await openWorkspace(page, workRoot)
  await startAgent(page, wsId)

  await showWorkspace(page)
  const composer = page.getByPlaceholder(/Message Custom/)
  await composer.fill('/compact')

  // This agent has no /compact — the palette offers its /compress instead.
  const suggestion = page.getByRole('button', { name: /\/compress/ })
  await expect(suggestion).toBeVisible()
  await expect(suggestion).toContainText('compact')

  await composer.press('Enter')
  await expect(composer).toHaveValue('/compress ')
})

test('a typed synonym is rewritten before it reaches the agent', async ({ page, workRoot }) => {
  await useFakeAgent(page)
  const wsId = await openWorkspace(page, workRoot)
  await startAgent(page, wsId)

  await showWorkspace(page)
  const composer = page.getByPlaceholder(/Message Custom/)
  await composer.fill('/compact')
  await composer.press('Escape') // dismiss autocomplete, send the line as typed
  await composer.press('Enter')

  await expect(page.getByText('sent as /compress')).toBeVisible()
  expect(await transcript(page, wsId)).toContain('compressed')
})

test('/mode switches the agent’s posture by canonical name', async ({ page, workRoot }) => {
  await useFakeAgent(page)
  const wsId = await openWorkspace(page, workRoot)
  await startAgent(page, wsId)

  await showWorkspace(page)
  const composer = page.getByPlaceholder(/Message Custom/)
  await composer.fill('/mode auto')
  await composer.press('Escape')
  await composer.press('Enter')

  // "auto" is mxwl's name for it; this agent calls it acceptEdits.
  await expect.poll(async () => (await agentState(page, wsId))?.modes.current).toBe('acceptEdits')
  expect(await transcript(page, wsId)).not.toContain('echo: /mode')
})

test('the plan tracker renders what the agent reports', async ({ page, workRoot }) => {
  await useFakeAgent(page)
  const wsId = await openWorkspace(page, workRoot)
  await startAgent(page, wsId)

  await showWorkspace(page)
  const composer = page.getByPlaceholder(/Message Custom/)
  await composer.fill('plan it out')
  await composer.press('Enter')

  await expect(page.getByText('Plan 1/2')).toBeVisible()
  await expect(page.getByText('second step')).toBeVisible()
})

test('a dead agent surfaces the failure instead of hanging', async ({ page, workRoot }) => {
  await page.evaluate(() =>
    window.api.settings.update({
      agent: {
        defaultAgent: 'custom',
        commandOverrides: { custom: 'mxwl-no-such-agent-binary' },
        argsOverrides: {}
      }
    })
  )
  const wsId = await openWorkspace(page, workRoot)
  await page.evaluate((id) => window.api.agent.open(id), wsId)

  // Whether the failure lands as a dead stream or a dead process is a race, but
  // it must always land, with the shell's reason attached.
  await expect
    .poll(async () => (await agentState(page, wsId))?.status, { timeout: 30_000 })
    .toMatch(/error|exited/)
  expect((await agentState(page, wsId))?.error).toContain('mxwl-no-such-agent-binary')
})
