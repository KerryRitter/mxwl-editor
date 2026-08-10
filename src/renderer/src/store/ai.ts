import { create } from 'zustand'
import type { AiCliId, AiPlan, AiRunState } from '../../../shared/types'

type AiState = {
  modalOpen: boolean
  brief: string
  plan: AiPlan | null
  planning: boolean
  refined: boolean
  warning: string | null
  error: string | null
  runs: AiRunState[]

  setModalOpen: (open: boolean) => void
  setBrief: (brief: string) => void
  setPrompt: (targetId: string, taskId: string, prompt: string) => void
  dropTarget: (targetId: string) => void
  dropTask: (targetId: string, taskId: string) => void
  plan_: (req: { hostId: string; cli: AiCliId; refine: boolean }) => Promise<void>
  run: () => Promise<AiRunState | null>
  loadRuns: () => Promise<void>
  applyRun: (run: AiRunState) => void
  reset: () => void
}

export const useAiStore = create<AiState>((set, get) => ({
  modalOpen: false,
  brief: '',
  plan: null,
  planning: false,
  refined: false,
  warning: null,
  error: null,
  runs: [],

  setModalOpen: (open) => set({ modalOpen: open, error: null }),
  setBrief: (brief) => set({ brief }),

  setPrompt: (targetId, taskId, prompt) =>
    set((s) => ({
      plan: s.plan && {
        ...s.plan,
        targets: s.plan.targets.map((t) =>
          t.id === targetId
            ? { ...t, tasks: t.tasks.map((k) => (k.id === taskId ? { ...k, prompt } : k)) }
            : t
        )
      }
    })),

  dropTarget: (targetId) =>
    set((s) => ({
      plan: s.plan && { ...s.plan, targets: s.plan.targets.filter((t) => t.id !== targetId) }
    })),

  dropTask: (targetId, taskId) =>
    set((s) => ({
      plan: s.plan && {
        ...s.plan,
        targets: s.plan.targets.map((t) =>
          t.id === targetId ? { ...t, tasks: t.tasks.filter((k) => k.id !== taskId) } : t
        )
      }
    })),

  plan_: async ({ hostId, cli, refine }) => {
    const brief = get().brief.trim()
    if (!brief) {
      set({ error: 'Paste a brief first.' })
      return
    }
    set({ planning: true, error: null, warning: null })
    try {
      const res = await window.api.ai.plan({ brief, hostId, cli, refine })
      set({ plan: res.plan, refined: res.refined, warning: res.warning ?? null })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), plan: null })
    } finally {
      set({ planning: false })
    }
  },

  run: async () => {
    const plan = get().plan
    if (!plan) return null
    try {
      const run = await window.api.ai.run(plan)
      set((s) => ({ runs: [run, ...s.runs.filter((r) => r.runId !== run.runId)] }))
      return run
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
      return null
    }
  },

  loadRuns: async () => {
    const runs = await window.api.ai.runs()
    set({ runs })
  },

  applyRun: (run) =>
    set((s) => ({ runs: [run, ...s.runs.filter((r) => r.runId !== run.runId)] })),

  reset: () => set({ brief: '', plan: null, warning: null, error: null, refined: false })
}))
