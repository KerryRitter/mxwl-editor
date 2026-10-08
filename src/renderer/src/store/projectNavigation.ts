import { create } from 'zustand'

// The explorer and overview share the selected project and host.
export const useProjectNavigation = create<{
  projectId: string | null
  hostId: string | null
  recentWorkspaces: Record<string, string>
  rememberWorkspace: (
    projectId: string | null,
    hostId: string,
    workspaceId: string
  ) => void
  setup: { projectId: string; locationId?: string } | null
  requestSetup: (projectId: string, locationId?: string) => void
  clearSetup: () => void
  select: (projectId: string | null, hostId?: string | null) => void
}>((set) => ({
  projectId: null,
  hostId: null,
  recentWorkspaces: {},
  rememberWorkspace: (projectId, hostId, workspaceId) =>
    set((state) => ({
      recentWorkspaces: {
        ...state.recentWorkspaces,
        [`${projectId}:${hostId}`]: workspaceId
      }
    })),
  setup: null,
  requestSetup: (projectId, locationId) =>
    set({ setup: { projectId, locationId } }),
  clearSetup: () => set({ setup: null }),
  select: (projectId, hostId) =>
    set({ projectId, hostId: projectId ? (hostId ?? null) : null })
}))
