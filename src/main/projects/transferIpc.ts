import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { MAX_SETTINGS_FILE_BYTES, parseProjectSettingsBundle } from '../../shared/projectTransfer'
import type { HostManager } from '../hosts/HostManager'
import type { ProjectManager } from './ProjectManager'
import { ProjectTransfer } from './ProjectTransfer'

export function registerProjectTransferIpc(projects: ProjectManager, hosts: HostManager): void {
  const transfer = new ProjectTransfer(projects, hosts)
  ipcMain.handle('project:exportSettings', async (event, projectIds: string[]) => {
    const bundle = transfer.export(projectIds)
    const content = JSON.stringify(bundle, null, 2) + '\n'
    if (Buffer.byteLength(content, 'utf8') > MAX_SETTINGS_FILE_BYTES)
      throw new Error('This export exceeds 10 MB. Select fewer projects.')
    const title = bundle.projects.length === 1 ? bundle.projects[0].label : 'mxwl-projects'
    const filename =
      (title.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'mxwl-projects') +
      '.mxwl.json'
    const options = {
      title: 'Export project and host settings',
      defaultPath: join(app.getPath('documents'), filename),
      filters: [{ name: 'mxwl settings', extensions: ['json'] }]
    }
    const parent = BrowserWindow.fromWebContents(event.sender)
    const result = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, content, { mode: 0o600 })
    return result.filePath
  })
  ipcMain.handle('project:readSettingsImport', async (event) => {
    const options = {
      title: 'Choose shared mxwl settings',
      properties: ['openFile'] as const,
      filters: [{ name: 'mxwl settings', extensions: ['json'] }]
    }
    const parent = BrowserWindow.fromWebContents(event.sender)
    const result = parent
      ? await dialog.showOpenDialog(parent, { ...options, properties: ['openFile'] })
      : await dialog.showOpenDialog({ ...options, properties: ['openFile'] })
    if (result.canceled || !result.filePaths[0]) return null
    const path = result.filePaths[0]
    const info = await stat(path)
    if (!info.isFile()) throw new Error('Choose a regular JSON settings file.')
    if (info.size > MAX_SETTINGS_FILE_BYTES)
      throw new Error('Settings exports must be smaller than 10 MB.')
    const content = await readFile(path, 'utf8')
    if (Buffer.byteLength(content, 'utf8') > MAX_SETTINGS_FILE_BYTES)
      throw new Error('Settings exports must be smaller than 10 MB.')
    let raw: unknown
    try {
      raw = JSON.parse(content)
    } catch {
      throw new Error('This file is not valid JSON.')
    }
    return { filename: basename(path), bundle: parseProjectSettingsBundle(raw) }
  })
  ipcMain.handle('project:importSettings', (_event, bundle: unknown, projectIds: string[]) =>
    transfer.import(bundle, projectIds)
  )
}
