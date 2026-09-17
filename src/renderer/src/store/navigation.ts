import { create } from 'zustand'

export type WorkspaceFocusTarget =
  | 'browser'
  | 'code'
  | 'changes'
  | 'agent'
  | 'terminal'
  | 'logs'
  | 'devtools'
  | `plugin:${string}`

type FocusRequest = { seq: number; target: WorkspaceFocusTarget }

type NavigationState = {
  requests: Record<string, FocusRequest>
  focus: (wsId: string, target: WorkspaceFocusTarget) => void
}

let focusSeq = 0

export const useNavigationStore = create<NavigationState>((set) => ({
  requests: {},
  focus: (wsId, target) =>
    set((state) => ({
      requests: { ...state.requests, [wsId]: { seq: ++focusSeq, target } }
    }))
}))
