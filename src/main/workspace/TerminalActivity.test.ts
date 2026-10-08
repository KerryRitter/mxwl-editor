import { afterEach, describe, expect, it, vi } from 'vitest'
import { TerminalActivity } from './TerminalActivity'

afterEach(() => vi.useRealTimers())

describe('terminal activity', () => {
  it('follows animated CLI output and settles when it stops', () => {
    vi.useFakeTimers()
    const changed = vi.fn()
    const activity = new TerminalActivity(changed)
    activity.output('user@host $ ls\r\nfile.txt\r\n')
    expect(activity.busy).toBe(false)
    activity.output('\r\x1b[2K⠋ Working (2s · esc to interrupt)')
    expect(activity.busy).toBe(true)
    vi.advanceTimersByTime(1000)
    activity.output('\r\x1b[2K⠙ Working (3s · esc to interrupt)')
    vi.advanceTimersByTime(1000)
    expect(activity.busy).toBe(true)
    activity.output('\r\nDone\r\n')
    vi.advanceTimersByTime(1800)
    expect(activity.busy).toBe(false)
    expect(changed.mock.calls).toEqual([[true], [false]])
  })

  it('keeps explicit progress busy during silence and clears at the shell prompt', () => {
    vi.useFakeTimers()
    const activity = new TerminalActivity(() => undefined)
    activity.output('\x1b]133;')
    activity.output('C\x07')
    vi.advanceTimersByTime(60_000)
    expect(activity.busy).toBe(true)
    activity.output('\x1b]133;D;0\x07\x1b]133;A\x07')
    expect(activity.busy).toBe(false)
    activity.output('\x1b]9;4;3\x1b\\')
    expect(activity.busy).toBe(true)
    activity.output('\x1b]9;4;0\x1b\\')
    expect(activity.busy).toBe(false)
  })

  it('clears progress and timers when the terminal closes', () => {
    vi.useFakeTimers()
    const activity = new TerminalActivity(() => undefined)
    activity.output('⠋')
    activity.dispose()
    expect(activity.busy).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
