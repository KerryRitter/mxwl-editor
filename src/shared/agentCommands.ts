import type { AgentCommand, AgentModeInfo } from './types'

/**
 * Every agent names the same handful of ideas differently — Claude's `/compact`
 * is somebody else's `/compress`, `acceptEdits` is somebody else's `auto`. ACP
 * reports whatever names an agent actually has at runtime, so nothing here is a
 * hardcoded per-agent table: these are synonym sets, matched against the live
 * `available_commands_update`. An agent that publishes none of a set simply
 * doesn't offer that command, and typing it falls through verbatim.
 */
export type CanonicalEntry = {
  id: string
  label: string
  description: string
  /** Normalised synonyms, including the canonical id itself */
  aliases: string[]
}

export const CANONICAL_COMMANDS: CanonicalEntry[] = [
  {
    id: 'init',
    label: 'Init',
    description: 'Write or refresh the repo guide the agent reads on start',
    aliases: ['init', 'initialize', 'initialise', 'onboard', 'setup', 'bootstrap']
  },
  {
    id: 'compact',
    label: 'Compact',
    description: 'Summarise the conversation to reclaim context',
    aliases: ['compact', 'compress', 'condense', 'summarize', 'summarise', 'shrink']
  },
  {
    id: 'clear',
    label: 'Clear',
    description: 'Drop the conversation and start fresh',
    aliases: ['clear', 'new', 'reset', 'newchat', 'newsession', 'fresh']
  },
  {
    id: 'resume',
    label: 'Resume',
    description: 'Reopen an earlier conversation',
    aliases: ['resume', 'continue', 'history', 'sessions']
  },
  {
    id: 'review',
    label: 'Review',
    description: 'Review the working tree or a pull request',
    aliases: ['review', 'codereview', 'prreview', 'critique']
  },
  {
    id: 'test',
    label: 'Test',
    description: 'Run the project test suite',
    aliases: ['test', 'tests', 'runtests']
  },
  {
    id: 'commit',
    label: 'Commit',
    description: 'Stage and commit the current changes',
    aliases: ['commit', 'gitcommit']
  },
  {
    id: 'diff',
    label: 'Diff',
    description: 'Show what changed in the working tree',
    aliases: ['diff', 'changes', 'gitdiff', 'gitstatus']
  },
  {
    id: 'plan',
    label: 'Plan',
    description: 'Show or edit the task plan',
    aliases: ['plan', 'planmode', 'planning', 'todo', 'todos', 'tasks']
  },
  {
    id: 'model',
    label: 'Model',
    description: 'Switch the underlying model',
    aliases: ['model', 'models', 'setmodel', 'switchmodel', 'llm']
  },
  {
    id: 'cost',
    label: 'Cost',
    description: 'Token spend and remaining context',
    aliases: ['cost', 'usage', 'tokens', 'spend', 'context', 'contextsize']
  },
  {
    id: 'help',
    label: 'Help',
    description: 'List what this agent can do',
    aliases: ['help', 'commands']
  },
  {
    id: 'memory',
    label: 'Memory',
    description: 'Read or edit the agent’s saved notes',
    aliases: ['memory', 'memories', 'remember', 'notes']
  },
  {
    id: 'mcp',
    label: 'MCP',
    description: 'Manage connected MCP servers',
    aliases: ['mcp', 'mcpservers', 'servers']
  },
  {
    id: 'subagents',
    label: 'Subagents',
    description: 'Manage subagents or personas',
    aliases: ['subagents', 'agents', 'personas']
  },
  {
    id: 'web',
    label: 'Web',
    description: 'Search the web',
    aliases: ['web', 'websearch', 'browse']
  },
  {
    id: 'undo',
    label: 'Undo',
    description: 'Roll back the agent’s last edits',
    aliases: ['undo', 'revert', 'rewind', 'restore']
  },
  {
    id: 'login',
    label: 'Login',
    description: 'Authenticate this agent',
    aliases: ['login', 'signin', 'auth', 'authenticate']
  },
  {
    id: 'logout',
    label: 'Logout',
    description: 'Sign this agent out',
    aliases: ['logout', 'signout']
  },
  {
    id: 'config',
    label: 'Config',
    description: 'Open the agent’s own settings',
    aliases: ['config', 'configure', 'settings', 'preferences']
  },
  {
    id: 'security',
    label: 'Security',
    description: 'Security review of the current changes',
    aliases: ['security', 'securityreview', 'vulnerabilities']
  },
  {
    id: 'export',
    label: 'Export',
    description: 'Export the transcript',
    aliases: ['export', 'transcript', 'share']
  }
]

