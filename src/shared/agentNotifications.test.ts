import { describe, expect, it } from 'vitest'
import type { AgentSessionState } from './types'
import { classifyAgentTransition } from './agentNotifications'

const state = (patch: Partial<AgentSessionState> = {}): AgentSessionState => ({
  wsId: 'workspace-1',
  agentId: 'custom',
  agentLabel: 'Reviewer',
  status: 'ready',
  turn: 'idle',
  error: null,
  agentInfo: null,
  sessionId: 'session-1',
  cwd: '/work/project',
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

describe('agent notifications', () => {
  it('announces a completed turn once it becomes idle', () => {
    const event = classifyAgentTransition(
      state({ turn: 'running' }),
      state({
        messages: [
          { id: 'm1', role: 'agent', ts: 1, blocks: [{ kind: 'text', text: 'Tests are green.' }] }
        ]
      })
    )
    expect(event).toEqual({
      kind: 'done',
      title: 'Reviewer finished',
      detail: 'Tests are green.'
    })
  })

  it('announces a new permission request without waiting for the turn to finish', () => {
    const event = classifyAgentTransition(
      state({ turn: 'running' }),
      state({
        turn: 'running',
        permission: {
          requestId: 'request-1',
          toolCallId: 'tool-1',
          title: 'Run database migration',
          toolKind: 'execute',
          content: [],
          options: []
        }
      })
    )
    expect(event?.kind).toBe('attention')
    expect(event?.detail).toBe('Run database migration')
  })

  it('reports failures and ignores streamed snapshots with no semantic transition', () => {
    expect(
      classifyAgentTransition(
        state({ turn: 'running', error: 'request failed' }),
        state({ error: 'request failed' })
      )
    ).toMatchObject({ kind: 'error', title: 'Reviewer stopped with an error' })
    expect(classifyAgentTransition(state({ turn: 'running' }), state({ turn: 'running' }))).toBeNull()
  })

  it('does not announce a user-requested cancellation as successful completion', () => {
    expect(classifyAgentTransition(state({ turn: 'cancelling' }), state())).toBeNull()
  })
})
