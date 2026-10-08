import { expect, test, useLocalHost, setAiSettings } from './fixtures'

const BRIEF =
  'in ~/Workspaces/myapp, run /agent:init-branch for both branches, theb run the qa checks for PLAT-5583 and PLAT-5577'

test('the modal plans the operator brief end to end', async ({
  page,
  workRoot
}) => {
  await useLocalHost(page, workRoot)
  await setAiSettings(page, {
    workspaceFolderTemplate: 'myapp-${key}',
    refinePrompts: false
  })
  // The hosts store is filled at startup, so pick the new host up before driving the UI.
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await expect(
    page.getByRole('region', { name: 'Project Test project', exact: true })
  ).toBeVisible()

  await page.keyboard.press('Control+Shift+A')
  const modal = page.getByText('Run AI tasks', { exact: true })
  await expect(modal).toBeVisible()

  await page.locator('textarea').first().fill(BRIEF)
  await page.getByRole('button', { name: 'Plan' }).click()

  // Setup phase read out of the brief, not out of Settings.
  const prep = page.getByTestId('ai-prep')
  await expect(prep).toContainText('~/Workspaces/myapp')
  await expect(prep).toContainText('/agent:init-branch for both branches')
  await expect(prep).toContainText('runs once, before the tickets')

  // One workspace per ticket, folder names from the template.
  await expect(page.getByText('2 workspaces · 2 terminals')).toBeVisible()
  const targets = page.getByTestId('ai-target')
  await expect(targets).toHaveCount(2)
  await expect(targets.nth(0)).toContainText('myapp-PLAT-5583')
  await expect(targets.nth(1)).toContainText('myapp-PLAT-5577')
  await expect(page.getByRole('button', { name: /Run 2 tasks/ })).toBeEnabled()
})

test('the compiled plan scopes each prompt to its own ticket', async ({
  page,
  workRoot
}) => {
  const hostId = await useLocalHost(page, workRoot)
  await setAiSettings(page, { workspaceFolderTemplate: 'myapp-${key}' })

  const plan = await page.evaluate(
    async ([brief, host]) =>
      window.api.ai.plan({
        brief,
        hostId: host,
        locationId: (await window.api.project.locations()).find(
          (l) => l.hostId === host
        )!.id,
        cli: 'claude',
        refine: false
      }),
    [BRIEF, hostId] as const
  )

  expect(plan.plan.prep?.cwd).toBe('~/Workspaces/myapp')
  expect(plan.plan.prep?.kind).toBe('cli')
  expect(plan.plan.prep?.blocking).toBe(true)
  expect(plan.plan.targets.map((t) => t.folder)).toEqual([
    'myapp-PLAT-5583',
    'myapp-PLAT-5577'
  ])

  const first = plan.plan.targets[0].tasks[0].prompt
  expect(first).toContain('PLAT-5583')
  expect(first).not.toContain('PLAT-5577')
  // The one-off setup must not be repeated as per-ticket work.
  expect(first).not.toContain('/agent:init-branch')
})
