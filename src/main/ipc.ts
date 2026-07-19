import { ipcMain, type IpcMainInvokeEvent } from 'electron'

type Handler = (event: IpcMainInvokeEvent, ...args: any[]) => any | Promise<any>

const handlers: Record<string, Handler> = {
  'app:ping': async () => ({ pong: true, ts: Date.now() })
}

export function registerIpc(): void {
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler)
  }
}

export function registerHandler(channel: string, handler: Handler): void {
  if (!handlers[channel]) {
    ipcMain.handle(channel, handler)
    handlers[channel] = handler
  }
}
