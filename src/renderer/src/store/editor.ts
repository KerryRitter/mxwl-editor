import { create } from 'zustand'

export interface EditorFile {
  path: string
  dirty: boolean
}

interface EditorState {
  files: EditorFile[]
  activePath: string | null
  open: (path: string) => void
  close: (path: string) => void
  setActive: (path: string) => void
  setDirty: (path: string, dirty: boolean) => void
  closeAll: () => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  files: [],
  activePath: null,
  open: (path) => {
    if (get().files.some((f) => f.path === path)) {
      set({ activePath: path })
      return
    }
    set((s) => ({ files: [...s.files, { path, dirty: false }], activePath: path }))
  },
  close: (path) =>
    set((s) => {
      const files = s.files.filter((f) => f.path !== path)
      const activePath =
        s.activePath === path ? files[files.length - 1]?.path ?? null : s.activePath
      return { files, activePath }
    }),
  setActive: (path) => set({ activePath: path }),
  setDirty: (path, dirty) =>
    set((s) => ({
      files: s.files.map((f) => (f.path === path ? { ...f, dirty } : f))
    })),
  closeAll: () => set({ files: [], activePath: null })
}))
