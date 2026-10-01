import { describe, expect, it } from 'vitest'
import { TerminalSession, type TerminalSessionOptions } from './TerminalSession'

function session(overrides: Partial<TerminalSessionOptions> = {}) {
  // Replay metadata is established before any shell connection is started.
  return new TerminalSession({
    wsId: 'workspace',
    conn: {} as TerminalSessionOptions['conn'],
    cwd: '/checkout',
    cols: 80,
    rows: 24,
    getSender: () => null,
    ...overrides
  })
}

describe('terminal restore metadata', () => {
  it('does not label a fresh shell as restored', () => {
    expect(session().replay()).toBe('')
  })
  it('labels a restored shell even when it had no output to checkpoint', () => {
    expect(session({ initialReplay: '' }).replay()).toContain(
      'restored after restart — new shell process'
    )
  })
  it('keeps output and identifies tmux reattachment', () => {
    const replay = session({
      initialReplay: 'previous output',
      tmuxName: 'tests'
    }).replay()
    expect(replay).toContain('previous output')
    expect(replay).toContain('restored after restart — reattaching tmux:tests')
  })
})
