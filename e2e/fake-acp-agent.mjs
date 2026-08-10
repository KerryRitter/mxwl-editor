#!/usr/bin/env node
/**
 * A minimal ACP agent for the e2e suite: newline-delimited JSON-RPC on stdio,
 * hand-rolled so the test exercises mxwl's client rather than the SDK talking to
 * itself. Behaviour is keyed off the prompt text — see `e2e/agent-panel.spec.ts`.
 */
import { createInterface } from 'node:readline'

const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`)
const reply = (id, result) => send({ jsonrpc: '2.0', id, result })
const update = (sessionId, update) =>
  send({ jsonrpc: '2.0', method: 'session/update', params: { sessionId, update } })

let nextId = 1000
const pendingClientRequests = new Map()
/** Resolves the in-flight `session/prompt` when a cancel notification arrives. */
let cancelTurn = null

const COMMANDS = [
  { name: 'compress', description: 'shrink the conversation' },
  { name: 'frobnicate', description: 'do the thing' }
]

const MODES = {
  currentModeId: 'default',
  availableModes: [
    { id: 'default', name: 'Always ask' },
    { id: 'acceptEdits', name: 'Accept edits' },
    { id: 'plan', name: 'Plan mode' }
  ]
}

function askClient(method, params) {
  const id = nextId++
  send({ jsonrpc: '2.0', id, method, params })
  return new Promise((resolve) => pendingClientRequests.set(id, resolve))
}

async function handlePrompt(params) {
  const sessionId = params.sessionId
  const text = params.prompt.map((p) => (p.type === 'text' ? p.text : '')).join('')

  if (text.startsWith('/compress')) {
    update(sessionId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'compressed' } })
    return { stopReason: 'end_turn' }
  }

  if (text.startsWith('permission')) {
    update(sessionId, {
      sessionUpdate: 'tool_call',
      toolCallId: 'tool-1',
      title: 'Write hello.txt',
      kind: 'edit',
      status: 'pending',
      content: [{ type: 'diff', path: '/tmp/hello.txt', oldText: null, newText: 'hello\n' }]
    })
    const answer = await askClient('session/request_permission', {
      sessionId,
      toolCall: {
        toolCallId: 'tool-1',
        title: 'Write hello.txt',
        kind: 'edit',
        content: [{ type: 'diff', path: '/tmp/hello.txt', oldText: null, newText: 'hello\n' }]
      },
      options: [
        { optionId: 'yes', name: 'Allow', kind: 'allow_once' },
        { optionId: 'no', name: 'Deny', kind: 'reject_once' }
      ]
    })
    const allowed = answer?.outcome?.outcome === 'selected' && answer.outcome.optionId === 'yes'
    update(sessionId, {
      sessionUpdate: 'tool_call_update',
      toolCallId: 'tool-1',
      status: allowed ? 'completed' : 'failed'
    })
    update(sessionId, {
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: allowed ? 'wrote the file' : 'skipped the file' }
    })
    return { stopReason: 'end_turn' }
  }

  if (text.startsWith('slow')) {
    update(sessionId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'thinking' } })
    return new Promise((resolve) => {
      cancelTurn = () => resolve({ stopReason: 'cancelled' })
    })
  }

  if (text.startsWith('plan')) {
    update(sessionId, {
      sessionUpdate: 'plan',
      entries: [
        { content: 'first step', priority: 'high', status: 'completed' },
        { content: 'second step', priority: 'medium', status: 'in_progress' }
      ]
    })
    return { stopReason: 'end_turn' }
  }

  // Default: stream the echo one word at a time, so chunk merging is exercised.
  update(sessionId, { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'pondering' } })
  for (const word of `echo: ${text}`.split(' ')) {
    update(sessionId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: `${word} ` } })
  }
  update(sessionId, { sessionUpdate: 'usage_update', used: 120, size: 1000 })
  return { stopReason: 'end_turn' }
}

async function handle(msg) {
  if (msg.id != null && msg.method == null) {
    const resolve = pendingClientRequests.get(msg.id)
    if (resolve) {
      pendingClientRequests.delete(msg.id)
      resolve(msg.result)
    }
    return
  }

  switch (msg.method) {
    case 'initialize':
      reply(msg.id, {
        protocolVersion: 1,
        agentInfo: { name: 'fake-acp', version: '9.9.9' },
        authMethods: []
      })
      return
    case 'session/new':
      reply(msg.id, { sessionId: 'sess-1', modes: MODES })
      update('sess-1', { sessionUpdate: 'available_commands_update', availableCommands: COMMANDS })
      return
    case 'session/set_mode':
      reply(msg.id, {})
      update(msg.params.sessionId, {
        sessionUpdate: 'current_mode_update',
        currentModeId: msg.params.modeId
      })
      return
    case 'session/prompt':
      reply(msg.id, await handlePrompt(msg.params))
      return
    case 'session/cancel': {
      const end = cancelTurn
      cancelTurn = null
      end?.()
      return
    }
    default:
      if (msg.id != null) reply(msg.id, {})
  }
}

createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return
  void handle(JSON.parse(line))
})
