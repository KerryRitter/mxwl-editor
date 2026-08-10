import { describe, expect, it } from 'vitest'
import { humanDuration } from './duration'

describe('humanDuration', () => {
  it('keeps a short setup in plain seconds', () => {
    expect(humanDuration(0)).toBe('0s')
    expect(humanDuration(12_400)).toBe('12s')
    expect(humanDuration(59_499)).toBe('59s')
  })

  it('rolls over to minutes, zero-padding the seconds', () => {
    expect(humanDuration(60_000)).toBe('1m 00s')
    expect(humanDuration(200_000)).toBe('3m 20s')
    expect(humanDuration(3_599_000)).toBe('59m 59s')
  })

  it('rolls over to hours once a cold init runs that long', () => {
    expect(humanDuration(3_600_000)).toBe('1h 00m')
    expect(humanDuration(3_840_000)).toBe('1h 04m')
  })

  it('reads a clock skew backwards as zero rather than a negative counter', () => {
    expect(humanDuration(-5000)).toBe('0s')
  })
})
