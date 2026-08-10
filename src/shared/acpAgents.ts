import type { AgentId, AgentSettings } from './types'

export type AcpAgentDef = {
  id: AgentId
  label: string
  /** Launcher binary — `npx` for agents distributed as a package */
  command: string
  /** Argv that puts the agent into ACP stdio mode */
  args: string[]
  /** Shown when the process fails to start */
  hint: string
  /**
   * npx-launched agents need no install step, so a missing binary is not an
   * error the user has to fix — it just costs a slower first run.
   */
  viaNpx: boolean
}

/**
 * Agents that speak ACP over stdio. Commands are the ones published in the ACP
 * registry (`cdn.agentclientprotocol.com/registry/v1/latest/registry.json`);
 * `custom` is the escape hatch for anything not listed.
 *
 * Notably absent: Antigravity, which ships as an IDE with no ACP-capable CLI.
 * Gemini is the closest stand-in for that model family.
 */
export const ACP_AGENTS: Record<AgentId, AcpAgentDef> = {
  claude: {
    id: 'claude',
    label: 'Claude Code',
    command: 'npx',
    args: ['-y', '@agentclientprotocol/claude-agent-acp'],
    hint: 'wraps the `claude` CLI — run `claude` once to log in',
    viaNpx: true
  },
  codex: {
    id: 'codex',
    label: 'Codex',
    command: 'npx',
    args: ['-y', '@agentclientprotocol/codex-acp'],
    hint: 'wraps the `codex` CLI — run `codex` once to log in',
    viaNpx: true
  },
  cursor: {
    id: 'cursor',
    label: 'Cursor',
    command: 'cursor-agent',
    args: ['acp'],
    hint: 'install cursor-agent, then `cursor-agent login`',
    viaNpx: false
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    command: 'npx',
    args: ['-y', '@google/gemini-cli', '--acp'],
    hint: 'run `gemini` once to log in',
    viaNpx: true
  },
  kimi: {
    id: 'kimi',
    label: 'Kimi',
    command: 'kimi',
    args: ['acp'],
    hint: 'install kimi-cli from MoonshotAI/kimi-cli releases',
    viaNpx: false
  },
  copilot: {
    id: 'copilot',
    label: 'GitHub Copilot',
    command: 'npx',
    args: ['-y', '@github/copilot', '--acp'],
    hint: 'run `copilot` once to log in',
    viaNpx: true
  },
  qwen: {
    id: 'qwen',
    label: 'Qwen Code',
    command: 'npx',
    args: ['-y', '@qwen-code/qwen-code', '--acp'],
    hint: 'run `qwen` once to log in',
    viaNpx: true
  },
  opencode: {
    id: 'opencode',
    label: 'OpenCode',
    command: 'opencode',
    args: ['acp'],
    hint: 'install opencode from anomalyco/opencode releases',
    viaNpx: false
  },
  goose: {
    id: 'goose',
    label: 'Goose',
    command: 'goose',
    args: ['acp'],
    hint: 'install goose from block/goose releases',
    viaNpx: false
  },
  custom: {
    id: 'custom',
    label: 'Custom',
    command: '',
    args: [],
    hint: 'set the command in Settings → Agent',
    viaNpx: false
  }
}

export const ACP_AGENT_ORDER: AgentId[] = [
  'claude',
  'codex',
  'cursor',
  'gemini',
  'kimi',
  'copilot',
  'qwen',
  'opencode',
  'goose',
  'custom'
]

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  defaultAgent: 'claude',
  commandOverrides: {},
  argsOverrides: {},
  autoApprove: true
}

/**
 * Splits a settings override into argv. Quoting is deliberately minimal — an
 * override is a launch line, not a shell script, and anything needing real
 * quoting belongs in a wrapper script on PATH.
 */
export function splitArgs(raw: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) out.push(m[1] ?? m[2] ?? m[3] ?? '')
  return out
}

export type AgentLaunch = { command: string; args: string[] }

/** Resolves the launch line for an agent, applying the user's overrides. */
export function agentLaunch(id: AgentId, settings: AgentSettings): AgentLaunch {
  const def = ACP_AGENTS[id]
  const command = (settings.commandOverrides?.[id] || '').trim() || def.command
  const extra = splitArgs((settings.argsOverrides?.[id] || '').trim())
  // An override replaces the binary, so the registry's args may not apply to it;
  // keeping them would hand `acp` to a wrapper that never asked for it.
  const base = settings.commandOverrides?.[id]?.trim() ? [] : def.args
  return { command, args: [...base, ...extra] }
}

/**
 * The launch line as a single shell string. Remote agents run through
 * `bash -lc`, where a plain argv would lose PATH entries from nvm / ~/.local/bin.
 */
export function agentShellCommand(id: AgentId, settings: AgentSettings): string {
  const { command, args } = agentLaunch(id, settings)
  return [command, ...args].map(quoteArg).filter(Boolean).join(' ')
}

function quoteArg(arg: string): string {
  if (!arg) return ''
  return /^[\w@./:=-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`
}
