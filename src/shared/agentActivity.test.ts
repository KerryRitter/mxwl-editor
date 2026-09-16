import { describe, expect, it } from 'vitest'
import type { AgentSessionState } from './types'
import { agentActivity } from './agentActivity'

const state = (patch: Partial<AgentSessionState> = {}): AgentSessionState => ({
  wsId: 'w1',
  agentId: 'custom',
  agentLabel: 'Agent',
  status: 'ready',
  turn: 'idle',
  error: null,
  agentInfo: null,
  sessionId: 's1',
  cwd: '/work',
  messages: [],
  plan: [],
  commands: [],
  modes: { current: null, available: [] },
  authMethods: [],
  permission: null,
  usage: null,
  startedAt: 1,
  ...patch
})

describe('agent activity', () => {
  it('prefers an active plan item while working', () => {
    expect(
      agentActivity(
        state({
          turn: 'running',
          plan: [{ content: 'Run integration tests', priority: 'high', status: 'in_progress' }]
        })
      )
    ).toEqual({ state: 'working', summary: 'Run integration tests' })
  })

  it('elevates permissions and failures above ordinary activity', () => {
    expect(
      agentActivity(
        state({
          turn: 'running',
          permission: {
            requestId: 'r',
            toolCallId: 't',
            title: 'Deploy preview',
            toolKind: 'execute',
            content: [],
            options: []
          }
        })
      )
    ).toMatchObject({ state: 'attention', summary: 'Deploy preview' })
    expect(agentActivity(state({ status: 'error', error: 'boom' }))).toEqual({
      state: 'error',
      summary: 'boom'
    })
  })
})
