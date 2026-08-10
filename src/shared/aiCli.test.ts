import { describe, expect, it } from 'vitest'
import { DEFAULT_AI_SETTINGS, buildHeadlessCommand, buildLaunchCommand } from './aiCli'

const settings = {
  ...DEFAULT_AI_SETTINGS,
  argsOverrides: { claude: '--dangerously-skip-permissions' }
}

describe('buildHeadlessCommand', () => {
  it('carries the per-CLI args — headless cannot answer a permission prompt', () => {
    expect(buildHeadlessCommand('claude', settings, "'/p.md'")).toBe(
      'claude -p --dangerously-skip-permissions "$(cat \'/p.md\')"'
    )
  })

  it('omits the args slot when nothing is configured', () => {
    expect(buildHeadlessCommand('claude', DEFAULT_AI_SETTINGS, "'/p.md'")).toBe(
      'claude -p "$(cat \'/p.md\')"'
    )
  })

  it('honours a command override', () => {
    expect(
      buildHeadlessCommand('claude', { ...settings, commandOverrides: { claude: '/tmp/fake' } }, "'/p.md'")
    ).toBe('/tmp/fake -p --dangerously-skip-permissions "$(cat \'/p.md\')"')
  })
})

describe('buildLaunchCommand', () => {
  it('has no headless flag — it is the interactive line', () => {
    expect(buildLaunchCommand('claude', settings, "'/p.md'")).toBe(
      'claude --dangerously-skip-permissions "$(cat \'/p.md\')"'
    )
  })
})
