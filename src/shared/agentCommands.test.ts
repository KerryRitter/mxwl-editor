import { describe, it, expect } from 'vitest'
import {
  CANONICAL_COMMANDS,
  CANONICAL_MODES,
  CLIENT_COMMANDS,
  annotateModes,
  buildCommandPalette,
  canonicalCommandFor,
  canonicalModeFor,
  findMode,
  matchCommands,
  normalizeName,
  permissiveMode,
  resolveSlash
} from './agentCommands'

describe('canonical tables', () => {
  it('never gives one alias to two commands', () => {
    const seen = new Map<string, string>()
    for (const entry of CANONICAL_COMMANDS) {
      for (const alias of entry.aliases) {
        expect(seen.has(alias), `"${alias}" is on both ${seen.get(alias)} and ${entry.id}`).toBe(
          false
        )
        seen.set(alias, entry.id)
      }
    }
  })

  it('never gives one alias to two modes', () => {
    const seen = new Map<string, string>()
    for (const entry of CANONICAL_MODES) {
      for (const alias of entry.aliases) {
        expect(seen.has(alias), `"${alias}" is on both ${seen.get(alias)} and ${entry.id}`).toBe(
          false
        )
        seen.set(alias, entry.id)
      }
    }
  })

  it('includes each id in its own aliases, already normalised', () => {
    for (const entry of [...CANONICAL_COMMANDS, ...CANONICAL_MODES]) {
      expect(entry.aliases).toContain(entry.id)
      for (const alias of entry.aliases) expect(alias).toBe(normalizeName(alias))
    }
  })
})

describe('normalizeName', () => {
  it('ignores case and punctuation', () => {
    expect(normalizeName('Accept-Edits')).toBe('acceptedits')
    expect(normalizeName('acceptEdits')).toBe('acceptedits')
    expect(normalizeName('/compact')).toBe('compact')
  })
})

describe('canonicalCommandFor', () => {
  it('maps synonyms onto one id', () => {
    expect(canonicalCommandFor('compress')).toBe('compact')
    expect(canonicalCommandFor('summarise')).toBe('compact')
    expect(canonicalCommandFor('compact')).toBe('compact')
  })

  it('returns null for a name it does not know', () => {
    expect(canonicalCommandFor('frobnicate')).toBeNull()
    expect(canonicalCommandFor('')).toBeNull()
  })
})

describe('canonicalModeFor', () => {
  it('maps the postures agents actually publish', () => {
    expect(canonicalModeFor('acceptEdits')).toBe('auto')
    expect(canonicalModeFor('bypassPermissions')).toBe('full')
    expect(canonicalModeFor('default')).toBe('ask')
    expect(canonicalModeFor('plan')).toBe('plan')
  })
})

describe('buildCommandPalette', () => {
  it('carries the canonical synonyms as aliases', () => {
    const [cmd] = buildCommandPalette([{ name: 'compress' }]).filter((c) => c.name === 'compress')
    expect(cmd.canonical).toBe('compact')
    expect(cmd.aliases).toContain('compact')
    // the command's own name is not repeated back as an alias
    expect(cmd.aliases).not.toContain('compress')
  })

  it('keeps unknown agent commands, without a canonical', () => {
    const cmd = buildCommandPalette([{ name: 'frobnicate', description: 'do the thing' }]).find(
      (c) => c.name === 'frobnicate'
    )
    expect(cmd).toMatchObject({ canonical: null, description: 'do the thing', source: 'agent' })
  })

  it('falls back to the canonical description when the agent gives none', () => {
    const cmd = buildCommandPalette([{ name: 'compact' }]).find((c) => c.name === 'compact')
    expect(cmd?.description).not.toBe('')
  })

  it('strips a leading slash and drops duplicates', () => {
    const palette = buildCommandPalette([{ name: '/compact' }, { name: 'compact' }])
    expect(palette.filter((c) => c.name === 'compact')).toHaveLength(1)
  })

  it('always offers the client commands', () => {
    const palette = buildCommandPalette([])
    for (const client of CLIENT_COMMANDS) {
      expect(palette.find((c) => c.name === client.name)?.source).toBe('client')
    }
  })

  it('lets a reserved client command shadow the agent’s own', () => {
    const palette = buildCommandPalette([{ name: 'mode', description: 'agent version' }])
    const modes = palette.filter((c) => c.name === 'mode')
    expect(modes).toHaveLength(1)
    expect(modes[0].source).toBe('client')
  })

  it('marks commands that take input', () => {
    const palette = buildCommandPalette([{ name: 'review', input: { hint: 'PR url' } }])
    expect(palette.find((c) => c.name === 'review')?.takesInput).toBe(true)
    expect(palette.find((c) => c.name === 'help')?.takesInput ?? false).toBe(false)
  })
})

