import { ipcMain } from 'electron'
import type { ProjectInput, ProjectLocationInput } from '../../shared/types'
import type { WorkspaceManager } from '../workspace/WorkspaceManager'
import { ProjectManager } from './ProjectManager'
export { ProjectManager }
export function registerProjectIpc(
  projects: ProjectManager,
  workspaces: WorkspaceManager
): void {
  ipcMain.handle('project:list', () => projects.list())
  ipcMain.handle('project:locations', () => projects.listLocations())
  ipcMain.handle('project:save', (_e, input: ProjectInput) => {
    const removedProfile = workspaces
      .list()
      .some(
        (w) =>
          w.projectId === input.id &&
          w.browserProfileId &&
          !input.browserProfiles.some((p) => p.id === w.browserProfileId)
      )
    if (removedProfile)
      throw new Error('Close workspaces using a profile before removing it')
    if (
      projects
        .listLocations()
        .some(
          (l) =>
            l.projectId === input.id &&
            l.browserProfileId &&
            !input.browserProfiles.some((p) => p.id === l.browserProfileId)
        )
    )
      throw new Error('Update locations using a profile before removing it')
    const saved = projects.save(input)
    workspaces.refreshProject(saved.id)
    return saved
  })
  ipcMain.handle('project:saveLocation', (_e, input: ProjectLocationInput) => {
    const old = input.id ? projects.getLocation(input.id) : undefined
    if (
      old &&
      (old.hostId !== input.hostId ||
        old.projectId !== input.projectId ||
        old.appSubdirectory !== input.appSubdirectory) &&
      workspaces.list().some((w) => w.locationId === old.id)
    )
      throw new Error(
        'Close this location’s workspaces before changing its host, project, or app directory'
      )
    const saved = projects.saveLocation(input)
    workspaces.refreshProject(saved.projectId)
    return saved
  })
  ipcMain.handle('project:delete', (_e, id: string) => {
    if (workspaces.list().some((w) => w.projectId === id))
      throw new Error('Close this project’s workspaces before deleting it')
    projects.delete(id)
  })
  ipcMain.handle('project:deleteLocation', (_e, id: string) => {
    if (workspaces.list().some((w) => w.locationId === id))
      throw new Error('Close this location’s workspaces before deleting it')
    projects.deleteLocation(id)
  })
}
