import type { AgentSessionState } from './types'

export type AgentNotificationKind = 'done' | 'attention' | 'error'

export type AgentNotificationEvent = {
  kind: AgentNotificationKind
  title: string
  detail: string
}

/** Converts noisy streamed ACP snapshots into one meaningful attention event. */
export function classifyAgentTransition(
  previous: AgentSessionState | null | undefined,
  next: AgentSessionState
): AgentNotificationEvent | null {
  if (!previous) return null

  if (next.permission && next.permission.requestId !== previous.permission?.requestId) {
    return {
      kind: 'attention',
      title: `${next.agentLabel} needs approval`,
      detail: next.permission.title || 'Permission required'
    }
  }

  if (next.status === 'auth-required' && previous.status !== 'auth-required') {
    return {
      kind: 'attention',
      title: `${next.agentLabel} needs authentication`,
      detail: 'Open the agent to continue.'
    }
  }

  if (
    (next.status === 'error' || next.status === 'exited') &&
    next.status !== previous.status
  ) {
    return {
      kind: 'error',
      title: `${next.agentLabel} stopped`,
      detail: lastLine(next.error) || `${next.agentLabel} ${next.status}`
    }
  }

  if (previous.turn === 'running' && next.turn === 'idle') {
    if (next.error) {
      return {
        kind: 'error',
        title: `${next.agentLabel} stopped with an error`,
        detail: lastLine(next.error)
      }
    }
    return {
      kind: 'done',
      title: `${next.agentLabel} finished`,
      detail: latestAgentSummary(next) || 'The agent is waiting for your next instruction.'
    }
  }

  return null
}

function latestAgentSummary(state: AgentSessionState): string {
  const message = [...state.messages].reverse().find((item) => item.role === 'agent')
  if (!message) return ''
  const text = message.blocks
    .map((block) =>
      block.kind === 'text' || block.kind === 'thought' ? block.text : block.title
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 140 ? `${text.slice(0, 137)}…` : text
}

function lastLine(value: string | null): string {
  return value?.trim().split('\n').filter(Boolean).at(-1)?.slice(0, 180) ?? ''
}
