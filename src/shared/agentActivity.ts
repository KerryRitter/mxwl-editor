import type { AgentActivity, AgentBlock, AgentSessionState } from './types'

export function agentActivity(state: AgentSessionState): AgentActivity {
  if (state.permission) return { state: 'attention', summary: state.permission.title }
  if (state.status === 'auth-required') {
    return { state: 'attention', summary: 'Authentication required' }
  }
  if (state.status === 'error' || state.status === 'exited') {
    return {
      state: 'error',
      summary: lastLine(state.error) || `${state.agentLabel} ${state.status}`
    }
  }
  if (state.status === 'starting' || state.status === 'idle') {
    return { state: 'starting', summary: state.status === 'starting' ? 'Starting…' : 'Not started' }
  }
  if (state.turn !== 'idle') {
    const plan = state.plan.find((entry) => entry.status === 'in_progress')
    if (plan) return { state: 'working', summary: plan.content }
    const tool = latestBlock(state, (block) =>
      block.kind === 'tool' && (block.status === 'pending' || block.status === 'in_progress')
    )
    if (tool?.kind === 'tool') return { state: 'working', summary: tool.title }
    const thought = latestBlock(state, (block) => block.kind === 'thought')
    if (thought?.kind === 'thought') return { state: 'working', summary: compact(thought.text) }
    return { state: 'working', summary: 'Working…' }
  }
  const latest = latestBlock(state, (block) => block.kind === 'text' || block.kind === 'tool')
  return {
    state: 'idle',
    summary:
      latest?.kind === 'tool'
        ? latest.title
        : latest?.kind === 'text'
          ? compact(latest.text)
          : 'Ready'
  }
}

function latestBlock(
  state: AgentSessionState,
  predicate: (block: AgentBlock) => boolean
): AgentBlock | null {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const blocks = state.messages[i].blocks
    for (let j = blocks.length - 1; j >= 0; j--) {
      if (predicate(blocks[j])) return blocks[j]
    }
  }
  return null
}

function compact(value: string): string {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > 120 ? `${text.slice(0, 117)}…` : text || 'Working…'
}

function lastLine(value: string | null): string {
  return value?.trim().split('\n').filter(Boolean).at(-1)?.slice(0, 180) ?? ''
}
