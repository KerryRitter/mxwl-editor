import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type {
  AgentId,
  AgentSessionState,
  AgentTranscript,
  AgentTranscriptMeta
} from '../../shared/types'
import { AgentController, type AgentCatalogEntry } from './AgentController'

export { AgentController }
export type { AgentCatalogEntry }
export { AcpSession } from './AcpSession'
export { TranscriptStore } from './TranscriptStore'

export function registerAgentIpc(agents: AgentController): void {
  ipcMain.handle('agent:catalog', (): AgentCatalogEntry[] => agents.catalog())

  ipcMain.handle(
    'agent:open',
    (_e: IpcMainInvokeEvent, req: { wsId: string; agentId?: AgentId }) =>
      agents.open(req.wsId, req.agentId)
  )

  ipcMain.handle(
    'agent:get',
    (_e: IpcMainInvokeEvent, wsId: string): AgentSessionState | null => agents.get(wsId)
  )

  ipcMain.handle('agent:list', (): AgentSessionState[] => agents.list())

  ipcMain.handle('agent:close', (_e: IpcMainInvokeEvent, wsId: string) => agents.close(wsId))

  ipcMain.handle('agent:restart', (_e: IpcMainInvokeEvent, wsId: string) => agents.restart(wsId))

  ipcMain.handle('agent:prompt', (_e: IpcMainInvokeEvent, req: { wsId: string; text: string }) =>
    agents.prompt(req.wsId, req.text)
  )

  ipcMain.handle('agent:cancel', (_e: IpcMainInvokeEvent, wsId: string) => agents.cancel(wsId))

  ipcMain.handle('agent:clear', (_e: IpcMainInvokeEvent, wsId: string) => agents.clear(wsId))

  ipcMain.handle('agent:setMode', (_e: IpcMainInvokeEvent, req: { wsId: string; modeId: string }) =>
    agents.setMode(req.wsId, req.modeId)
  )

  ipcMain.handle(
    'agent:respond',
    (_e: IpcMainInvokeEvent, req: { wsId: string; requestId: string; optionId: string | null }) =>
      agents.respond(req.wsId, req.requestId, req.optionId)
  )

  ipcMain.handle(
    'agent:authenticate',
    (_e: IpcMainInvokeEvent, req: { wsId: string; methodId: string }) =>
      agents.authenticate(req.wsId, req.methodId)
  )

  ipcMain.handle(
    'agent:history',
    (_e: IpcMainInvokeEvent, cwd?: string): AgentTranscriptMeta[] => agents.history(cwd)
  )

  ipcMain.handle(
    'agent:transcript',
    (_e: IpcMainInvokeEvent, id: string): AgentTranscript | null => agents.transcript(id)
  )

  ipcMain.handle('agent:deleteTranscript', (_e: IpcMainInvokeEvent, id: string) =>
    agents.deleteTranscript(id)
  )
}
