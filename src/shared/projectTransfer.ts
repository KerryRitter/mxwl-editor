import { z } from 'zod'
import { assertRelativeDirectory, locationInputSchema, projectInputSchema } from './projects'
import type { HostConfig, ProjectConfig, ProjectLocation } from './types'

const id = z.string().min(1).max(120)
const text = z.string().max(4096)
const login = z.object({
  username: text,
  usernameSelector: text,
  passwordSelector: text,
  submitSelector: text
})
const sharedProject = projectInputSchema.extend({
  id,
  browserProfiles: z
    .array(
      z.object({
        id,
        label: z.string().trim().min(1).max(120),
        url: text,
        testLogin: login.optional()
      })
    )
    .max(50)
})
const sharedHost = z.object({
  id,
  kind: z.enum(['local', 'ssh']),
  builtinLocal: z.boolean().optional(),
  label: z.string().trim().min(1).max(120),
  host: text,
  port: z.number().int().min(0).max(65535),
  username: text,
  auth: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('none') }),
    z.object({ kind: z.literal('agent') }),
    z.object({ kind: z.literal('tailscale') }),
    z.object({ kind: z.literal('key'), keyPath: text }),
    z.object({ kind: z.literal('password') })
  ])
})
const sharedLocation = locationInputSchema.extend({
  id,
  builtinLocal: z.literal(true).optional(),
  // The permanent local slot can still be awaiting folder setup.
  checkoutPath: z.string().trim().max(4096)
})
const bundleSchema = z.object({
  format: z.literal('mxwl-project-settings'),
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  projects: z.array(sharedProject).min(1).max(100),
  hosts: z.array(sharedHost).max(500),
  locations: z.array(sharedLocation).max(1000)
})

export type ProjectSettingsBundle = z.infer<typeof bundleSchema>
export type ProjectSettingsImport = {
  projectIds: string[]
  projectsAdded: number
  hostsAdded: number
  hostsReused: number
  locationsAdded: number
}
export const MAX_SETTINGS_FILE_BYTES = 10 * 1024 * 1024

function unique(values: string[], description: string): void {
  if (new Set(values).size !== values.length)
    throw new Error(`${description} must have unique IDs.`)
}

/** Validate the whole file before any connection or project is saved. */
export function parseProjectSettingsBundle(raw: unknown): ProjectSettingsBundle {
  const result = bundleSchema.safeParse(raw)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new Error(
      `Invalid mxwl settings file: ${issue.path.join('.') || 'file'} — ${issue.message}`
    )
  }
  const bundle = result.data
  unique(
    bundle.projects.map((p) => p.id),
    'Projects'
  )
  unique(
    bundle.hosts.map((h) => h.id),
    'Connections'
  )
  unique(
    bundle.locations.map((l) => l.id),
    'Checkouts'
  )
  const projects = new Map(bundle.projects.map((p) => [p.id, p]))
  const hosts = new Map(bundle.hosts.map((h) => [h.id, h]))
  if (bundle.hosts.filter((h) => h.builtinLocal).length > 1)
    throw new Error('Only one connection can represent This machine.')
  for (const host of bundle.hosts) {
    if (host.kind === 'local' && host.auth.kind !== 'none')
      throw new Error('Local connections must use local authentication.')
    if (host.builtinLocal && host.kind !== 'local')
      throw new Error('This machine must be a local connection.')
    if (host.kind === 'ssh' && (!host.host.trim() || !host.username.trim() || !host.port))
      throw new Error(`SSH connection ${host.label} needs a host, port, and username.`)
  }
  for (const project of bundle.projects) {
    try {
      new RegExp(project.derive.folderPattern)
    } catch {
      throw new Error(`Invalid folder mapping in project ${project.label}.`)
    }
    unique(
      project.services.map((s) => s.id),
      'Services'
    )
    unique(
      project.browserProfiles.map((p) => p.id),
      'Browser profiles'
    )
    if (
      project.defaultBrowserProfileId &&
      !project.browserProfiles.some((p) => p.id === project.defaultBrowserProfileId)
    )
      throw new Error(`Default browser profile is missing in ${project.label}.`)
    for (const service of project.services) assertRelativeDirectory(service.cwd ?? '')
  }
  const localProjects = new Set<string>()
  for (const location of bundle.locations) {
    const project = projects.get(location.projectId)
    const host = hosts.get(location.hostId)
    if (!project || !host)
      throw new Error(`Checkout ${location.label} refers to a missing project or connection.`)
    if (location.builtinLocal) {
      if (!host.builtinLocal || localProjects.has(project.id))
        throw new Error('Each project can have one This machine checkout.')
      localProjects.add(project.id)
    }
    if (!location.checkoutPath && !location.builtinLocal)
      throw new Error(`Checkout ${location.label} needs a folder path.`)
    if (
      location.browserProfileId &&
      !project.browserProfiles.some((p) => p.id === location.browserProfileId)
    )
      throw new Error(`Browser profile is missing for checkout ${location.label}.`)
    assertRelativeDirectory(location.appSubdirectory)
    unique(
      (location.overrides.services ?? []).map((s) => s.id),
      'Checkout services'
    )
    for (const service of location.overrides.services ?? [])
      assertRelativeDirectory(service.cwd ?? '')
  }
  return bundle
}

export function buildProjectSettingsBundle(
  projects: ProjectConfig[],
  hosts: HostConfig[],
  locations: ProjectLocation[],
  projectIds: string[]
): ProjectSettingsBundle {
  const selected = z.array(id).min(1).max(100).parse(projectIds)
  unique(selected, 'Selected projects')
  if (selected.some((id) => !projects.some((p) => p.id === id)))
    throw new Error('A selected project is no longer available.')
  const includedLocations = locations.filter((l) => selected.includes(l.projectId))
  const hostIds = new Set(includedLocations.map((l) => l.hostId))
  const builtinIds = new Set(includedLocations.filter((l) => l.builtinLocal).map((l) => l.hostId))
  // Schemas explicitly allow only shareable fields, stripping encrypted secrets,
  // login passwords, timestamps, and any future private fields from stored data.
  return parseProjectSettingsBundle({
    format: 'mxwl-project-settings',
    version: 1,
    exportedAt: new Date().toISOString(),
    projects: projects.filter((p) => selected.includes(p.id)),
    hosts: hosts
      .filter((h) => hostIds.has(h.id))
      .map((h) => ({ ...h, builtinLocal: builtinIds.has(h.id) })),
    locations: includedLocations
  })
}
