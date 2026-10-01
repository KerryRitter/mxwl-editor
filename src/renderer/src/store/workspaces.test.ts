import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceState } from '../../../shared/types'
import { useWorkspacesStore } from './workspaces'

const a = {
  id: 'a',
  hostId: 'local',
  projectId: 'app',
  status: 'connected'
} as WorkspaceState
const b = {
  id: 'b',
  hostId: 'remote',
  projectId: 'other',
  status: 'connected'
} as WorkspaceState
const close = vi.fn()
const list = vi.fn()
const open = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  close.mockResolvedValue(undefined)
  vi.stubGlobal('window', {
    api: {
      agent: { close: vi.fn().mockResolvedValue(undefined) },
      workspace: { close, list, open }
    }
  })
  useWorkspacesStore.setState({
    workspaces: [a, b],
    activeId: a.id,
    closedIds: new Set()
  })
})

describe('workspace close lifecycle', () => {
  it('ignores late status events after closing a workspace, while still adopting new AI workspaces', async () => {
    await useWorkspacesStore.getState().close(a.id)
    useWorkspacesStore
      .getState()
      .applyEvent(a.id, 'disconnected', { ...a, status: 'disconnected' })
    expect(useWorkspacesStore.getState().workspaces).toEqual([b])
    expect(useWorkspacesStore.getState().activeId).toBeNull()
    const added = { ...a, id: 'new-ai-workspace' }
    useWorkspacesStore.getState().applyEvent(added.id, 'connected', added)
    expect(useWorkspacesStore.getState().workspaces).toEqual([b, added])
  })
  it('ignores broadcasts while close is pending and a list requested before close completes', async () => {
    let complete!: () => void
    close.mockReturnValue(
      new Promise<void>((resolve) => {
        complete = resolve
      })
    )
    const closing = useWorkspacesStore.getState().close(a.id)
    useWorkspacesStore
      .getState()
      .applyEvent(a.id, 'disconnected', { ...a, status: 'disconnected' })
    expect(useWorkspacesStore.getState().workspaces[0].status).toBe('connected')
    complete()
    await closing
    list.mockResolvedValue([a, b])
    await useWorkspacesStore.getState().load()
    expect(useWorkspacesStore.getState().workspaces).toEqual([b])
  })
  it('allows an explicit open or adopt to reactivate a previously closed ID', async () => {
    await useWorkspacesStore.getState().close(a.id)
    open.mockResolvedValue(a)
    await useWorkspacesStore.getState().open('local', '/repo')
    expect(useWorkspacesStore.getState().closedIds.has(a.id)).toBe(false)
    useWorkspacesStore
      .getState()
      .applyEvent(a.id, 'disconnected', { ...a, status: 'disconnected' })
    expect(
      useWorkspacesStore.getState().workspaces.find((w) => w.id === a.id)
        ?.status
    ).toBe('disconnected')
    await useWorkspacesStore.getState().close(a.id)
    useWorkspacesStore.getState().adopt(a)
    expect(useWorkspacesStore.getState().closedIds.has(a.id)).toBe(false)
  })
  it('rolls back the close guard if the backend rejects the close', async () => {
    close.mockRejectedValue(new Error('close failed'))
    await expect(useWorkspacesStore.getState().close(a.id)).rejects.toThrow(
      'close failed'
    )
    expect(useWorkspacesStore.getState().closedIds.has(a.id)).toBe(false)
    useWorkspacesStore
      .getState()
      .applyEvent(a.id, 'error', { ...a, status: 'error' })
    expect(useWorkspacesStore.getState().workspaces[0].status).toBe('error')
  })
})