/**
 * Permission postures, canonicalised the same way. The ids are mxwl's; the
 * aliases are what agents call them in `session/new`'s `availableModes`.
 */
export const CANONICAL_MODES: CanonicalEntry[] = [
  {
    id: 'plan',
    label: 'Plan',
    description: 'Read and reason, but make no edits',
    aliases: ['plan', 'planmode', 'planning', 'readonly', 'architect', 'research', 'chat']
  },
  {
    id: 'ask',
    label: 'Ask',
    description: 'Confirm every action before it runs',
    aliases: ['ask', 'default', 'normal', 'manual', 'confirm', 'interactive', 'prompt', 'standard']
  },
  {
    id: 'auto',
    label: 'Auto-edit',
    description: 'Apply file edits without asking; still confirm risky commands',
    aliases: ['auto', 'acceptedits', 'autoedit', 'autoaccept', 'edit', 'write', 'code', 'build']
  },
  {
    id: 'full',
    label: 'Full auto',
    description: 'Run everything without confirmation',
    aliases: [
      'full',
      'fullauto',
      'bypasspermissions',
      'bypass',
      'yolo',
      'danger',
      'dangerouslyskippermissions',
      'unrestricted',
      'autonomous'
    ]
  }
]

/**
 * Commands mxwl handles itself. `reserved` ones win over an agent command of the
 * same name, because they steer the panel rather than the conversation — an
 * agent has no way to swap itself out.
 */
export const CLIENT_COMMANDS: (AgentCommand & { reserved: boolean })[] = [
  {
    name: 'agent',
    description: 'Switch to another agent, keeping this panel',
    canonical: null,
    source: 'client',
    aliases: ['swap', 'use', 'switch'],
    takesInput: true,
    reserved: true
  },
  {
    name: 'mode',
    description: 'Switch permission mode (plan / ask / auto / full)',
    canonical: null,
    source: 'client',
    aliases: ['permissions', 'posture'],
    takesInput: true,
    reserved: true
  },
  {
    name: 'cancel',
    description: 'Interrupt the current turn',
    canonical: null,
    source: 'client',
    aliases: ['stop', 'abort', 'interrupt'],
    takesInput: false,
    reserved: true
  },
  {
    name: 'restart',
    description: 'Restart the agent process and start a fresh session',
    canonical: null,
    source: 'client',
    aliases: ['reconnect', 'respawn'],
    takesInput: false,
    reserved: true
  }
]

/** Case- and punctuation-insensitive, so `accept-edits` matches `acceptEdits`. */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function lookup(table: CanonicalEntry[], name: string): string | null {
  const key = normalizeName(name)
  if (!key) return null
  for (const entry of table) {
    if (entry.aliases.includes(key)) return entry.id
  }
  return null
}

export function canonicalCommandFor(name: string): string | null {
  return lookup(CANONICAL_COMMANDS, name)
}

export function canonicalModeFor(name: string): string | null {
  return lookup(CANONICAL_MODES, name)
}

export function canonicalCommand(id: string): CanonicalEntry | undefined {
  return CANONICAL_COMMANDS.find((c) => c.id === id)
}

export function canonicalMode(id: string): CanonicalEntry | undefined {
  return CANONICAL_MODES.find((m) => m.id === id)
}

/** The subset of ACP's `AvailableCommand` the palette needs. */
export type RawAgentCommand = {
  name: string
  description?: string
  input?: unknown
}

/**
 * Merges what the agent published with mxwl's own commands. Each agent command
 * carries its canonical id plus that canonical's other synonyms as aliases, so
 * `/compress` is reachable by typing `/compact` on an agent that only has the
 * former — and vice versa on the next agent.
 */
