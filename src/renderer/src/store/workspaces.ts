import { create } from 'zustand'
import type { DirEntry, WorkspaceState } from '../../../shared/types'

let discoverSeq = 0

function unwrapError(err: Error): string {
  const agg = err as Error & { errors?: unknown[] }
  if (Array.isArray(agg.errors) && agg.errors.length > 0) {
    const parts = agg.errors.map((e) => (e instanceof Error ? e.message : String(e)))
    return parts.join('; ') || err.message
  }
  return err.message
}

type WorkspacesState = {
  workspaces: WorkspaceState[]
  activeId: string | null
  discovering: boolean
  discovered: DirEntry[]
  discoverError: string | null
  newModalOpen: boolean
  newModalHostId: string | null

  load: () => Promise<void>
  setActive: (id: string | null) => void
  setNewModalOpen: (open: boolean, hostId?: string | null) => void
  discover: (hostId: string) => Promise<void>
  open: (hostId: string, remotePath: string) => Promise<void>
  openMany: (hostId: string, remotePaths: string[]) => Promise<void>
  close: (id: string) => Promise<void>
  applyEvent: (
    id: string,
    status: WorkspaceState['status'],
    state?: WorkspaceState
  ) => void
}

export const useWorkspacesStore = create<WorkspacesState>((set) => ({
  workspaces: [],
  activeId: null,
  discovering: false,
  discovered: [],
  discoverError: null,
  newModalOpen: false,
  newModalHostId: null,

  load: async () => {
    const workspaces = await window.api.workspace.list()
    set({ workspaces, activeId: workspaces[0]?.id ?? null })
  },

  setActive: (id) => set({ activeId: id }),

  setNewModalOpen: (open, hostId) =>
    set({
      newModalOpen: open,
      newModalHostId: open ? (hostId ?? null) : null
    }),

  discover: async (hostId) => {
    const reqId = ++discoverSeq
    set({ discovering: true, discoverError: null, discovered: [] })
    try {
      const discovered = await window.api.workspace.discover(hostId)
      if (reqId !== discoverSeq) return
      set({ discovered, discoverError: null })
    } catch (err) {
      if (reqId !== discoverSeq) return
      const msg =
        err instanceof Error
          ? unwrapError(err)
          : String(err)
      set({ discoverError: msg, discovered: [] })
    } finally {
      if (reqId === discoverSeq) set({ discovering: false })
    }
  },

  open: async (hostId, remotePath) => {
    const state = await window.api.workspace.open(hostId, remotePath)
    set((s) => ({
      workspaces: s.workspaces.some((w) => w.id === state.id)
        ? s.workspaces.map((w) => (w.id === state.id ? state : w))
        : [...s.workspaces, state],
      activeId: state.id
    }))
  },

  openMany: async (hostId, remotePaths) => {
    if (remotePaths.length === 0) return
    let lastId: string | null = null
    for (const remotePath of remotePaths) {
      const existing = useWorkspacesStore.getState().workspaces.find(
        (w) =>
          w.hostId === hostId &&
          (w.remotePath === remotePath ||
            w.remotePath.endsWith(`/${remotePath.split('/').pop()}`) ||
            w.remotePath.endsWith(`\\${remotePath.split(/[/\\]/).pop()}`))
      )
      if (existing) {
        lastId = existing.id
        continue
      }
      const state = await window.api.workspace.open(hostId, remotePath)
      lastId = state.id
      set((s) => ({
        workspaces: s.workspaces.some((w) => w.id === state.id)
          ? s.workspaces.map((w) => (w.id === state.id ? state : w))
          : [...s.workspaces, state],
        activeId: state.id
      }))
    }
    if (lastId) set({ activeId: lastId })
  },

  close: async (id) => {
    await window.api.workspace.close(id)
    set((s) => {
      const workspaces = s.workspaces.filter((w) => w.id !== id)
      const activeId = s.activeId === id ? (workspaces[0]?.id ?? null) : s.activeId
      return { workspaces, activeId }
    })
  },

  applyEvent: (id, status, state) => {
    set((s) => ({
      workspaces: s.workspaces.map((w) => {
        if (w.id !== id) return w
        if (state) return state
        return { ...w, status }
      })
    }))
  }
}))
