import { create } from 'zustand'
import type {
  AgentId,
  AgentSessionState,
  AgentTranscript,
  AgentTranscriptMeta
} from '../../../shared/types'
import { findMode, resolveSlash } from '../../../shared/agentCommands'

export type AgentCatalogEntry = {
  id: AgentId
  label: string
  hint: string
  command: string
  viaNpx: boolean
}

/** What `send` did with the line, so the composer can say when it rewrote one. */
export type SendResult =
  | { kind: 'prompt' }
  | { kind: 'client'; note: string }
  | { kind: 'error'; note: string }
  | { kind: 'translated'; note: string }

/** A one-line status under the transcript: a rewrite, a client command, a failure. */
export type AgentNote = { text: string; tone: 'info' | 'error' }

type AgentStore = {
  sessions: Record<string, AgentSessionState>
  catalog: AgentCatalogEntry[]
  busy: Record<string, boolean>
  notes: Record<string, AgentNote | null>
  /** Workspaces already auto-started, so a dead agent isn't respawned on every render */
  attempted: Record<string, boolean>
  /** Saved conversations for the workspace's folder, newest first */
  history: Record<string, AgentTranscriptMeta[]>
  /** The archived conversation on screen, if the user opened one */
  viewing: Record<string, AgentTranscript | null>

  init: () => () => void
  loadCatalog: () => Promise<void>
  open: (wsId: string, agentId?: AgentId) => Promise<void>
  ensureOpen: (wsId: string) => Promise<void>
  close: (wsId: string) => Promise<void>
  restart: (wsId: string) => Promise<void>
  send: (wsId: string, text: string) => Promise<SendResult>
  cancel: (wsId: string) => Promise<void>
  clear: (wsId: string) => Promise<void>
  setMode: (wsId: string, modeId: string) => Promise<void>
  respond: (wsId: string, requestId: string, optionId: string | null) => Promise<void>
  authenticate: (wsId: string, methodId: string) => Promise<void>
  setNote: (wsId: string, note: AgentNote | null) => void
  loadHistory: (wsId: string, cwd: string) => Promise<void>
  viewTranscript: (wsId: string, id: string) => Promise<void>
  closeTranscript: (wsId: string) => void
  deleteTranscript: (wsId: string, id: string, cwd: string) => Promise<void>
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  sessions: {},
  catalog: [],
  busy: {},
  notes: {},
  attempted: {},
  history: {},
  viewing: {},

  init: () => {
    const offEvent = window.api.on('agent:event', (payload) => {
      const state = payload as AgentSessionState
      set((s) => ({ sessions: { ...s.sessions, [state.wsId]: state } }))
    })
    const offClosed = window.api.on('agent:closed', (payload) => {
      const { wsId } = payload as { wsId: string }
      set((s) => {
        const sessions = { ...s.sessions }
        delete sessions[wsId]
        return { sessions }
      })
    })
    void get().loadCatalog()
    void window.api.agent.list().then((list) => {
      set((s) => ({
        sessions: { ...s.sessions, ...Object.fromEntries(list.map((x) => [x.wsId, x])) }
      }))
    })
    return () => {
      offEvent()
      offClosed()
    }
  },

  loadCatalog: async () => {
    set({ catalog: await window.api.agent.catalog() })
  },

  open: async (wsId, agentId) => {
    set((s) => ({ busy: { ...s.busy, [wsId]: true }, notes: { ...s.notes, [wsId]: null } }))
    try {
      const state = await window.api.agent.open(wsId, agentId)
      set((s) => ({ sessions: { ...s.sessions, [wsId]: state } }))
    } catch (err) {
      get().setNote(wsId, { text: errText(err), tone: 'error' })
    } finally {
      set((s) => ({ busy: { ...s.busy, [wsId]: false } }))
    }
  },

  /**
   * Opening the tab is the pick: the default agent from Settings starts itself.
   * Tried once per workspace, so an agent that dies — or one the user closed —
   * leaves the picker up instead of being respawned behind their back.
   */
  ensureOpen: async (wsId) => {
    if (get().sessions[wsId] || get().attempted[wsId] || get().busy[wsId]) return
    set((s) => ({ attempted: { ...s.attempted, [wsId]: true } }))
    await get().open(wsId)
  },

  close: async (wsId) => {
    await window.api.agent.close(wsId)
    set((s) => {
      const sessions = { ...s.sessions }
      delete sessions[wsId]
      return { sessions }
    })
  },

  restart: async (wsId) => {
    set((s) => ({ busy: { ...s.busy, [wsId]: true } }))
    try {
      const state = await window.api.agent.restart(wsId)
      set((s) => ({ sessions: { ...s.sessions, [wsId]: state } }))
    } catch (err) {
      get().setNote(wsId, { text: errText(err), tone: 'error' })
    } finally {
      set((s) => ({ busy: { ...s.busy, [wsId]: false } }))
    }
  },

  /**
   * The one place a typed line is interpreted. Client commands never reach the
   * agent; agent commands are rewritten to whatever that agent actually calls
   * them, so the same `/compact` works everywhere; anything else goes verbatim.
   */
  send: async (wsId, raw) => {
    const text = raw.trim()
    if (!text) return { kind: 'error', note: 'nothing to send' }
    const session = get().sessions[wsId]
    if (!session) return { kind: 'error', note: 'no agent running' }

    const hit = resolveSlash(text, session.commands)

    if (hit && hit.command.source === 'client') {
      try {
        return await runClientCommand(wsId, session, hit.command.name, hit.rest)
      } catch (err) {
        return { kind: 'error', note: errText(err) }
      }
    }

    const line = hit ? `/${hit.command.name}${hit.rest ? ` ${hit.rest}` : ''}` : text
    try {
      await window.api.agent.prompt(wsId, line)
    } catch (err) {
      return { kind: 'error', note: errText(err) }
    }
    if (hit?.translated) {
      return { kind: 'translated', note: `sent as /${hit.command.name}` }
    }
    return { kind: 'prompt' }
  },

  cancel: async (wsId) => {
    await window.api.agent.cancel(wsId)
  },

  clear: async (wsId) => {
    await window.api.agent.clear(wsId)
  },

  setMode: async (wsId, modeId) => {
    try {
      await window.api.agent.setMode(wsId, modeId)
    } catch (err) {
      get().setNote(wsId, { text: errText(err), tone: 'error' })
    }
  },

  respond: async (wsId, requestId, optionId) => {
    await window.api.agent.respond(wsId, requestId, optionId)
  },

  authenticate: async (wsId, methodId) => {
    set((s) => ({ busy: { ...s.busy, [wsId]: true }, notes: { ...s.notes, [wsId]: null } }))
    try {
      await window.api.agent.authenticate(wsId, methodId)
    } catch (err) {
      get().setNote(wsId, { text: errText(err), tone: 'error' })
    } finally {
      set((s) => ({ busy: { ...s.busy, [wsId]: false } }))
    }
  },

  setNote: (wsId, note) => set((s) => ({ notes: { ...s.notes, [wsId]: note } })),

  loadHistory: async (wsId, cwd) => {
    const list = await window.api.agent.history(cwd)
    set((s) => ({ history: { ...s.history, [wsId]: list } }))
  },

  viewTranscript: async (wsId, id) => {
    const transcript = await window.api.agent.transcript(id)
    set((s) => ({ viewing: { ...s.viewing, [wsId]: transcript } }))
  },

  closeTranscript: (wsId) => set((s) => ({ viewing: { ...s.viewing, [wsId]: null } })),

  deleteTranscript: async (wsId, id, cwd) => {
    await window.api.agent.deleteTranscript(id)
    if (get().viewing[wsId]?.id === id) get().closeTranscript(wsId)
    await get().loadHistory(wsId, cwd)
  }
}))

