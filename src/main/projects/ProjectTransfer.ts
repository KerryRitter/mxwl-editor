import { randomUUID } from 'node:crypto'
import type { AuthConfig, HostConfig, ProjectConfig, ProjectLocation } from '../../shared/types'
import {
  buildProjectSettingsBundle,
  parseProjectSettingsBundle,
  type ProjectSettingsImport
} from '../../shared/projectTransfer'
import type { HostManager } from '../hosts/HostManager'
import type { ProjectManager } from './ProjectManager'

function availableLabel(label: string, used: Set<string>): string {
  let candidate = label
  let n = 1
  while (used.has(candidate.toLocaleLowerCase())) {
    const suffix = n === 1 ? ' (imported)' : ` (imported ${n})`
    candidate = label.slice(0, 120 - suffix.length) + suffix
    n++
  }
  used.add(candidate.toLocaleLowerCase())
  return candidate
}

function connectionIdentity(
  host: Pick<HostConfig, 'kind' | 'host' | 'port' | 'username' | 'auth' | 'label'>
): string {
  return JSON.stringify(
    host.kind === 'local'
      ? ['local', host.label]
      : [
          'ssh',
          host.host.trim().toLowerCase(),
          host.port,
          host.username,
          host.auth.kind,
          host.auth.kind === 'key' ? host.auth.keyPath : ''
        ]
  )
}

export class ProjectTransfer {
  constructor(
    private projects: ProjectManager,
    private hosts: Pick<HostManager, 'list' | 'save' | 'delete' | 'ensureLocal'>
  ) {}

  export(projectIds: string[]) {
    return buildProjectSettingsBundle(
      this.projects.list(),
      this.hosts.list(),
      this.projects.listLocations(),
      projectIds
    )
  }

  import(raw: unknown, projectIds: string[]): ProjectSettingsImport {
    const bundle = parseProjectSettingsBundle(raw)
    if (
      !projectIds.length ||
      new Set(projectIds).size !== projectIds.length ||
      projectIds.some((id) => !bundle.projects.some((p) => p.id === id))
    )
      throw new Error('Select projects from this settings file to import.')
    const projectLabels = new Set(this.projects.list().map((p) => p.label.toLocaleLowerCase()))
    const existingHosts = this.hosts.list()
    const hostLabels = new Set(existingHosts.map((h) => h.label.toLocaleLowerCase()))
    const hostMap = new Map<string, string>()
    const projectMap = new Map<string, string>()
    const profileMaps = new Map<string, Map<string, string>>()
    const selectedLocations = bundle.locations.filter((l) => projectIds.includes(l.projectId))
    const neededHosts = new Set(selectedLocations.map((l) => l.hostId))
    const newHosts: HostConfig[] = []
    let hostsReused = 0
    for (const host of bundle.hosts.filter((h) => neededHosts.has(h.id))) {
      if (host.builtinLocal) {
        hostMap.set(host.id, this.hosts.ensureLocal().id)
        hostsReused++
        continue
      }
      const auth: AuthConfig =
        host.auth.kind === 'password' ? { kind: 'password', encryptedPassword: '' } : host.auth
      const reused = [...existingHosts, ...newHosts].find(
        (h) => connectionIdentity(h) === connectionIdentity({ ...host, auth })
      )
      if (reused) {
        hostMap.set(host.id, reused.id)
        hostsReused++
      } else {
        const next: HostConfig = {
          id: randomUUID(),
          addedAt: Date.now(),
          kind: host.kind,
          label: availableLabel(host.label, hostLabels),
          host: host.host,
          port: host.port,
          username: host.username,
          auth
        }
        newHosts.push(next)
        hostMap.set(host.id, next.id)
      }
    }
    const projects: ProjectConfig[] = bundle.projects
      .filter((p) => projectIds.includes(p.id))
      .map((project) => {
        const profiles = new Map(project.browserProfiles.map((p) => [p.id, randomUUID()]))
        profileMaps.set(project.id, profiles)
        const id = randomUUID()
        projectMap.set(project.id, id)
        return {
          ...project,
          id,
          addedAt: Date.now(),
          label: availableLabel(project.label, projectLabels),
          browserProfiles: project.browserProfiles.map((p) => ({
            ...p,
            id: profiles.get(p.id)!,
            testLogin: p.testLogin ? { ...p.testLogin, passwordEnc: '' } : undefined
          })),
          defaultBrowserProfileId: project.defaultBrowserProfileId
            ? profiles.get(project.defaultBrowserProfileId)!
            : null
        }
      })
    const locations: ProjectLocation[] = selectedLocations.map((location) => ({
      ...location,
      id: randomUUID(),
      projectId: projectMap.get(location.projectId)!,
      hostId: hostMap.get(location.hostId)!,
      browserProfileId: location.browserProfileId
        ? profileMaps.get(location.projectId)!.get(location.browserProfileId)!
        : null
    }))
    const staged: string[] = []
    try {
      for (const host of newHosts) {
        staged.push(host.id)
        this.hosts.save(host)
      }
      this.projects.addImported(projects, locations)
    } catch (error) {
      for (const id of staged) this.hosts.delete(id)
      throw error
    }
    return {
      projectIds: projects.map((p) => p.id),
      projectsAdded: projects.length,
      hostsAdded: newHosts.length,
      hostsReused,
      locationsAdded: locations.length
    }
  }
}
