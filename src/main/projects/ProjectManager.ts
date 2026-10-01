import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from 'node:fs'
import type {
  ProjectConfig,
  ProjectInput,
  ProjectLocation,
  ProjectLocationInput
} from '../../shared/types'
import {
  assertRelativeDirectory,
  locationInputSchema,
  projectInputSchema,
  resolveProjectSettings
} from '../../shared/projects'
import { encryptSecret, isEncryptionAvailable } from '../hosts/secrets'

export class ProjectManager {
  private projects: ProjectConfig[] = []
  private locations: ProjectLocation[] = []
  private loaded = false
  private file: string
  constructor(
    private hostExists: (id: string) => boolean,
    file?: string,
    private ensureLocalHost?: () => { id: string }
  ) {
    this.file = file ?? join(app.getPath('userData'), 'projects.json')
  }
  private load(): void {
    if (this.loaded) return
    if (existsSync(this.file)) {
      const data = JSON.parse(readFileSync(this.file, 'utf8'))
      if (
        data.version !== 1 ||
        !Array.isArray(data.projects) ||
        !Array.isArray(data.locations)
      )
        throw new Error('Invalid projects file; it has not been overwritten')
      this.projects = data.projects
      this.locations = data.locations
    }
    this.loaded = true
    if (this.projects.length && this.ensureLocalLocations()) this.persist()
  }
  private ensureLocalLocations(): boolean {
    if (!this.ensureLocalHost) return false
    const hostId = this.ensureLocalHost().id
    let changed = false
    for (const project of this.projects) {
      const matches = this.locations.filter(
        (l) => l.projectId === project.id && l.hostId === hostId
      )
      const existing = matches.find((l) => l.builtinLocal) ?? matches[0]
      if (existing) {
        if (!existing.builtinLocal) {
          existing.builtinLocal = true
          changed = true
        }
      } else {
        this.locations.push({
          id: randomUUID(),
          projectId: project.id,
          hostId,
          builtinLocal: true,
          label: 'This machine',
          checkoutPath: '',
          workspacesRoot: '~/Workspaces',
          folderFilter: '',
          appSubdirectory: '',
          browserProfileId: null,
          overrides: {}
        })
        changed = true
      }
    }
    return changed
  }
  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(
      tmp,
      JSON.stringify(
        { version: 1, projects: this.projects, locations: this.locations },
        null,
        2
      ),
      { mode: 0o600 }
    )
    renameSync(tmp, this.file)
  }
  list(): ProjectConfig[] {
    this.load()
    return structuredClone(this.projects)
  }
  listLocations(): ProjectLocation[] {
    this.load()
    return structuredClone(this.locations)
  }
  get(id: string): ProjectConfig | undefined {
    return this.list().find((p) => p.id === id)
  }
  getLocation(id: string): ProjectLocation | undefined {
    return this.listLocations().find((l) => l.id === id)
  }
  save(raw: ProjectInput): ProjectConfig {
    this.load()
    const input = projectInputSchema.parse(raw)
    const existing = input.id ? this.get(input.id) : undefined
    if (input.id && !existing) throw new Error('Project not found')
    try {
      new RegExp(input.derive.folderPattern)
    } catch {
      throw new Error('Invalid folder mapping regular expression')
    }
    for (const s of input.services) assertRelativeDirectory(s.cwd ?? '')
    if (new Set(input.services.map((s) => s.id)).size !== input.services.length)
      throw new Error('Service IDs must be unique')
    if (
      new Set(input.browserProfiles.map((p) => p.id)).size !==
      input.browserProfiles.length
    )
      throw new Error('Browser profile IDs must be unique')
    if (
      input.defaultBrowserProfileId &&
      !input.browserProfiles.some((p) => p.id === input.defaultBrowserProfileId)
    )
      throw new Error('Default browser profile not found')
    const next: ProjectConfig = {
      ...input,
      id: existing?.id ?? randomUUID(),
      addedAt: existing?.addedAt ?? Date.now(),
      browserProfiles: input.browserProfiles.map((profile) => {
        const old = existing?.browserProfiles.find((p) => p.id === profile.id)
        if (profile.testLogin?.password && !isEncryptionAvailable())
          throw new Error(
            'OS secret encryption unavailable; configure the keychain before saving a test password'
          )
        const t = profile.testLogin
        return {
          id: profile.id,
          label: profile.label,
          url: profile.url,
          testLogin:
            t === null
              ? undefined
              : t
                ? {
                    username: t.username,
                    usernameSelector: t.usernameSelector,
                    passwordSelector: t.passwordSelector,
                    submitSelector: t.submitSelector,
                    passwordEnc: t.password
                      ? encryptSecret(t.password)
                      : (old?.testLogin?.passwordEnc ?? '')
                  }
                : old?.testLogin
        }
      })
    }
    this.projects = [...this.projects.filter((p) => p.id !== next.id), next]
    this.ensureLocalLocations()
    this.persist()
    return structuredClone(next)
  }
  saveLocation(raw: ProjectLocationInput): ProjectLocation {
    this.load()
    const input = locationInputSchema.parse(raw)
    const project = this.get(input.projectId)
    if (!project || !this.hostExists(input.hostId))
      throw new Error('Project or host not found')
    if (input.id && !this.getLocation(input.id))
      throw new Error('Location not found')
    const existing = input.id
      ? this.getLocation(input.id)
      : this.locations.find(
          (l) =>
            l.builtinLocal &&
            l.projectId === input.projectId &&
            l.hostId === input.hostId &&
            !l.checkoutPath
        )
    if (
      existing?.builtinLocal &&
      (existing.projectId !== input.projectId ||
        existing.hostId !== input.hostId)
    )
      throw new Error(
        'This machine cannot be moved to another project or connection'
      )
    if (
      input.browserProfileId &&
      !project.browserProfiles.some((p) => p.id === input.browserProfileId)
    )
      throw new Error('Browser profile not found')
    assertRelativeDirectory(input.appSubdirectory)
    for (const s of input.overrides.services ?? [])
      assertRelativeDirectory(s.cwd ?? '')
    if (
      new Set((input.overrides.services ?? []).map((s) => s.id)).size !==
      (input.overrides.services ?? []).length
    )
      throw new Error('Service IDs must be unique')
    const next: ProjectLocation = {
      ...input,
      id: existing?.id ?? randomUUID(),
      ...(existing?.builtinLocal ? { builtinLocal: true as const } : {})
    }
    this.locations = [...this.locations.filter((l) => l.id !== next.id), next]
    this.persist()
    return structuredClone(next)
  }
  resolve(locationId: string, hostId?: string) {
    const location = this.getLocation(locationId)
    const project = location ? this.get(location.projectId) : undefined
    if (!location || !project || !this.hostExists(location.hostId))
      throw new Error('Project location is unavailable')
    if (hostId && location.hostId !== hostId)
      throw new Error('Location belongs to a different host')
    if (!location.checkoutPath)
      throw new Error(
        'Configure This machine’s checkout path before opening workspaces'
      )
    return {
      project,
      location,
      settings: resolveProjectSettings(project, location)
    }
  }
  delete(id: string): void {
    this.load()
    this.projects = this.projects.filter((p) => p.id !== id)
    this.locations = this.locations.filter((l) => l.projectId !== id)
    this.persist()
  }
  deleteLocation(id: string): void {
    this.load()
    if (this.getLocation(id)?.builtinLocal)
      throw new Error(
        'This machine is always available and cannot be removed from a project'
      )
    this.locations = this.locations.filter((l) => l.id !== id)
    this.persist()
  }
}
