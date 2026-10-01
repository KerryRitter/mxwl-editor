import { create } from 'zustand'

// Navigation follows Projects → Hosts → workspace tabs. Machine connection
// definitions remain reusable; only hosts attached to this project appear here.
export const useProjectNavigation = create<{
  projectId: string | null
  hostId: string | null
  select: (projectId: string | null, hostId?: string | null) => void
}>((set) => ({
  projectId: null,
  hostId: null,
  select: (projectId, hostId) =>
    set({ projectId, hostId: projectId ? (hostId ?? null) : null })
}))
