import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const origin = process.env.MXWL_SITE_URL ?? 'http://127.0.0.1:4321';
const output = resolve(import.meta.dirname, '../.qa');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.MXWL_CHROME_PATH ? { executablePath: process.env.MXWL_CHROME_PATH } : {}),
});
const results = [];
const failures = [];
const routes = [
  '/',
  '/tour/',
  '/agents/',
  '/remote/',
  '/tailscale/',
  '/github/',
  '/plugins/',
  '/download/',
  '/about/',
  '/docs/',
  '/docs/getting-started/',
  '/docs/tailscale/',
  '/docs/github/',
  '/docs/plugin-api/',
];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ['clipboard-read', 'clipboard-write'],
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`Runtime: ${error.message}`));
  page.on('response', (response) => {
    if (response.url().startsWith(origin) && response.status() >= 400)
      failures.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of routes) {
      const response = await page.goto(origin + route, { waitUntil: 'networkidle' });
      if (response?.status() !== 200)
        failures.push(`${width}px ${route}: status ${response?.status()}`);
      await page.evaluate(async () => {
        for (const image of document.querySelectorAll('img[loading="lazy"]'))
          image.setAttribute('loading', 'eager');
        await Promise.all(
          [...document.images]
            .filter((image) => image.getAttribute('src'))
            .map((image) => image.decode().catch(() => {})),
        );
        await document.fonts.ready;
      });
      const checks = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        brokenImages: [...document.images]
          .filter(
            (image) => image.getAttribute('src') && (!image.complete || image.naturalWidth === 0),
          )
          .map((image) => image.getAttribute('src')),
        h1s: document.querySelectorAll('h1').length,
      }));
      if (checks.overflow) failures.push(`${width}px ${route}: horizontal overflow`);
      if (checks.brokenImages.length)
        failures.push(`${width}px ${route}: broken images ${checks.brokenImages.join(', ')}`);
      if (checks.h1s !== 1) failures.push(`${width}px ${route}: ${checks.h1s} h1s`);
      if (width === 1440 || width === 390) {
        const axe = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        for (const violation of axe.violations)
          failures.push(
            `${width}px ${route}: ${violation.id} — ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
          );
      }
      results.push({ width, route, ...checks });
      if (
        (width === 1440 || width === 390) &&
        ['/', '/download/', '/docs/getting-started/', '/plugins/', '/tailscale/'].includes(route)
      ) {
        const filename = route === '/' ? 'home' : route.replaceAll('/', '-').replace(/^-|-$/g, '');
        await page.screenshot({
          path: resolve(output, `${filename}-${width}.png`),
          fullPage: true,
        });
        if (route === '/')
          await page.screenshot({ path: resolve(output, `home-viewport-${width}.png`) });
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Menu' }).click();
  if ((await page.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded')) !== 'true')
    failures.push('Mobile menu did not open');
  await page.keyboard.press('Escape');
  if ((await page.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded')) !== 'false')
    failures.push('Mobile menu did not close with Escape');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await page.reload({ waitUntil: 'networkidle' });
  if ((await page.locator('html').getAttribute('data-theme')) !== 'light')
    failures.push('Theme did not persist');
  const lightAxe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  for (const violation of lightAxe.violations)
    failures.push(
      `Light theme: ${violation.id} — ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
    );
  await page.screenshot({ path: resolve(output, 'home-light-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await page.locator('.screenshot-image').first().click();
  if (!(await page.locator('dialog').isVisible())) failures.push('Screenshot dialog did not open');
  await page.keyboard.press('Escape');
  if (await page.locator('dialog').isVisible()) failures.push('Screenshot dialog did not close');
  if (
    !(await page
      .locator('.screenshot-image')
      .first()
      .evaluate((element) => element === document.activeElement))
  )
    failures.push('Screenshot dialog did not restore focus');
  await page.goto(`${origin}/download/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Copy linux / x86_64 command' }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  if (!copied.includes('KerryRitter/mxwl-editor/main/scripts/install.sh'))
    failures.push('Installer clipboard contents incorrect');
  await page.getByText('Is mxwl free?', { exact: true }).click();
  if (!(await page.getByText('Yes. The editor is open source', { exact: false }).isVisible()))
    failures.push('FAQ did not expand');
  await page.goto(`${origin}/docs/getting-started/`, { waitUntil: 'networkidle' });
  await page.locator('.manual-mobile summary').click();
  if (!(await page.locator('.manual-mobile nav').isVisible()))
    failures.push('Mobile documentation navigation did not open');
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1))
    failures.push('200% text size caused horizontal overflow');
} finally {
  await browser.close();
}
writeFileSync(resolve(output, 'results.json'), JSON.stringify({ results, failures }, null, 2));
if (failures.length) {
  console.error([...new Set(failures)].join('\n'));
  process.exit(1);
}
console.log(
  `Passed ${results.length} responsive page checks, accessibility scans, and menu/theme/gallery/copy/FAQ/documentation interactions.`,
);
