import { create } from 'zustand'

export type EditorFile = {
  path: string
  dirty: boolean
}

type WsEditor = {
  files: EditorFile[]
  activePath: string | null
}

type EditorState = {
  byWs: Record<string, WsEditor>
  open: (wsId: string, path: string) => void
  close: (wsId: string, path: string) => void
  setActive: (wsId: string, path: string) => void
  setDirty: (wsId: string, path: string, dirty: boolean) => void
  clearWs: (wsId: string) => void
}

const empty = (): WsEditor => ({ files: [], activePath: null })

const getWs = (byWs: Record<string, WsEditor>, wsId: string): WsEditor =>
  byWs[wsId] ?? empty()

export const useEditorStore = create<EditorState>((set, get) => ({
  byWs: {},

  open: (wsId, path) => {
    const cur = getWs(get().byWs, wsId)
    if (cur.files.some((f) => f.path === path)) {
      set((s) => ({
        byWs: { ...s.byWs, [wsId]: { ...getWs(s.byWs, wsId), activePath: path } }
      }))
      return
    }
    set((s) => {
      const ws = getWs(s.byWs, wsId)
      return {
        byWs: {
          ...s.byWs,
          [wsId]: {
            files: [...ws.files, { path, dirty: false }],
            activePath: path
          }
        }
      }
    })
  },

  close: (wsId, path) =>
    set((s) => {
      const ws = getWs(s.byWs, wsId)
      const files = ws.files.filter((f) => f.path !== path)
      const activePath =
        ws.activePath === path ? files[files.length - 1]?.path ?? null : ws.activePath
      return { byWs: { ...s.byWs, [wsId]: { files, activePath } } }
    }),

  setActive: (wsId, path) =>
    set((s) => ({
      byWs: { ...s.byWs, [wsId]: { ...getWs(s.byWs, wsId), activePath: path } }
    })),

  setDirty: (wsId, path, dirty) =>
    set((s) => {
      const ws = getWs(s.byWs, wsId)
      return {
        byWs: {
          ...s.byWs,
          [wsId]: {
            ...ws,
            files: ws.files.map((f) => (f.path === path ? { ...f, dirty } : f))
          }
        }
      }
    }),

  clearWs: (wsId) =>
    set((s) => {
      const { [wsId]: _, ...rest } = s.byWs
      return { byWs: rest }
    })
}))
