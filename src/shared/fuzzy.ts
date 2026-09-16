/** Subsequence matcher with bonuses for runs and word/path boundaries. */
export function fuzzyScore(query: string, candidate: string): number {
  const needle = query.trim().toLowerCase()
  const haystack = candidate.toLowerCase()
  if (!needle) return 0

  let score = 0
  let cursor = 0
  let previous = -2
  for (const char of needle) {
    const found = haystack.indexOf(char, cursor)
    if (found < 0) return Number.NEGATIVE_INFINITY
    const boundary = found === 0 || /[\s/_.:-]/.test(haystack[found - 1])
    if (boundary) score += 8
    if (found === previous + 1) score += 5
    score += Math.max(0, 3 - (found - cursor))
    previous = found
    cursor = found + 1
  }

  const exact = haystack.indexOf(needle)
  if (exact >= 0) score += 30 - Math.min(exact, 20)
  return score - haystack.length * 0.002
}

export function fuzzySort<T>(query: string, values: T[], text: (value: T) => string): T[] {
  return values
    .map((value, index) => ({ value, index, score: fuzzyScore(query, text(value)) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.value)
}
