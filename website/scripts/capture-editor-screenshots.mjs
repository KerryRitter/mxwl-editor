#!/usr/bin/env node

import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { _electron as electron } from 'playwright';

const parent = resolve(import.meta.dirname, '../..');
const projectRoot = resolve(
  process.argv[2] ??
    (existsSync(join(parent, 'electron-builder.yml')) ? parent : join(parent, 'mxwl-editor')),
);
const outputDir = resolve(import.meta.dirname, '../public/images');
const workRoot = mkdtempSync(join(tmpdir(), 'mxwl-readme-work-'));
const userData = mkdtempSync(join(tmpdir(), 'mxwl-readme-user-'));
const fakeAgent = join(projectRoot, 'e2e', 'fake-acp-agent.mjs');

mkdirSync(outputDir, { recursive: true });

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'ignore' });

function createRepo(folder, files) {
  const root = join(workRoot, folder);
  mkdirSync(root, { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(root, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, 'utf8');
  }
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'mxwl@example.test');
  git(root, 'config', 'user.name', 'mxwl showcase');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'baseline');
  return root;
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
`;

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
`;

const checkoutRoot = createRepo('checkout-PAY-1842', {
  'src/checkout/riskScore.ts': baseRiskScore,
  'src/checkout/submitOrder.ts': `import { evaluateRisk } from './riskScore'\n\nexport const submitOrder = evaluateRisk\n`,
  'src/checkout/currency.ts': `export const currency = 'USD'\n`,
  'tests/riskScore.test.ts': `import { expect, test } from 'vitest'\n\ntest('allows a normal order', () => expect(true).toBe(true))\n`,
});
writeFileSync(join(checkoutRoot, 'src/checkout/riskScore.ts'), changedRiskScore, 'utf8');
writeFileSync(
  join(checkoutRoot, 'src/checkout/reviewQueue.ts'),
  `export const reviewQueue = 'payments-manual-review'\n`,
  'utf8',
);
writeFileSync(
  join(checkoutRoot, 'tests/riskScore.test.ts'),
  `import { expect, test } from 'vitest'\nimport { evaluateRisk } from '../src/checkout/riskScore'\n\ntest('allows a normal order', () => {\n  expect(evaluateRisk({ amount: 20, country: 'US', accountAgeDays: 90, failedPayments: 0 }).action).toBe('allow')\n})\n\ntest('blocks repeated payment failures', () => {\n  expect(evaluateRisk({ amount: 900, country: 'US', accountAgeDays: 2, failedPayments: 2 }).action).toBe('block')\n})\n`,
  'utf8',
);
git(checkoutRoot, 'switch', '-qc', 'feat/PAY-1842-risk-review');
git(checkoutRoot, 'remote', 'add', 'origin', 'git@github.com:acme/checkout.git');

const apiRoot = createRepo('billing-OPS-731', {
  'src/migrations/2026_09_add_ledger.sql': 'select 1;\n',
  'README.md': '# Billing API\n',
});
const catalogRoot = createRepo('catalog-WEB-220', {
  'src/search.ts': `export const search = (query) => query.trim()\n`,
  'README.md': '# Catalog search\n',
});

