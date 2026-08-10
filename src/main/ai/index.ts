import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { AiCliId, AiPlan, AiRunState } from '../../shared/types'
import { compilePlan } from '../../shared/aiPrompt'
import type { SettingsStore } from '../persistence/SettingsStore'
import type { WorkspaceManager } from '../workspace/WorkspaceManager'
import { AiRunner } from './AiRunner'
import { refinePlan } from './planner'

export { AiRunner }

export type AiPlanRequest = {
  brief: string
  hostId: string
  cli?: AiCliId
  /** Force the AI refine pass on/off for this request (defaults to the setting) */
  refine?: boolean
}

export type AiPlanResponse = {
  plan: AiPlan
  refined: boolean
  warning?: string
}

export function registerAiIpc(runner: AiRunner, settings: SettingsStore, workspaces: WorkspaceManager): void {
  ipcMain.handle(
    'ai:plan',
    async (_e: IpcMainInvokeEvent, req: AiPlanRequest): Promise<AiPlanResponse> => {
      const ai = settings.all().ai
      const cli = req.cli ?? ai.defaultCli
      const plan = compilePlan(req.brief, {
        hostId: req.hostId,
        cli,
        folderTemplate: ai.workspaceFolderTemplate
      })
      if (plan.targets.length === 0) {
        return { plan, refined: false, warning: 'No tickets or work items found in the brief.' }
      }
      if (plan.targets[0].tasks.length === 0) {
        return { plan, refined: false, warning: 'No steps found — list the steps to run per item.' }
      }

      const shouldRefine = req.refine ?? ai.refinePrompts
      if (!shouldRefine) return { plan, refined: false }

      const shell = await workspaces.openHostShell(req.hostId)
      try {
        const result = await refinePlan(plan, ai, shell)
        return { plan: result.plan, refined: result.refined, warning: result.error }
      } catch (err) {
        return {
          plan,
          refined: false,
          warning: err instanceof Error ? err.message : String(err)
        }
      } finally {
        await shell.close()
      }
    }
  )

  ipcMain.handle('ai:run', (_e: IpcMainInvokeEvent, plan: AiPlan): AiRunState => runner.start(plan))
  ipcMain.handle('ai:runs', (): AiRunState[] => runner.list())
  ipcMain.handle('ai:cancel', (_e: IpcMainInvokeEvent, runId: string): void => runner.cancel(runId))
}
