import { create } from 'zustand'
import { useHostsStore } from './hosts'
import type {
  ProjectConfig,
  ProjectInput,
  ProjectLocation,
  ProjectLocationInput
} from '../../../shared/types'

type ProjectsState = {
  projects: ProjectConfig[]
  locations: ProjectLocation[]
  error: string | null
  load: () => Promise<void>
  save: (input: ProjectInput) => Promise<ProjectConfig>
  saveLocation: (input: ProjectLocationInput) => Promise<ProjectLocation>
  remove: (id: string) => Promise<void>
  removeLocation: (id: string) => Promise<void>
}
export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  locations: [],
  error: null,
  load: async () => {
    try {
      const [projects, locations] = await Promise.all([
        window.api.project.list(),
        window.api.project.locations()
      ])
      await useHostsStore.getState().load()
      set({ projects, locations, error: null })
    } catch (error) {
      set({ error: String(error) })
    }
  },
  save: async (input) => {
    const saved = await window.api.project.save(input)
    await get().load()
    return saved
  },
  saveLocation: async (input) => {
    const saved = await window.api.project.saveLocation(input)
    await get().load()
    return saved
  },
  remove: async (id) => {
    await window.api.project.delete(id)
    await get().load()
  },
  removeLocation: async (id) => {
    await window.api.project.deleteLocation(id)
    await get().load()
  }
}))
