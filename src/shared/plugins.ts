export const MXWL_PLUGIN_API_VERSION = 1 as const

export const PLUGIN_PERMISSIONS = [
  'workspace:read',
  'files:read',
  'files:write',
  'git:read',
  'git:write',
  'browser:open',
  'agent:prompt',
  'storage',
  'network:fetch'
] as const

export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number]
export type PluginSource = 'builtin' | 'user'
export type PluginIcon = 'code' | 'diff' | 'tasks' | 'git' | 'globe' | 'puzzle'

export type WorkspaceToolContribution = {
  id: string
  title: string
  icon?: PluginIcon
  order?: number
  /** User plugins point at an HTML document inside the plugin directory. */
  entry?: string
}

export type PluginManifest = {
  apiVersion: typeof MXWL_PLUGIN_API_VERSION
  id: string
  name: string
  version: string
  description?: string
  author?: string
  homepage?: string
  permissions?: PluginPermission[]
  contributes: {
    workspaceTools: WorkspaceToolContribution[]
  }
}

export type PluginInfo = PluginManifest & {
  source: PluginSource
  enabled: boolean
  revision: number
  permissionReviewRequired?: boolean
  directory?: string
}

export type InvalidPluginInfo = {
  id: string
  name: string
  version: string
  description?: string
  source: 'user'
  enabled: false
  revision: number
  error: string
  permissions: PluginPermission[]
  contributes: { workspaceTools: [] }
  apiVersion: typeof MXWL_PLUGIN_API_VERSION
  directory?: string
}

export type PluginCatalogEntry = PluginInfo | InvalidPluginInfo

export type PluginSettings = {
  /** Missing keys mean enabled for built-ins and disabled for user plugins. */
  enabled: Record<string, boolean>
  /** Exact permissions last accepted when a local plugin was enabled. */
  grants: Record<string, PluginPermission[]>
}

export const PLUGIN_HOST_METHODS = [
  'workspace.getContext',
  'files.list',
  'files.read',
  'files.write',
  'git.status',
  'git.changes',
  'git.diff',
  'git.stageFile',
  'git.unstageFile',
  'git.stageHunk',
  'git.commit',
  'git.push',
  'git.pullRequestUrl',
  'browser.open',
  'agent.prompt',
  'storage.get',
  'storage.set',
  'network.fetch'
] as const

export type PluginHostMethod = (typeof PLUGIN_HOST_METHODS)[number]

export type PluginBridgeRequest = {
  source: 'mxwl-plugin'
  type: 'request'
  id: string
  method: PluginHostMethod
  params?: Record<string, unknown>
}

export type PluginBridgeHello = {
  source: 'mxwl-plugin'
  type: 'ready'
}

export type PluginBridgeResponse = {
  source: 'mxwl-host'
  type: 'response'
  id: string
  result?: unknown
  error?: string
}

export type PluginBridgeReady = {
  source: 'mxwl-host'
  type: 'ready' | 'context'
  apiVersion: typeof MXWL_PLUGIN_API_VERSION
  pluginId: string
  contributionId: string
  workspace: {
    id: string
    title: string
    remotePath: string
    hostId: string
    status: string
    issueKey?: string | null
    branch?: string | null
    dirty?: boolean
  }
}

export const BUILTIN_PLUGINS: readonly PluginManifest[] = [
  {
    apiVersion: MXWL_PLUGIN_API_VERSION,
    id: 'mxwl.code',
    name: 'Code Explorer',
    version: '1.0.0',
    description: 'Browse, search, edit, and save files with Monaco.',
    author: 'mxwl',
    permissions: ['workspace:read', 'files:read', 'files:write'],
    contributes: {
      workspaceTools: [{ id: 'code', title: 'Code', icon: 'code', order: 100 }]
    }
  },
  {
    apiVersion: MXWL_PLUGIN_API_VERSION,
    id: 'mxwl.changes',
    name: 'Changes',
    version: '1.0.0',
    description: 'Review, stage, commit, push, and hand changed lines to an agent.',
    author: 'mxwl',
    permissions: ['workspace:read', 'git:read', 'git:write', 'agent:prompt', 'browser:open'],
    contributes: {
      workspaceTools: [{ id: 'changes', title: 'Changes', icon: 'diff', order: 200 }]
    }
  }
]

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,79}$/
const CONTRIBUTION_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

export function parsePluginManifest(value: unknown): PluginManifest {
  if (!isRecord(value)) throw new Error('manifest must be an object')
  if (value.apiVersion !== MXWL_PLUGIN_API_VERSION) {
    throw new Error(`apiVersion must be ${MXWL_PLUGIN_API_VERSION}`)
  }
  const id = requiredString(value.id, 'id')
  if (!ID_PATTERN.test(id)) throw new Error('id must use lowercase letters, numbers, dots, _ or -')
  if (id.startsWith('mxwl.')) throw new Error('the mxwl.* namespace is reserved for built-ins')
  const name = requiredString(value.name, 'name')
  const version = requiredString(value.version, 'version')
  if (!SEMVER_PATTERN.test(version)) throw new Error('version must be semantic versioning')
  if (!isRecord(value.contributes) || !Array.isArray(value.contributes.workspaceTools)) {
    throw new Error('contributes.workspaceTools must be an array')
  }
  if (value.contributes.workspaceTools.length === 0) {
    throw new Error('at least one workspace tool is required')
  }

  const seen = new Set<string>()
  const workspaceTools = value.contributes.workspaceTools.map((candidate, index) => {
    if (!isRecord(candidate)) throw new Error(`workspaceTools[${index}] must be an object`)
    const toolId = requiredString(candidate.id, `workspaceTools[${index}].id`)
    if (!CONTRIBUTION_ID_PATTERN.test(toolId)) {
      throw new Error(`workspaceTools[${index}].id is invalid`)
    }
    if (seen.has(toolId)) throw new Error(`duplicate workspace tool id: ${toolId}`)
    seen.add(toolId)
    const entry = requiredString(candidate.entry, `workspaceTools[${index}].entry`)
    if (entry.startsWith('/') || entry.includes('..') || !entry.endsWith('.html')) {
      throw new Error(`workspaceTools[${index}].entry must be a relative .html file`)
    }
    const icon = optionalString(candidate.icon)
    if (icon && !['code', 'diff', 'tasks', 'git', 'globe', 'puzzle'].includes(icon)) {
      throw new Error(`workspaceTools[${index}].icon is not supported`)
    }
    return {
      id: toolId,
      title: requiredString(candidate.title, `workspaceTools[${index}].title`),
      icon: icon as PluginIcon | undefined,
      order: typeof candidate.order === 'number' && Number.isFinite(candidate.order)
        ? candidate.order
        : undefined,
      entry
    }
  })

  const rawPermissions = value.permissions ?? []
  if (!Array.isArray(rawPermissions)) throw new Error('permissions must be an array')
  const permissions = rawPermissions.map((permission) => {
    if (typeof permission !== 'string' || !PLUGIN_PERMISSIONS.includes(permission as PluginPermission)) {
      throw new Error(`unsupported permission: ${String(permission)}`)
    }
    return permission as PluginPermission
  })

  return {
    apiVersion: MXWL_PLUGIN_API_VERSION,
    id,
    name,
    version,
    description: optionalString(value.description),
    author: optionalString(value.author),
    homepage: optionalString(value.homepage),
    permissions: [...new Set(permissions)],
    contributes: { workspaceTools }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`)
  return value.trim()
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
