import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, useLocalHost, setAiSettings } from './fixtures'

/**
 * A cold `/agent/init-branch` runs for minutes. The modal is the only thing the
 * operator is watching, so it has to show that work is happening — otherwise a
 * slow setup is indistinguishable from a hung one.
 */
test('the setup card streams the command output and counts elapsed time', async ({
  page,
  workRoot
}) => {
  const repo = join(workRoot, 'zipper')
  mkdirSync(repo, { recursive: true })
  const init = join(repo, 'init.sh')
  writeFileSync(
    init,
    [
      '#!/bin/bash',
      // Long enough that the card is observably mid-run, not caught at the end.
      'for i in $(seq 1 15); do echo "cloning step $i of 15"; sleep 1; done',
      `mkdir -p ${join(workRoot, 'zipper-PLAT-5583')} ${join(workRoot, 'zipper-PLAT-5577')}`,
      'echo init complete',
      ''
    ].join('\n')
  )
  chmodSync(init, 0o755)

  await useLocalHost(page, workRoot)
  await setAiSettings(page, {
    workspaceFolderTemplate: 'zipper-${key}',
    initTimeoutSec: 60,
    refinePrompts: false,
    commandOverrides: { claude: 'echo' }
  })
  // The hosts store is filled at startup, so pick the new host up before driving the UI.
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  await page.keyboard.press('Control+Shift+A')
  await page
    .locator('textarea')
    .first()
    .fill(`in ${repo}, run ./init.sh, then run the qa checks for PLAT-5583 and PLAT-5577`)
  await page.getByRole('button', { name: 'Plan' }).click()

  // The card promises to wait for the command, not for the folders.
  const prep = page.getByTestId('ai-prep')
  await expect(prep).toContainText('Waits for this command to finish')

  await page.getByRole('button', { name: /Run 2 tasks/ }).click()

  const status = page.getByTestId('ai-prep-status')
  const output = page.getByTestId('ai-prep-output')
  const elapsed = page.getByTestId('ai-prep-elapsed')

  // Output shows up while the command is still running, not only at the end.
  await expect(output).toContainText('cloning step', { timeout: 20_000 })
  await expect(status).toHaveText('running')
  await expect(elapsed).toBeVisible()

  // The tail keeps moving: it mirrors the terminal rather than painting once.
  const early = await output.textContent()
  await expect.poll(() => output.textContent(), { timeout: 20_000 }).not.toBe(early)

  // It settles on the last lines of a command that ran well past the tail length.
  await expect(output).toContainText('init complete', { timeout: 60_000 })
  await expect(status).toHaveText('done', { timeout: 30_000 })

  // The counter freezes once setup is over rather than running on forever.
  const settled = await elapsed.textContent()
  await page.waitForTimeout(2500)
  expect(await elapsed.textContent()).toBe(settled)
})
