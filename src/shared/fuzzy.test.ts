import { describe, expect, it } from 'vitest'
import { fuzzyScore, fuzzySort } from './fuzzy'

describe('fuzzy matching', () => {
  it('matches non-contiguous characters and rejects missing ones', () => {
    expect(fuzzyScore('dvw', 'DiffViewer.tsx')).toBeGreaterThan(0)
    expect(fuzzyScore('xyz', 'DiffViewer.tsx')).toBe(Number.NEGATIVE_INFINITY)
  })

  it('prefers exact and boundary matches', () => {
    expect(fuzzySort('term', ['src/terminal.ts', 'src/determined.ts'], (value) => value)[0])
      .toBe('src/terminal.ts')
  })
})
