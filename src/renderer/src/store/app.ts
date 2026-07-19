import { create } from 'zustand'

interface PingResult {
  pong: boolean
  ts: number
}

interface AppState {
  pingResult: PingResult | null
  setPingResult: (r: PingResult | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  pingResult: null,
  setPingResult: (r) => set({ pingResult: r })
}))
