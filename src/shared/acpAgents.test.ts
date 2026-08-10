import { describe, it, expect } from 'vitest'
import {
  ACP_AGENTS,
  ACP_AGENT_ORDER,
  DEFAULT_AGENT_SETTINGS,
  agentLaunch,
  agentShellCommand,
  splitArgs
} from './acpAgents'
import type { AgentSettings } from './types'

const base = (patch: Partial<AgentSettings> = {}): AgentSettings => ({
  ...DEFAULT_AGENT_SETTINGS,
  ...patch
})

describe('registry', () => {
  it('orders every agent exactly once', () => {
    expect([...ACP_AGENT_ORDER].sort()).toEqual(Object.keys(ACP_AGENTS).sort())
  })

  it('gives every agent but custom a launch command', () => {
    for (const id of ACP_AGENT_ORDER) {
      if (id === 'custom') expect(ACP_AGENTS[id].command).toBe('')
      else expect(ACP_AGENTS[id].command).not.toBe('')
    }
  })

  it('marks npx-launched agents as such', () => {
    for (const def of Object.values(ACP_AGENTS)) {
      expect(def.viaNpx).toBe(def.command === 'npx')
    }
  })
})

describe('splitArgs', () => {
  it('splits on whitespace', () => {
    expect(splitArgs('--acp --verbose')).toEqual(['--acp', '--verbose'])
  })

  it('keeps quoted runs together', () => {
    expect(splitArgs(`--flag "two words" '--other one'`)).toEqual([
      '--flag',
      'two words',
      '--other one'
    ])
  })

  it('returns nothing for an empty override', () => {
    expect(splitArgs('')).toEqual([])
  })
})

describe('agentLaunch', () => {
  it('uses the registry entry when nothing is overridden', () => {
    expect(agentLaunch('claude', base())).toEqual({
      command: 'npx',
      args: ['-y', '@agentclientprotocol/claude-agent-acp']
    })
  })

  it('appends extra args to the registry ones', () => {
    const launch = agentLaunch('gemini', base({ argsOverrides: { gemini: '--yolo' } }))
    expect(launch.command).toBe('npx')
    expect(launch.args).toEqual(['-y', '@google/gemini-cli', '--acp', '--yolo'])
  })

  it('drops the registry args once the binary is overridden', () => {
    const launch = agentLaunch(
      'claude',
      base({ commandOverrides: { claude: '/opt/wrapper' }, argsOverrides: { claude: 'acp' } })
    )
    expect(launch).toEqual({ command: '/opt/wrapper', args: ['acp'] })
  })

  it('falls back to the registry when an override is blank', () => {
    expect(agentLaunch('goose', base({ commandOverrides: { goose: '   ' } }))).toEqual({
      command: 'goose',
      args: ['acp']
    })
  })

  it('leaves custom empty until configured', () => {
    expect(agentLaunch('custom', base()).command).toBe('')
  })
})

describe('agentShellCommand', () => {
  it('joins the launch line', () => {
    expect(agentShellCommand('cursor', base())).toBe('cursor-agent acp')
  })

  it('quotes arguments a shell would split', () => {
    const line = agentShellCommand('custom', {
      ...base(),
      commandOverrides: { custom: '/opt/my agent' },
      argsOverrides: { custom: '"--flag with space"' }
    })
    expect(line).toBe(`'/opt/my agent' '--flag with space'`)
  })

  it('escapes embedded single quotes', () => {
    const line = agentShellCommand('custom', {
      ...base(),
      commandOverrides: { custom: "/opt/o'brien" }
    })
    expect(line).toBe(`'/opt/o'\\''brien'`)
  })
})