async function runClientCommand(
  wsId: string,
  session: AgentSessionState,
  name: string,
  rest: string
): Promise<SendResult> {
  const store = useAgentStore.getState()
  switch (name) {
    case 'cancel':
      await store.cancel(wsId)
      return { kind: 'client', note: 'cancelling' }

    case 'restart':
      await store.restart(wsId)
      return { kind: 'client', note: 'restarting agent' }

    case 'agent': {
      const wanted = rest.trim().toLowerCase()
      if (!wanted) {
        return { kind: 'client', note: store.catalog.map((c) => c.id).join(', ') }
      }
      const match =
        store.catalog.find((c) => c.id === wanted) ??
        store.catalog.find((c) => c.label.toLowerCase() === wanted) ??
        store.catalog.find((c) => c.id.startsWith(wanted))
      if (!match) return { kind: 'error', note: `no agent named "${rest.trim()}"` }
      await store.open(wsId, match.id)
      return { kind: 'client', note: `switched to ${match.label}` }
    }

    case 'mode': {
      const available = session.modes.available
      if (!rest.trim()) {
        return available.length
          ? { kind: 'client', note: available.map((m) => m.name).join(', ') }
          : { kind: 'error', note: `${session.agentLabel} has no switchable modes` }
      }
      const mode = findMode(rest.trim(), available)
      if (!mode) return { kind: 'error', note: `no mode matching "${rest.trim()}"` }
      await store.setMode(wsId, mode.id)
      return { kind: 'client', note: `mode → ${mode.name}` }
    }

    default:
      return { kind: 'error', note: `unhandled command /${name}` }
  }
}
