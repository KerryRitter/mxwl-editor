import type { AiCliId, AiSettings } from './types'

export type AiCliDef = {
  id: AiCliId
  label: string
  /** Binary name assumed to be on the host PATH */
  command: string
  /** Flags that put the CLI into one-shot "print" mode (used by the planner) */
  headlessFlags: string
  hint: string
}

export const AI_CLIS: Record<AiCliId, AiCliDef> = {
  claude: {
    id: 'claude',
    label: 'Claude Code',
    command: 'claude',
    headlessFlags: '-p',
    hint: 'anthropics/claude-code'
  },
  codex: {
    id: 'codex',
    label: 'Codex',
    command: 'codex',
    headlessFlags: 'exec',
    hint: 'openai/codex'
  },
  cursor: {
    id: 'cursor',
    label: 'Cursor',
    command: 'cursor-agent',
    headlessFlags: '-p',
    hint: 'cursor-agent CLI'
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    command: 'gemini',
    headlessFlags: '-p',
    hint: 'google-gemini/gemini-cli'
  },
  kimi: {
    id: 'kimi',
    label: 'Kimi',
    command: 'kimi',
    headlessFlags: '--print',
    hint: 'MoonshotAI/kimi-cli'
  },
  copilot: {
    id: 'copilot',
    label: 'GitHub Copilot',
    command: 'copilot',
    headlessFlags: '-p',
    hint: 'github/copilot-cli'
  },
  qwen: {
    id: 'qwen',
    label: 'Qwen Code',
    command: 'qwen',
    headlessFlags: '-p',
    hint: 'QwenLM/qwen-code'
  },
  opencode: {
    id: 'opencode',
    label: 'OpenCode',
    command: 'opencode',
    headlessFlags: 'run',
    hint: 'sst/opencode'
  },
  goose: {
    id: 'goose',
    label: 'Goose',
    command: 'goose',
    headlessFlags: 'run -t',
    hint: 'block/goose'
  }
}

export const AI_CLI_ORDER: AiCliId[] = [
  'claude',
  'codex',
  'cursor',
  'gemini',
  'kimi',
  'copilot',
  'qwen',
  'opencode',
  'goose'
]

export const DEFAULT_AI_SETTINGS: AiSettings = {
  defaultCli: 'claude',
  defaultHostId: null,
  commandOverrides: {},
  argsOverrides: {},
  workspaceFolderTemplate: '${key}',
  baseRepoFolder: '',
  initBranchCommand: '',
  initTimeoutSec: 600,
  refinePrompts: false
}

export function cliCommand(cli: AiCliId, settings: AiSettings): string {
  return (settings.commandOverrides?.[cli] || '').trim() || AI_CLIS[cli].command
}

export function cliArgs(cli: AiCliId, settings: AiSettings): string {
  return (settings.argsOverrides?.[cli] || '').trim()
}

/**
 * Interactive launch line. The prompt lives in a file on the host so a long
 * prompt can't hit the PTY line-length limit; `"$(cat …)"` is not re-expanded
 * by the shell, so `$agent-foo` style text survives verbatim.
 */
export function buildLaunchCommand(
  cli: AiCliId,
  settings: AiSettings,
  promptFile: string
): string {
  const parts = [cliCommand(cli, settings), cliArgs(cli, settings), `"$(cat ${promptFile})"`]
  return parts.filter(Boolean).join(' ')
}

/**
 * One-shot line: reads the prompt from a file, prints to stdout, exits when the
 * turn is done. Used by the planner and by a blocking setup phase. It carries the
 * per-CLI args too — headless can't answer a permission prompt, so whatever
 * grants it permission has to be on this line.
 */
export function buildHeadlessCommand(
  cli: AiCliId,
  settings: AiSettings,
  promptFile: string
): string {
  const parts = [
    cliCommand(cli, settings),
    AI_CLIS[cli].headlessFlags,
    cliArgs(cli, settings),
    `"$(cat ${promptFile})"`
  ]
  return parts.filter(Boolean).join(' ')
}
