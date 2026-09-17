import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { PluginHostMethod } from '../../shared/plugins'
import type { PluginManager } from './PluginManager'

export { PluginManager } from './PluginManager'

export function registerPluginIpc(manager: PluginManager): void {
  ipcMain.handle('plugins:list', () => manager.list())
  ipcMain.handle(
    'plugins:setEnabled',
    (_event: IpcMainInvokeEvent, input: { id: string; enabled: boolean }) =>
      manager.setEnabled(input.id, input.enabled)
  )
  ipcMain.handle('plugins:reload', () => manager.reload())
  ipcMain.handle('plugins:openDirectory', () => manager.openDirectory())
  ipcMain.handle(
    'plugins:call',
    (
      _event: IpcMainInvokeEvent,
      input: {
        pluginId: string
        wsId: string
        method: PluginHostMethod
        params?: Record<string, unknown>
      }
    ) => manager.call(input)
  )
}
