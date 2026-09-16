#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'

const projectRoot = resolve(import.meta.dirname, '..')
const outputDir = join(projectRoot, 'docs', 'assets')
const workRoot = mkdtempSync(join(tmpdir(), 'mxwl-readme-work-'))
const userData = mkdtempSync(join(tmpdir(), 'mxwl-readme-user-'))
const fakeAgent = join(projectRoot, 'e2e', 'fake-acp-agent.mjs')

mkdirSync(outputDir, { recursive: true })

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'ignore' })

function createRepo(folder, files) {
  const root = join(workRoot, folder)
  mkdirSync(root, { recursive: true })
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(root, path)
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, content, 'utf8')
  }
  git(root, 'init', '-q', '-b', 'main')
  git(root, 'config', 'user.email', 'mxwl@example.test')
  git(root, 'config', 'user.name', 'mxwl showcase')
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'baseline')
  return root
}

const baseRiskScore = `export type RiskInput = {
  amount: number
  country: string
  accountAgeDays: number
}

export type RiskDecision = {
  score: number
  action: 'allow' | 'review'
  reasons: string[]
}

export function evaluateRisk(input: RiskInput): RiskDecision {
  const reasons: string[] = []
  let score = 0

  if (input.amount > 500) {
    score += 20
    reasons.push('high order value')
  }

  return {
    score,
    action: score >= 50 ? 'review' : 'allow',
    reasons
  }
}
`

const changedRiskScore = `export type RiskInput = {
  amount: number
  country: string
  accountAgeDays: number
  failedPayments: number
}

export type RiskDecision = {
  score: number
  action: 'allow' | 'review' | 'block'
  reasons: string[]
}

const REVIEW_THRESHOLD = 50
const BLOCK_THRESHOLD = 85

export function evaluateRisk(input: RiskInput): RiskDecision {
  const reasons: string[] = []
  let score = 0

  if (input.amount > 500) {
    score += 20
    reasons.push('high order value')
  }

  if (input.accountAgeDays < 7) {
    score += 30
    reasons.push('new account')
  }

  if (input.failedPayments > 1) {
    score += 45
    reasons.push('repeated payment failures')
  }

  return {
    score,
    action: score >= BLOCK_THRESHOLD ? 'block' : score >= REVIEW_THRESHOLD ? 'review' : 'allow',
    reasons
  }
}
`

const checkoutRoot = createRepo('checkout-PAY-1842', {
  'src/checkout/riskScore.ts': baseRiskScore,
  'src/checkout/submitOrder.ts': `import { evaluateRisk } from './riskScore'\n\nexport const submitOrder = evaluateRisk\n`,
  'src/checkout/currency.ts': `export const currency = 'USD'\n`,
  'tests/riskScore.test.ts': `import { expect, test } from 'vitest'\n\ntest('allows a normal order', () => expect(true).toBe(true))\n`
})
writeFileSync(join(checkoutRoot, 'src/checkout/riskScore.ts'), changedRiskScore, 'utf8')
writeFileSync(
  join(checkoutRoot, 'src/checkout/reviewQueue.ts'),
  `export const reviewQueue = 'payments-manual-review'\n`,
  'utf8'
)
writeFileSync(
  join(checkoutRoot, 'tests/riskScore.test.ts'),
  `import { expect, test } from 'vitest'\nimport { evaluateRisk } from '../src/checkout/riskScore'\n\ntest('allows a normal order', () => {\n  expect(evaluateRisk({ amount: 20, country: 'US', accountAgeDays: 90, failedPayments: 0 }).action).toBe('allow')\n})\n\ntest('blocks repeated payment failures', () => {\n  expect(evaluateRisk({ amount: 900, country: 'US', accountAgeDays: 2, failedPayments: 2 }).action).toBe('block')\n})\n`,
  'utf8'
)
git(checkoutRoot, 'switch', '-qc', 'feat/PAY-1842-risk-review')
git(checkoutRoot, 'remote', 'add', 'origin', 'git@github.com:acme/checkout.git')

const apiRoot = createRepo('billing-OPS-731', {
  'src/migrations/2026_09_add_ledger.sql': 'select 1;\n',
  'README.md': '# Billing API\n'
})
const catalogRoot = createRepo('catalog-WEB-220', {
  'src/search.ts': `export const search = (query) => query.trim()\n`,
  'README.md': '# Catalog search\n'
})

