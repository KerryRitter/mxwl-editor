import type { GitChange, GitChangeKind, GitDiffHunk } from '../../shared/types'

const isRenameOrCopy = (x: string, y: string): boolean => /[RC]/.test(`${x}${y}`)

const kindFor = (x: string, y: string): GitChangeKind => {
  const pair = `${x}${y}`
  if (pair === '??') return 'untracked'
  if (/[U]/.test(pair) || pair === 'AA' || pair === 'DD') return 'conflicted'
  if (pair.includes('R')) return 'renamed'
  if (pair.includes('C')) return 'copied'
  if (pair.includes('A')) return 'added'
  if (pair.includes('D')) return 'deleted'
  return 'modified'
}

/** Parses `git status --porcelain=v1 -z`, including unquoted paths and renames. */
export function parseGitStatus(raw: string): GitChange[] {
  const records = raw.split('\0')
  const out: GitChange[] = []

  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    if (!record || record.length < 4) continue
    const indexStatus = record[0]
    const worktreeStatus = record[1]
    const path = record.slice(3)
    const oldPath = isRenameOrCopy(indexStatus, worktreeStatus) ? records[++i] || undefined : undefined
    const untracked = indexStatus === '?' && worktreeStatus === '?'

    out.push({
      path,
      ...(oldPath ? { oldPath } : {}),
      indexStatus,
      worktreeStatus,
      kind: kindFor(indexStatus, worktreeStatus),
      staged: ![' ', '?', '!'].includes(indexStatus),
      unstaged: untracked || ![' ', '?', '!'].includes(worktreeStatus),
      additions: null,
      deletions: null
    })
  }

  return out
}

type NumStat = { additions: number | null; deletions: number | null }

/** Parses `git diff --numstat -z`; rename records have two following path fields. */
export function parseGitNumStat(raw: string): Map<string, NumStat> {
  const records = raw.split('\0')
  const out = new Map<string, NumStat>()

  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    if (!record) continue
    const firstTab = record.indexOf('\t')
    const secondTab = firstTab < 0 ? -1 : record.indexOf('\t', firstTab + 1)
    if (firstTab < 0 || secondTab < 0) continue

    const addedRaw = record.slice(0, firstTab)
    const deletedRaw = record.slice(firstTab + 1, secondTab)
    let path = record.slice(secondTab + 1)
    if (!path) {
      // With -z, rename/copy output is: counts + empty path, old path, new path.
      i += 1 // old path; kept only so the cursor reaches the destination path
      path = records[++i] || ''
    }
    if (!path) continue

    out.set(path, {
      additions: addedRaw === '-' ? null : Number(addedRaw) || 0,
      deletions: deletedRaw === '-' ? null : Number(deletedRaw) || 0
    })
  }

  return out
}

export function mergeGitStats(files: GitChange[], stats: Map<string, NumStat>): GitChange[] {
  return files.map((file) => {
    const stat = stats.get(file.path)
    return stat ? { ...file, ...stat } : file
  })
}

export function countLines(text: string): number {
  if (!text) return 0
  const lines = text.split('\n').length
  return text.endsWith('\n') ? lines - 1 : lines
}

/** Splits one `git diff` patch into independently applicable file hunks. */
export function parseGitHunks(raw: string): GitDiffHunk[] {
  if (!raw.trim()) return []
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const firstHunk = lines.findIndex((line) => line.startsWith('@@ '))
  if (firstHunk < 0) return []
  const fileHeader = lines.slice(0, firstHunk)
  const starts: number[] = []
  for (let i = firstHunk; i < lines.length; i++) {
    if (lines[i].startsWith('@@ ')) starts.push(i)
  }

  return starts.map((start, index) => {
    const end = starts[index + 1] ?? lines.length
    const hunkLines = lines.slice(start, end)
    while (hunkLines[hunkLines.length - 1] === '') hunkLines.pop()
    const header = hunkLines[0]
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(header)
    const additions = hunkLines.filter(
      (line) => line.startsWith('+') && !line.startsWith('+++')
    ).length
    const deletions = hunkLines.filter(
      (line) => line.startsWith('-') && !line.startsWith('---')
    ).length
    return {
      id: match ? `${match[1]}:${match[3]}` : String(index),
      header,
      patch: [...fileHeader, ...hunkLines, ''].join('\n'),
      additions,
      deletions
    }
  })
}
