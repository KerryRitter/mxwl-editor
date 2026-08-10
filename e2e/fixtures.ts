import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { test as base } from '@playwright/test'

export type AppFixture = {
  app: ElectronApplication
  page: Page
  /** Throwaway host workspaces root for this test */
  workRoot: string
}

/**
 * Launches the built app against a throwaway userData dir so a test run can never
 * touch the developer's real hosts, settings or sessions.
 */
export const test = base.extend<AppFixture>({
  // eslint-disable-next-line no-empty-pattern
  workRoot: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'mxwl-e2e-work-'))
    await use(dir)
    rmSync(dir, { recursive: true, force: true })
  },
  app: async ({}, use) => {
    const userData = mkdtempSync(join(tmpdir(), 'mxwl-e2e-user-'))
    const app = await electron.launch({
      // GPU off: on a host whose driver rejects the unsandboxed GPU process,
      // Chromium relaunches it in a loop and floods the run with driver errors.
      // The tests only read the DOM, so software rendering costs nothing.
      args: [
        'out/main/index.js',
        `--user-data-dir=${userData}`,
        '--no-sandbox',
        '--disable-gpu'
      ],
      env: { ...process.env, NODE_ENV: 'production' }
    })
    await use(app)
    await app.close().catch(() => undefined)
    rmSync(userData, { recursive: true, force: true })
  },
  page: async ({ app }, use) => {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    // The Agent tab is the default one, so every workspace a test opens starts an
    // agent. Point that at the stub up front — otherwise unrelated specs would
    // reach for the registry's `npx` line and pull a package off the network.
    await useFakeAgent(page)
    await use(page)
  }
})

export const expect = test.expect

/** Registers the local machine as a host rooted at `workRoot` and returns its id. */
export async function useLocalHost(page: Page, workRoot: string): Promise<string> {
  return page.evaluate(async (root) => {
    const host = await window.api.host.ensureLocal(root)
    return host.id
  }, workRoot)
}

export async function setAiSettings(
  page: Page,
  ai: Record<string, unknown>
): Promise<void> {
  await page.evaluate((patch) => window.api.settings.update({ ai: patch }), ai)
}

export async function setAgentSettings(
  page: Page,
  agent: Record<string, unknown>
): Promise<void> {
  await page.evaluate((patch) => window.api.settings.update({ agent: patch }), agent)
}

/**
 * Points the `custom` agent at the stub in `e2e/fake-acp-agent.mjs`. Auto-approve
 * is off here so the baseline is the asking behaviour — the tests that care about
 * skipping prompts turn it on themselves.
 */
export async function useFakeAgent(page: Page): Promise<void> {
  await setAgentSettings(page, {
    defaultAgent: 'custom',
    commandOverrides: { custom: 'node' },
    argsOverrides: { custom: join(process.cwd(), 'e2e', 'fake-acp-agent.mjs') },
    autoApprove: false
  })
}
