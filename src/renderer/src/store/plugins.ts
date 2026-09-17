import { create } from 'zustand'
import type { PluginCatalogEntry, PluginInfo, WorkspaceToolContribution } from '../../../shared/plugins'

export type WorkspaceToolRegistration = {
  key: string
  plugin: PluginInfo
  contribution: WorkspaceToolContribution
}

type PluginState = {
  catalog: PluginCatalogEntry[]
  loaded: boolean
  load: () => Promise<void>
  init: () => () => void
  setEnabled: (id: string, enabled: boolean) => Promise<void>
  reload: () => Promise<void>
}

export const usePluginsStore = create<PluginState>((set) => ({
  catalog: [],
  loaded: false,
  load: async () => {
    const catalog = await window.api.plugins.list()
    set({ catalog, loaded: true })
  },
  init: () => {
    void window.api.plugins.list().then((catalog) => set({ catalog, loaded: true }))
    return window.api.on('plugins:changed', (...args: unknown[]) => {
      set({ catalog: args[0] as PluginCatalogEntry[], loaded: true })
    })
  },
  setEnabled: async (id, enabled) => {
    const catalog = await window.api.plugins.setEnabled(id, enabled)
    set({ catalog, loaded: true })
  },
  reload: async () => {
    const catalog = await window.api.plugins.reload()
    set({ catalog, loaded: true })
  }
}))

export function workspaceTools(catalog: PluginCatalogEntry[]): WorkspaceToolRegistration[] {
  return catalog
    .filter((plugin): plugin is PluginInfo => plugin.enabled && !('error' in plugin))
    .flatMap((plugin) =>
      plugin.contributes.workspaceTools.map((contribution) => ({
        key: `${plugin.id}:${contribution.id}`,
        plugin,
        contribution
      }))
    )
    .sort(
      (a, b) =>
        (a.contribution.order ?? 1_000) - (b.contribution.order ?? 1_000) ||
        a.contribution.title.localeCompare(b.contribution.title)
    )
}
