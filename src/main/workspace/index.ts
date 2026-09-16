import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { DirEntry, GitChangesSnapshot, GitFileDiff, WorkspaceState } from '../../shared/types'
import { WorkspaceManager } from './WorkspaceManager'

export { WorkspaceManager, SshConnection } from './WorkspaceManager'
export { deriveFromFolder } from './derive'

export function registerWorkspaceIpc(manager: WorkspaceManager): void {
  ipcMain.handle('workspace:list', (): WorkspaceState[] => manager.list())
  ipcMain.handle(
    'workspace:discover',
    (_e: IpcMainInvokeEvent, hostId: string): Promise<DirEntry[]> => manager.discover(hostId)
  )
  ipcMain.handle(
    'workspace:open',
    (
      _e: IpcMainInvokeEvent,
      payload: { hostId: string; remotePath: string }
    ): Promise<WorkspaceState> => manager.open(payload.hostId, payload.remotePath)
  )
  ipcMain.handle(
    'workspace:createWorktree',
    (
      _e: IpcMainInvokeEvent,
      payload: { wsId: string; ticket: string; branch?: string }
    ): Promise<WorkspaceState> =>
      manager.createWorktree(payload.wsId, { ticket: payload.ticket, branch: payload.branch })
  )
  ipcMain.handle('workspace:close', (_e: IpcMainInvokeEvent, id: string): void =>
    manager.close(id)
  )
  ipcMain.handle(
    'workspace:rename',
    (_e: IpcMainInvokeEvent, payload: { wsId: string; title: string }): void =>
      manager.renameWorkspace(payload.wsId, payload.title)
  )
  ipcMain.handle('workspace:git', (_e: IpcMainInvokeEvent, wsId: string) =>
    manager.refreshGit(wsId)
  )
  ipcMain.handle(
    'workspace:search',
    (_e: IpcMainInvokeEvent, payload: { wsId: string; query: string }) =>
      manager.search(payload.wsId, payload.query)
  )
  ipcMain.handle(
    'workspace:listFiles',
    (_e: IpcMainInvokeEvent, payload: { wsId: string; query?: string }) =>
      manager.listFiles(payload.wsId, payload.query ?? '')
  )
  ipcMain.handle(
    'workspace:changes',
    (_e: IpcMainInvokeEvent, wsId: string): Promise<GitChangesSnapshot> =>
      manager.gitChanges(wsId)
  )
  ipcMain.handle(
    'workspace:fileDiff',
    (
      _e: IpcMainInvokeEvent,
      payload: { wsId: string; path: string }
    ): Promise<GitFileDiff> => manager.gitFileDiff(payload.wsId, payload.path)
  )
  ipcMain.handle(
    'workspace:gitStageFile',
    (_e: IpcMainInvokeEvent, payload: { wsId: string; path: string }): Promise<string> =>
      manager.gitStageFile(payload.wsId, payload.path)
  )
  ipcMain.handle(
    'workspace:gitUnstageFile',
    (_e: IpcMainInvokeEvent, payload: { wsId: string; path: string }): Promise<string> =>
      manager.gitUnstageFile(payload.wsId, payload.path)
  )
  ipcMain.handle(
    'workspace:gitStageHunk',
    (
      _e: IpcMainInvokeEvent,
      payload: { wsId: string; path: string; hunkId: string }
    ): Promise<string> => manager.gitStageHunk(payload.wsId, payload.path, payload.hunkId)
  )
  ipcMain.handle(
    'workspace:gitCommit',
    (_e: IpcMainInvokeEvent, payload: { wsId: string; message: string }): Promise<string> =>
      manager.gitCommit(payload.wsId, payload.message)
  )
  ipcMain.handle('workspace:gitPush', (_e: IpcMainInvokeEvent, wsId: string): Promise<string> =>
    manager.gitPush(wsId)
  )
  ipcMain.handle('workspace:gitPullRequestUrl', (_e: IpcMainInvokeEvent, wsId: string): Promise<string> =>
    manager.gitPullRequestUrl(wsId)
  )
  ipcMain.handle('dev:services', (_e: IpcMainInvokeEvent, wsId: string) =>
    manager.listServices(wsId)
  )

  ipcMain.handle(
    'terminal:open',
    (
      _e: IpcMainInvokeEvent,
      payload: { wsId: string; cwd?: string; cols: number; rows: number; label?: string; tmuxName?: string }
    ): Promise<string> => manager.openTerminal(payload.wsId, payload)
  )
  ipcMain.handle(
    'terminal:replay',
    (_e: IpcMainInvokeEvent, payload: { wsId: string; sessionId: string }): string =>
      manager.terminalReplay(payload.wsId, payload.sessionId)
  )
  ipcMain.handle(
    'terminal:input',
    (_e: IpcMainInvokeEvent, payload: { wsId: string; sessionId: string; data: string }): void =>
      manager.writeTerminal(payload.wsId, payload.sessionId, payload.data)
  )
  ipcMain.handle(
    'terminal:resize',
    (
      _e: IpcMainInvokeEvent,
      payload: { wsId: string; sessionId: string; cols: number; rows: number }
    ): void => manager.resizeTerminal(payload.wsId, payload.sessionId, payload.cols, payload.rows)
  )
  ipcMain.handle(
    'terminal:close',
    (_e: IpcMainInvokeEvent, payload: { wsId: string; sessionId: string }): void =>
      manager.closeTerminal(payload.wsId, payload.sessionId)
  )
  ipcMain.handle(
    'terminal:rename',
    (_e: IpcMainInvokeEvent, payload: { wsId: string; sessionId: string; label: string }): void =>
      manager.renameTerminal(payload.wsId, payload.sessionId, payload.label)
  )
  ipcMain.handle(
    'terminal:setActive',
    (_e: IpcMainInvokeEvent, payload: { wsId: string; sessionId: string }): void =>
      manager.setActiveTerminal(payload.wsId, payload.sessionId)
  )

  ipcMain.handle(
    'fs:readdir',
    (_e: IpcMainInvokeEvent, payload: { wsId: string; path: string }) =>
      manager.fsReadDir(payload.wsId, payload.path)
  )
  ipcMain.handle(
    'fs:readfile',
    (_e: IpcMainInvokeEvent, payload: { wsId: string; path: string }) =>
      manager.fsReadFile(payload.wsId, payload.path)
  )
  ipcMain.handle(
    'fs:writefile',
    (_e: IpcMainInvokeEvent, payload: { wsId: string; path: string; content: string }) =>
      manager.fsWriteFile(payload.wsId, payload.path, payload.content)
  )
  ipcMain.handle(
    'fs:stat',
    (_e: IpcMainInvokeEvent, payload: { wsId: string; path: string }) =>
      manager.fsStat(payload.wsId, payload.path)
  )
  ipcMain.handle(
    'fs:mkdir',
    (_e: IpcMainInvokeEvent, payload: { wsId: string; path: string }) =>
      manager.fsMkdir(payload.wsId, payload.path)
  )
  ipcMain.handle(
    'fs:rename',
    (_e: IpcMainInvokeEvent, payload: { wsId: string; src: string; dst: string }) =>
      manager.fsRename(payload.wsId, payload.src, payload.dst)
  )
  ipcMain.handle(
    'fs:delete',
    (_e: IpcMainInvokeEvent, payload: { wsId: string; path: string; isDir: boolean }) =>
      manager.fsDelete(payload.wsId, payload.path, payload.isDir)
  )

  ipcMain.handle(
    'browser:newTab',
    (_e: IpcMainInvokeEvent, payload: { wsId: string; url?: string; groupId?: string }): string =>
      manager.browserNewTab(payload.wsId, payload.url, payload.groupId)
  )
  ipcMain.handle(
    'browser:newGroup',
    (_e: IpcMainInvokeEvent, payload: { wsId: string; label?: string }): string =>
      manager.browserNewGroup(payload.wsId, payload.label)
  )
  ipcMain.handle(
    'browser:updateGroup',
    (
      _e: IpcMainInvokeEvent,
      payload: { wsId: string; groupId: string; label?: string; color?: string }
    ): void =>
      manager.browserUpdateGroup(payload.wsId, payload.groupId, {
        label: payload.label,
        color: payload.color
      })
  )
  ipcMain.handle(
    'browser:closeGroup',
    (_e: IpcMainInvokeEvent, payload: { wsId: string; groupId: string }): void =>
      manager.browserCloseGroup(payload.wsId, payload.groupId)
  )
  ipcMain.handle(
    'browser:clearGroup',
    (_e: IpcMainInvokeEvent, payload: { wsId: string; groupId: string }): Promise<void> =>
      manager.browserClearGroup(payload.wsId, payload.groupId)
  )
  ipcMain.handle(
    'browser:moveTab',
    (
      _e: IpcMainInvokeEvent,
      payload: { wsId: string; tabId: string; groupId: string }
    ): string | null => manager.browserMoveTab(payload.wsId, payload.tabId, payload.groupId)
  )
  ipcMain.handle('browser:closeTab', (_e: IpcMainInvokeEvent, payload: { wsId: string; tabId: string }): void =>
    manager.browserCloseTab(payload.wsId, payload.tabId)
  )
  ipcMain.handle('browser:setActive', (_e: IpcMainInvokeEvent, payload: { wsId: string; tabId: string }): void =>
    manager.browserSetActive(payload.wsId, payload.tabId)
  )
  ipcMain.handle('browser:navigate', (_e: IpcMainInvokeEvent, payload: { wsId: string; tabId: string; url: string }): void =>
    manager.browserNavigate(payload.wsId, payload.tabId, payload.url)
  )
  ipcMain.handle('browser:back', (_e: IpcMainInvokeEvent, payload: { wsId: string; tabId: string }): void =>
    manager.browserBack(payload.wsId, payload.tabId)
  )
  ipcMain.handle('browser:forward', (_e: IpcMainInvokeEvent, payload: { wsId: string; tabId: string }): void =>
    manager.browserForward(payload.wsId, payload.tabId)
  )
  ipcMain.handle('browser:reload', (_e: IpcMainInvokeEvent, payload: { wsId: string; tabId: string }): void =>
    manager.browserReload(payload.wsId, payload.tabId)
  )
  ipcMain.handle('browser:testLogin', (_e: IpcMainInvokeEvent, wsId: string): Promise<void> =>
    manager.browserTestLogin(wsId)
  )
  ipcMain.handle('browser:zoom', (_e: IpcMainInvokeEvent, payload: { wsId: string; tabId: string; factor: number }): void =>
    manager.browserZoom(payload.wsId, payload.tabId, payload.factor)
  )
  ipcMain.handle('browser:devtools', (_e: IpcMainInvokeEvent, payload: { wsId: string; tabId: string }): void =>
    manager.browserDevtools(payload.wsId, payload.tabId)
  )
  ipcMain.handle(
    'browser:setDevtoolsBounds',
    (
      _e: IpcMainInvokeEvent,
      payload: { wsId: string; x: number; y: number; width: number; height: number }
    ): void =>
      manager.browserSetDevtoolsBounds(
        payload.wsId,
        payload.x,
        payload.y,
        payload.width,
        payload.height
      )
  )
  ipcMain.handle(
    'browser:setDevtoolsVisible',
    (_e: IpcMainInvokeEvent, payload: { wsId: string; visible: boolean }): void =>
      manager.browserSetDevtoolsVisible(payload.wsId, payload.visible)
  )
  ipcMain.handle('browser:setBounds', (_e: IpcMainInvokeEvent, payload: { wsId: string; x: number; y: number; width: number; height: number }): void =>
    manager.browserSetBounds(payload.wsId, payload.x, payload.y, payload.width, payload.height)
  )
  ipcMain.handle('browser:setVisible', (_e: IpcMainInvokeEvent, payload: { wsId: string; visible: boolean }): void =>
    manager.browserSetVisible(payload.wsId, payload.visible)
  )
  ipcMain.handle('browser:activate', (_e: IpcMainInvokeEvent, wsId: string): void =>
    manager.bringToFront(wsId)
  )
  ipcMain.handle('browser:snapshot', (_e: IpcMainInvokeEvent, wsId: string) =>
    manager.browserSnapshot(wsId)
  )

  ipcMain.handle(
    'dev:run',
    (
      _e: IpcMainInvokeEvent,
      payload: { wsId: string; app: string; action: 'start' | 'stop' | 'restart' }
    ) => manager.devRun(payload.wsId, payload.app, payload.action)
  )
  ipcMain.handle('dev:tail', (_e: IpcMainInvokeEvent, payload: { wsId: string; app: string }) =>
    manager.devTail(payload.wsId, payload.app)
  )
  ipcMain.handle(
    'dev:stopTail',
    (_e: IpcMainInvokeEvent, payload: { wsId: string; app: string }): void =>
      manager.devStopTail(payload.wsId, payload.app)
  )
}
