import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // Electron instances each own a window and a userData dir — keep them serial.
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: { trace: 'retain-on-failure' }
})