export function buildCommandPalette(agentCommands: RawAgentCommand[]): AgentCommand[] {
  const out: AgentCommand[] = []
  const taken = new Set<string>()

  for (const raw of agentCommands) {
    const name = raw.name.replace(/^\//, '').trim()
    if (!name || taken.has(normalizeName(name))) continue
    taken.add(normalizeName(name))
    const canonical = canonicalCommandFor(name)
    const entry = canonical ? canonicalCommand(canonical) : undefined
    const self = normalizeName(name)
    out.push({
      name,
      description: raw.description?.trim() || entry?.description || '',
      canonical,
      source: 'agent',
      aliases: (entry?.aliases ?? []).filter((a) => a !== self),
      takesInput: raw.input != null
    })
  }

  for (const client of CLIENT_COMMANDS) {
    // A non-reserved client command defers to the agent's own version.
    if (!client.reserved && taken.has(normalizeName(client.name))) continue
    const { reserved: _reserved, ...cmd } = client
    // A reserved name shadows the agent's, so drop the loser rather than show two.
    const dupe = out.findIndex((c) => normalizeName(c.name) === normalizeName(cmd.name))
    if (dupe >= 0) out.splice(dupe, 1)
    out.push({ ...cmd })
  }

  return out.sort((a, b) => a.name.localeCompare(b.name))
}

type Scored = { cmd: AgentCommand; score: number }

/**
 * Autocomplete ranking. An empty query lists everything, so `/` alone opens the
 * full palette rather than nothing.
 */
export function matchCommands(query: string, palette: AgentCommand[]): AgentCommand[] {
  const q = normalizeName(query)
  if (!q) return [...palette]

  const scored: Scored[] = []
  for (const cmd of palette) {
    const name = normalizeName(cmd.name)
    const canonical = cmd.canonical ? normalizeName(cmd.canonical) : ''
    let score = -1

    if (name === q) score = 0
    else if (canonical === q) score = 1
    else if (name.startsWith(q)) score = 2
    else if (canonical.startsWith(q)) score = 3
    else if (cmd.aliases.some((a) => normalizeName(a) === q)) score = 4
    else if (cmd.aliases.some((a) => normalizeName(a).startsWith(q))) score = 5
    else if (name.includes(q)) score = 6
    else if (normalizeName(cmd.description).includes(q)) score = 7

    if (score >= 0) scored.push({ cmd, score })
  }

  return scored
    .sort((a, b) => a.score - b.score || a.cmd.name.localeCompare(b.cmd.name))
    .map((s) => s.cmd)
}

export type ResolvedSlash = {
  command: AgentCommand
  /** Everything after the command name, trimmed */
  rest: string
  /** true when the typed name differed from the command actually selected */
  translated: boolean
}

/**
 * Turns a typed `/…` line into the command to run. Returns null when nothing
 * matches — the caller then sends the line through untouched, so an agent
 * command that arrived after the palette was built still works.
 */
export function resolveSlash(input: string, palette: AgentCommand[]): ResolvedSlash | null {
  if (!input.startsWith('/')) return null
  const body = input.slice(1)
  const split = body.search(/\s/)
  const typed = split === -1 ? body : body.slice(0, split)
  const rest = split === -1 ? '' : body.slice(split).trim()
  if (!typed) return null

  const key = normalizeName(typed)
  const exact = palette.find((c) => normalizeName(c.name) === key)
  if (exact) return { command: exact, rest, translated: false }

  const byCanonical = palette.find((c) => c.canonical && normalizeName(c.canonical) === key)
  if (byCanonical) return { command: byCanonical, rest, translated: true }

  const byAlias = palette.find((c) => c.aliases.some((a) => normalizeName(a) === key))
  if (byAlias) return { command: byAlias, rest, translated: true }

  return null
}

export type RawAgentMode = {
  id: string
  name: string
  description?: string | null
}

export function annotateModes(modes: RawAgentMode[]): AgentModeInfo[] {
  return modes.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description ?? null,
    // The id is the stable handle, but agents often put the readable posture in
    // the name (`id: "1"`, `name: "Accept edits"`), so both get a vote.
    canonical: canonicalModeFor(m.id) ?? canonicalModeFor(m.name)
  }))
}

/**
 * The mode to start in when the user has asked for no confirmations: full auto
 * where the agent has it, auto-edit where that is as far as it goes. An agent
 * with neither keeps whatever it opened in — auto-approval then rests on
 * answering its permission requests instead.
 */
export function permissiveMode(modes: AgentModeInfo[]): AgentModeInfo | null {
  return (
    modes.find((m) => m.canonical === 'full') ?? modes.find((m) => m.canonical === 'auto') ?? null
  )
}

/** Finds the mode matching a canonical posture, for `/mode auto` on any agent. */
export function findMode(query: string, modes: AgentModeInfo[]): AgentModeInfo | null {
  const key = normalizeName(query)
  if (!key) return null
  return (
    modes.find((m) => normalizeName(m.id) === key) ??
    modes.find((m) => normalizeName(m.name) === key) ??
    modes.find((m) => m.canonical === canonicalModeFor(query)) ??
    modes.find((m) => m.canonical === key) ??
    null
  )
}
