import { describe, expect, it } from 'vitest'
import {
  countLines,
  mergeGitStats,
  parseGitHunks,
  parseGitNumStat,
  parseGitStatus
} from './gitChanges'

describe('git change parsing', () => {
  it('reads staged, unstaged, untracked, and renamed porcelain records', () => {
    const files = parseGitStatus(
      [' M src/live.ts', 'A  src/added.ts', '?? notes with spaces.md', 'R  src/new.ts', 'src/old.ts', ''].join('\0')
    )

    expect(files).toMatchObject([
      { path: 'src/live.ts', kind: 'modified', staged: false, unstaged: true },
      { path: 'src/added.ts', kind: 'added', staged: true, unstaged: false },
      { path: 'notes with spaces.md', kind: 'untracked', staged: false, unstaged: true },
      { path: 'src/new.ts', oldPath: 'src/old.ts', kind: 'renamed', staged: true }
    ])
  })

  it('maps null-delimited numstat records, including renames and binary files', () => {
    const stats = parseGitNumStat(
      ['4\t2\tsrc/live.ts', '0\t0\t', 'src/old.ts', 'src/new.ts', '-\t-\tlogo.png', ''].join('\0')
    )

    expect(stats.get('src/live.ts')).toEqual({ additions: 4, deletions: 2 })
    expect(stats.get('src/new.ts')).toEqual({ additions: 0, deletions: 0 })
    expect(stats.get('logo.png')).toEqual({ additions: null, deletions: null })
  })

  it('merges stats without inventing counts for untracked files', () => {
    const [file] = mergeGitStats(parseGitStatus(' M src/live.ts\0'), parseGitNumStat('3\t1\tsrc/live.ts\0'))
    expect(file).toMatchObject({ additions: 3, deletions: 1 })
    expect(countLines('one\ntwo\n')).toBe(2)
    expect(countLines('')).toBe(0)
  })

  it('creates independently applicable patches with line counts', () => {
    const raw = [
      'diff --git a/demo.ts b/demo.ts',
      'index 1111111..2222222 100644',
      '--- a/demo.ts',
      '+++ b/demo.ts',
      '@@ -1,2 +1,2 @@',
      '-const first = 1',
      '+const first = 2',
      ' const gap = true',
      '@@ -10 +10,2 @@',
      ' export const end = true',
      '+export const extra = true',
      ''
    ].join('\n')

    const hunks = parseGitHunks(raw)
    expect(hunks).toHaveLength(2)
    expect(hunks[0]).toMatchObject({ id: '1:1', additions: 1, deletions: 1 })
    expect(hunks[1]).toMatchObject({ id: '10:10', additions: 1, deletions: 0 })
    expect(hunks[1].patch).toContain('diff --git a/demo.ts b/demo.ts')
    expect(hunks[1].patch).not.toContain('const first = 2')
  })
})