const demoPage = `<!doctype html><html><head><title>Orbit Checkout · Demo</title><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>
*{box-sizing:border-box}body{margin:0;padding:32px;background:#f0f3ec;color:#18382b;font-family:Arial,sans-serif}nav{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #c4d4c6;padding-bottom:24px;font-size:12px}nav b{font-size:23px;letter-spacing:-1px}.label{font-family:monospace;letter-spacing:2px;font-size:10px;color:#477159;margin:32px 0 15px}h1{font-size:38px;line-height:1.05;letter-spacing:-2px;margin:0 0 18px}p{color:#59725e;font-size:13px;line-height:1.7}.badge{border:1px solid #9fb8a3;padding:7px 10px;font-size:11px;background:#e4eddf}.box{padding:24px;border:1px solid #bcd0be;margin-top:24px;background:#fff}.row{display:flex;justify-content:space-between;align-items:center;padding:15px 0;border-bottom:1px solid #e0e8df;font-size:13px}.row:last-child{border:0}small{color:#617b64;font-size:11px}h2{font-size:18px;margin:0 0 12px}.action{padding:15px;background:#244e35;color:white;display:block;text-align:center;margin-top:22px;font-size:13px;border:0;width:100%}.note{padding:14px;background:#e3efd8;font:11px/1.7 monospace;margin-top:15px}.total{font-size:19px;font-weight:bold}
</style></head><body><nav><b>orbit<span style="color:#82a26d">.</span></b><span class="badge">DEMO / CUSTOMER</span></nav><div class="label">CHECKOUT / PAY-1842</div><h1>Good things,<br>on their way.</h1><p>A little less friction from cart to confirmation.<br>Your order is ready for a final look.</p><div class="box"><h2>Your order</h2><div class="row"><div>Field Notes — 3 pack<br><small>Forest / ruled</small></div><b>$18.00</b></div><div class="row"><div>Studio Pencil Set<br><small>Graphite / six pencils</small></div><b>$12.00</b></div><div class="row"><span>Shipping</span><span>On us</span></div><div class="row total"><span>Total</span><span>$30.00</span></div><button class="action">Complete order</button><div class="note">✓ Risk checks passed<br>Account verified · Secure checkout</div></div></body></html>`;
let demoServer;
let app;
try {
  app = await electron.launch({
    executablePath: join(projectRoot, 'node_modules/electron/dist/electron'),
    args: ['out/main/index.js', `--user-data-dir=${userData}`, '--no-sandbox', '--disable-gpu'],
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      MXWL_DISABLE_KEEP_ALIVE: '1',
      MXWL_CONTROL_PORT: '0',
      MXWL_MCP_PORT: '0',
    },
  });

  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() => document.fonts.ready);
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.unmaximize();
    window.setSize(1600, 1000);
    window.center();
  });

  const host = await page.evaluate(
    async ({ root, agentPath, checkouts }) => {
      await window.api.settings.update({
        agent: {
          defaultAgent: 'claude',
          commandOverrides: { claude: 'node' },
          argsOverrides: { claude: agentPath },
          autoApprove: false,
        },
        notifications: {
          delivery: 'off',
          delaySeconds: 0,
          sound: false,
          suppressActiveWorkspace: false,
          mutedAgents: [],
        },
      });
      const local = await window.api.host.ensureLocal();
      const host = await window.api.host.save({
        ...local,
        label: 'Studio workstation',
        auth: { kind: 'none' },
      });
      const locations = {};
      for (const [label, path] of Object.entries(checkouts)) {
        const project = await window.api.project.save({
          label,
          repositoryUrl: '',
          derive: {
            folderPattern: '(?<name>.+)-(?<issue>[A-Z]+-\\d+)$',
            titleTemplate: '${name}',
            issueKeyTemplate: '${issue}',
            browserUrlTemplate: '',
          },
          services: [],
          hide: ['node_modules', '.git', 'dist', 'out'],
          terminalStartup: '',
          browserProfiles: [],
          defaultBrowserProfileId: null,
          integrations: {
            taskProvider: 'none',
            scmProvider: 'github',
            taskProject: '',
            repositoryWorkspace: 'acme',
            repositorySlug: label.toLowerCase(),
          },
          ai: { workspaceFolderTemplate: '${project}-${keyLower}', initBranchCommand: '' },
          plugins: {},
        });
        const location = await window.api.project.saveLocation({
          projectId: project.id,
          hostId: host.id,
          label: 'Local development',
          checkoutPath: path,
          workspacesRoot: root,
          folderFilter: '',
          appSubdirectory: '',
          browserProfileId: null,
          overrides: {},
        });
        locations[path] = location.id;
      }
      return { ...host, locations };
    },
    {
      root: workRoot,
      agentPath: fakeAgent,
      checkouts: { Checkout: checkoutRoot, Billing: apiRoot, Catalog: catalogRoot },
    },
  );

  const checkout = await page.evaluate(
    ([hostId, path, locationId]) => window.api.workspace.open(hostId, path, locationId),
    [host.id, checkoutRoot, host.locations[checkoutRoot]],
  );
  await waitForWorkspace(page, checkout.id);
  await page.evaluate((id) => window.api.workspace.rename(id, 'Checkout release'), checkout.id);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  const layout = page.getByRole('combobox', { name: 'Workspace layout preset' });
  await layout.selectOption('review');
  await page.getByText('Changed files', { exact: true }).waitFor({ state: 'visible' });
  await page.locator('button[title^="src/checkout/riskScore.ts"]').click();
  await page.getByRole('button', { name: 'Split' }).click();
  await page.locator('.mxwl-diff').waitFor({ state: 'visible' });
  await page.getByTitle(/Maximize code pane/).click();
  await page.getByTitle(/Restore layout/).waitFor({ state: 'visible' });
  await page.waitForTimeout(800);
  await page.screenshot({
    path: join(outputDir, 'mxwl-review.png'),
    animations: 'disabled',
  });

  await page.keyboard.press('Escape');
  const [billing, catalog] = await page.evaluate(
    async ({ hostId, paths, locations }) =>
      Promise.all(paths.map((path) => window.api.workspace.open(hostId, path, locations[path]))),
    { hostId: host.id, paths: [apiRoot, catalogRoot], locations: host.locations },
  );
  await Promise.all([waitForWorkspace(page, billing.id), waitForWorkspace(page, catalog.id)]);
  await page.evaluate(
    async ({ billingId, catalogId }) => {
      await window.api.workspace.rename(billingId, 'Billing migration');
      await window.api.workspace.rename(catalogId, 'Catalog search');
    },
    { billingId: billing.id, catalogId: catalog.id },
  );
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  for (const id of [checkout.id, billing.id, catalog.id]) {
    await page.evaluate((wsId) => window.api.agent.open(wsId, 'claude'), id);
    await waitForAgent(page, id, (state) => state?.status === 'ready');
  }

  await page.evaluate((id) => {
    void window.api.agent.prompt(id, 'slow Run checkout tests and verify the risk thresholds');
  }, checkout.id);
  await page.evaluate((id) => {
    void window.api.agent.prompt(id, 'permission Apply the ledger migration');
  }, billing.id);
  await page.evaluate(
    (id) => window.api.agent.prompt(id, 'plan the catalog search release'),
    catalog.id,
  );
  await waitForAgent(page, catalog.id, (state) => state?.turn === 'idle');
  await page.evaluate(
    (id) =>
      window.api.agent.prompt(
        id,
        'showcase Catalog audit complete — ranking, empty states, and keyboard navigation all pass',
      ),
    catalog.id,
  );
  await waitForAgent(page, checkout.id, (state) => state?.turn === 'running');
  await waitForAgent(page, billing.id, (state) => Boolean(state?.permission));
  await waitForAgent(page, catalog.id, (state) => state?.turn === 'idle');

  await page
    .getByRole('button', {
      name: 'Open Catalog search on Studio workstation in Catalog',
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'Agent', exact: true }).click();
  await page.keyboard.press('Control+Shift+3');
  await page.getByRole('button', { name: 'Agent notifications' }).click();
  await page.getByText(/Live agents · 3/).click();
  await page
    .getByRole('button', { name: /Billing migration attention/ })
    .waitFor({ state: 'visible' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(outputDir, 'mxwl-agent-fleet.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // Capture the editor itself using a disposable demo workspace.
  await page.getByRole('button', { name: 'Overview of Checkout', exact: true }).click();
  await page
    .getByRole('region', { name: 'Project Checkout', exact: true })
    .waitFor({ state: 'visible' });
  await page.screenshot({
    path: join(outputDir, 'mxwl-project-hosts.png'),
    animations: 'disabled',
    clip: { x: 0, y: 0, width: await page.evaluate(() => innerWidth), height: 420 },
  });
  await page
    .getByRole('button', {
      name: 'Open Checkout release on Studio workstation in Checkout',
      exact: true,
    })
    .click();
  await page.getByRole('combobox', { name: 'Workspace layout preset' }).selectOption('balanced');
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.getByRole('button', { name: 'Code', exact: true }).click();
  if (!(await page.getByRole('button', { name: 'checkout', exact: true }).isVisible()))
    await page.getByRole('button', { name: 'src', exact: true }).click();
  if (!(await page.getByRole('button', { name: 'riskScore.ts', exact: true }).isVisible()))
    await page.getByRole('button', { name: 'checkout', exact: true }).click();
  await page.getByRole('button', { name: 'riskScore.ts', exact: true }).click();
  await page.getByRole('button', { name: 'Agent', exact: true }).click();
  await page.evaluate((id) => window.api.agent.cancel(id), checkout.id);
  await waitForAgent(page, checkout.id, (state) => state?.turn === 'idle');
  await page.evaluate(
    (id) =>
      window.api.agent.prompt(
        id,
        'showcase Checkout risk checks complete — thresholds, new accounts, and payment failures are covered. Ready for your review.',
      ),
    checkout.id,
  );
  await waitForAgent(page, checkout.id, (state) => state?.turn === 'idle');
  demoServer = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(demoPage);
  });
  await new Promise((resolveListen) => demoServer.listen(0, '127.0.0.1', resolveListen));
  const demoPort = demoServer.address().port;
  await page.evaluate(
    async ({ id, port }) => {
      const snapshot = await window.api.browser.snapshot(id);
      if (snapshot?.activeId)
        await window.api.browser.navigate(
          id,
          snapshot.activeId,
          'http://127.0.0.1:' + port + '/checkout',
        );
      else await window.api.browser.newTab(id, 'http://127.0.0.1:' + port + '/checkout');
      await window.api.browser.activate(id);
    },
    { id: checkout.id, port: demoPort },
  );
  await page.waitForTimeout(1200);
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.focus();
  });
  const screenshotBase64 = await app.evaluate(async ({ BrowserWindow, desktopCapturer }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const windowId = window.getNativeWindowHandle().readUInt32LE(0);
    const [width, height] = window.getSize();
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width, height },
    });
    const source = sources.find((source) => source.id.startsWith('window:' + windowId + ':'));
    if (!source) throw new Error('The mxwl window was not available for native screenshot capture');
    return source.thumbnail.toPNG().toString('base64');
  });
  writeFileSync(join(outputDir, 'mxwl-workspace.png'), Buffer.from(screenshotBase64, 'base64'));

  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('host:discoverTailscale');
    ipcMain.handle('host:discoverTailscale', () => ({
      state: 'ready',
      message: '',
      tailnet: 'studio.example',
      suggestedUsername: 'developer',
      devices: [
        {
          id: 'build',
          name: 'build-station',
          dnsName: 'build-station.studio.example',
          address: '100.64.0.20',
          ips: ['100.64.0.20'],
          os: 'linux',
          online: true,
          sshAdvertised: true,
          tags: ['tag:build'],
        },
        {
          id: 'dev',
          name: 'devbox',
          dnsName: 'devbox.studio.example',
          address: '100.64.0.21',
          ips: ['100.64.0.21'],
          os: 'linux',
          online: true,
          sshAdvertised: true,
          tags: ['tag:development'],
        },
        {
          id: 'studio',
          name: 'studio-mac',
          dnsName: 'studio-mac.studio.example',
          address: '100.64.0.22',
          ips: ['100.64.0.22'],
          os: 'macOS',
          online: false,
          sshAdvertised: true,
          tags: [],
        },
      ],
    }));
  });
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Manage connections', exact: true }).click();
  await page.getByRole('button', { name: 'Discover Tailscale', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Tailscale devices' })
    .getByText('build-station', { exact: true })
    .waitFor({ state: 'visible' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(outputDir, 'mxwl-tailscale.png'), animations: 'disabled' });

  process.stdout.write(`Captured website screenshots in ${outputDir}\n`);
} finally {
  demoServer?.close();
  await app?.close().catch(() => undefined);
  rmSync(workRoot, { recursive: true, force: true });
  rmSync(userData, { recursive: true, force: true });
}

async function waitForWorkspace(page, wsId) {
  await waitFor(async () => {
    const workspace = await page.evaluate(
      (id) => window.api.workspace.list().then((items) => items.find((item) => item.id === id)),
      wsId,
    );
    return workspace?.status === 'connected';
  }, `workspace ${wsId} to connect`);
}

async function waitForAgent(page, wsId, predicate) {
  await waitFor(
    async () => predicate(await page.evaluate((id) => window.api.agent.get(id), wsId)),
    `agent ${wsId}`,
  );
}

async function waitFor(predicate, label, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}