describe('matchCommands', () => {
  const palette = buildCommandPalette([
    { name: 'compress', description: 'shrink the conversation' },
    { name: 'review', description: 'review a pull request' },
    { name: 'init', description: 'write the repo guide' }
  ])

  it('lists everything for an empty query', () => {
    expect(matchCommands('', palette)).toHaveLength(palette.length)
  })

  it('ranks an exact name first', () => {
    expect(matchCommands('review', palette)[0].name).toBe('review')
  })

  it('finds a command by a name this agent does not use', () => {
    expect(matchCommands('compact', palette)[0].name).toBe('compress')
  })

  it('falls back to description text', () => {
    expect(matchCommands('shrink', palette)[0].name).toBe('compress')
  })

  it('returns nothing when nothing matches', () => {
    expect(matchCommands('zzzz', palette)).toEqual([])
  })
})

describe('resolveSlash', () => {
  const palette = buildCommandPalette([
    { name: 'compress' },
    { name: 'review', input: { hint: 'target' } }
  ])

  it('ignores lines that are not commands', () => {
    expect(resolveSlash('hello there', palette)).toBeNull()
    expect(resolveSlash('/', palette)).toBeNull()
  })

  it('resolves an exact name without claiming a translation', () => {
    expect(resolveSlash('/compress', palette)).toMatchObject({
      rest: '',
      translated: false
    })
  })

  it('translates a name the agent does not have', () => {
    const hit = resolveSlash('/compact', palette)
    expect(hit?.command.name).toBe('compress')
    expect(hit?.translated).toBe(true)
  })

  it('keeps the argument text', () => {
    const hit = resolveSlash('/review  https://example.com/pr/1 ', palette)
    expect(hit?.command.name).toBe('review')
    expect(hit?.rest).toBe('https://example.com/pr/1')
  })

  it('resolves client commands by alias', () => {
    const hit = resolveSlash('/stop', palette)
    expect(hit?.command.name).toBe('cancel')
    expect(hit?.command.source).toBe('client')
  })

  it('returns null for an unknown command, so it can pass through', () => {
    expect(resolveSlash('/frobnicate now', palette)).toBeNull()
  })
})

describe('modes', () => {
  const modes = annotateModes([
    { id: 'default', name: 'Always ask' },
    { id: 'acceptEdits', name: 'Accept edits' },
    { id: '3', name: 'Plan mode', description: 'read only' }
  ])

  it('canonicalises from the id or the name', () => {
    expect(modes[0].canonical).toBe('ask')
    expect(modes[1].canonical).toBe('auto')
    expect(modes[2].canonical).toBe('plan')
  })

  it('finds a mode by the canonical posture', () => {
    expect(findMode('auto', modes)?.id).toBe('acceptEdits')
    expect(findMode('yolo', modes)).toBeNull()
  })

  it('finds a mode by its own id or name', () => {
    expect(findMode('acceptEdits', modes)?.id).toBe('acceptEdits')
    expect(findMode('Plan mode', modes)?.id).toBe('3')
  })

  it('picks the most permissive posture on offer, full auto first', () => {
    expect(permissiveMode(modes)?.id).toBe('acceptEdits')
    const withBypass = annotateModes([...modes, { id: 'bypassPermissions', name: 'Bypass' }])
    expect(permissiveMode(withBypass)?.id).toBe('bypassPermissions')
  })

  it('has nothing to pick when the agent only reasons', () => {
    expect(permissiveMode(annotateModes([{ id: 'plan', name: 'Plan' }]))).toBeNull()
  })
})