let app
try {
  app = await electron.launch({
    args: [
      'out/main/index.js',
      `--user-data-dir=${userData}`,
      '--no-sandbox',
      '--disable-gpu'
    ],
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      MXWL_DISABLE_KEEP_ALIVE: '1',
      MXWL_CONTROL_PORT: '0'
    }
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    window.setSize(1600, 1000)
    window.center()
  })

  const host = await page.evaluate(async ({ root, agentPath }) => {
    await window.api.settings.update({
      agent: {
        defaultAgent: 'claude',
        commandOverrides: { claude: 'node' },
        argsOverrides: { claude: agentPath },
        autoApprove: false
      },
      notifications: {
        delivery: 'off',
        delaySeconds: 0,
        sound: false,
        suppressActiveWorkspace: false,
        mutedAgents: []
      }
    })
    const local = await window.api.host.ensureLocal(root)
    return window.api.host.save({
      ...local,
      label: 'Studio workstation',
      derive: {
        folderPattern: '(?<name>.+)-(?<issue>[A-Z]+-\\d+)$',
        titleTemplate: '${name}',
        issueKeyTemplate: '${issue}',
        browserUrlTemplate: ''
      },
      auth: { kind: 'none' }
    })
  }, { root: workRoot, agentPath: fakeAgent })

  const checkout = await page.evaluate(
    ([hostId, path]) => window.api.workspace.open(hostId, path),
    [host.id, checkoutRoot]
  )
  await waitForWorkspace(page, checkout.id)
  await page.evaluate((id) => window.api.workspace.rename(id, 'Checkout release'), checkout.id)
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  const layout = page.getByRole('combobox', { name: 'Workspace layout preset' })
  await layout.selectOption('review')
  await page.getByText('Changed files', { exact: true }).waitFor({ state: 'visible' })
  await page.locator('button[title^="src/checkout/riskScore.ts"]').click()
  await page.getByRole('button', { name: 'Split' }).click()
  await page.locator('.monaco-diff-editor').waitFor({ state: 'visible' })
  await page.getByTitle(/Maximize code pane/).click()
  await page.getByTitle(/Restore layout/).waitFor({ state: 'visible' })
  await page.waitForTimeout(800)
  await page.screenshot({
    path: join(outputDir, 'mxwl-review.png'),
    animations: 'disabled'
  })

  await page.keyboard.press('Escape')
  const [billing, catalog] = await page.evaluate(
    async ({ hostId, paths }) =>
      Promise.all(paths.map((path) => window.api.workspace.open(hostId, path))),
    { hostId: host.id, paths: [apiRoot, catalogRoot] }
  )
  await Promise.all([
    waitForWorkspace(page, billing.id),
    waitForWorkspace(page, catalog.id)
  ])
  await page.evaluate(
    async ({ billingId, catalogId }) => {
      await window.api.workspace.rename(billingId, 'Billing migration')
      await window.api.workspace.rename(catalogId, 'Catalog search')
    },
    { billingId: billing.id, catalogId: catalog.id }
  )
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  for (const id of [checkout.id, billing.id, catalog.id]) {
    await page.evaluate((wsId) => window.api.agent.open(wsId, 'claude'), id)
    await waitForAgent(page, id, (state) => state?.status === 'ready')
  }

  await page.evaluate((id) => {
    void window.api.agent.prompt(id, 'slow Run checkout tests and verify the risk thresholds')
  }, checkout.id)
  await page.evaluate((id) => {
    void window.api.agent.prompt(id, 'permission Apply the ledger migration')
  }, billing.id)
  await page.evaluate((id) => window.api.agent.prompt(id, 'plan the catalog search release'), catalog.id)
  await waitForAgent(page, catalog.id, (state) => state?.turn === 'idle')
  await page.evaluate(
    (id) =>
      window.api.agent.prompt(
        id,
        'showcase Catalog audit complete — ranking, empty states, and keyboard navigation all pass'
      ),
    catalog.id
  )
  await waitForAgent(page, checkout.id, (state) => state?.turn === 'running')
  await waitForAgent(page, billing.id, (state) => Boolean(state?.permission))
  await waitForAgent(page, catalog.id, (state) => state?.turn === 'idle')

  await page.getByText('Catalog search', { exact: true }).click()
  await page.getByRole('button', { name: 'Agent', exact: true }).click()
  await page.keyboard.press('Control+Shift+3')
  await page.getByRole('button', { name: 'Agent notifications' }).click()
  await page.getByText(/Live agents · 3/).click()
  await page
    .getByRole('button', { name: /Billing migration attention/ })
    .waitFor({ state: 'visible' })
  await page.waitForTimeout(500)
  await page.screenshot({
    path: join(outputDir, 'mxwl-agent-fleet.png'),
    animations: 'disabled'
  })

  process.stdout.write(`Captured README screenshots in ${outputDir}\n`)
} finally {
  await app?.close().catch(() => undefined)
  rmSync(workRoot, { recursive: true, force: true })
  rmSync(userData, { recursive: true, force: true })
}

async function waitForWorkspace(page, wsId) {
  await waitFor(async () => {
    const workspace = await page.evaluate(
      (id) => window.api.workspace.list().then((items) => items.find((item) => item.id === id)),
      wsId
    )
    return workspace?.status === 'connected'
  }, `workspace ${wsId} to connect`)
}

async function waitForAgent(page, wsId, predicate) {
  await waitFor(
    async () => predicate(await page.evaluate((id) => window.api.agent.get(id), wsId)),
    `agent ${wsId}`
  )
}

async function waitFor(predicate, label, timeout = 30_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error(`Timed out waiting for ${label}`)
}
