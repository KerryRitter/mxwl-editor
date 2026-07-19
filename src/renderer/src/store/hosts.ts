import { create } from 'zustand'
import type { HostConfig, HostInput, TestResult } from '../../../shared/types'

type TestState = {
  [hostId: string]: { result?: TestResult; testing: boolean }
}

type HostsState = {
  hosts: HostConfig[]
  testState: TestState
  loading: boolean
  load: () => Promise<void>
  save: (input: HostInput) => Promise<void>
  remove: (id: string) => Promise<void>
  clone: (id: string) => Promise<void>
  test: (input: HostInput) => Promise<void>
  ensureLocal: (workspacesRoot?: string) => Promise<void>
}

export const useHostsStore = create<HostsState>((set, get) => ({
  hosts: [],
  testState: {},
  loading: false,
  load: async () => {
    set({ loading: true })
    const hosts = await window.api.host.list()
    set({ hosts, loading: false })
  },
  save: async (input) => {
    const saved = await window.api.host.save(input)
    const existing = get().hosts.some((h) => h.id === saved.id)
    set({
      hosts: existing
        ? get().hosts.map((h) => (h.id === saved.id ? saved : h))
        : [...get().hosts, saved]
    })
  },
  remove: async (id) => {
    await window.api.host.delete(id)
    set({ hosts: get().hosts.filter((h) => h.id !== id) })
  },
  clone: async (id) => {
    const saved = await window.api.host.clone(id)
    set({ hosts: [...get().hosts, saved] })
  },
  test: async (input) => {
    const tempId = input.id ?? 'new'
    set((s) => ({ testState: { ...s.testState, [tempId]: { testing: true } } }))
    const result = await window.api.host.test(input)
    set((s) => ({
      testState: { ...s.testState, [tempId]: { testing: false, result } }
    }))
  },
  ensureLocal: async (workspacesRoot) => {
    const saved = await window.api.host.ensureLocal(workspacesRoot)
    const existing = get().hosts.some((h) => h.id === saved.id)
    set({
      hosts: existing
        ? get().hosts.map((h) => (h.id === saved.id ? saved : h))
        : [...get().hosts, saved]
    })
  }
}))
