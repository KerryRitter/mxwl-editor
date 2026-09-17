import { app, shell, type BrowserWindow } from 'electron'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync
} from 'node:fs'
import { dirname, extname, join, resolve, sep } from 'node:path'
import {
  BUILTIN_PLUGINS,
  MXWL_PLUGIN_API_VERSION,
  PLUGIN_HOST_METHODS,
  parsePluginManifest,
  type InvalidPluginInfo,
  type PluginCatalogEntry,
  type PluginHostMethod,
  type PluginInfo,
  type PluginManifest,
  type PluginPermission
} from '../../shared/plugins'
import type { SettingsStore } from '../persistence/SettingsStore'
import type { WorkspaceManager } from '../workspace/WorkspaceManager'
import type { AgentController } from '../agent/AgentController'

const MAX_RESOURCE_BYTES = 2 * 1024 * 1024
const MAX_STORAGE_BYTES = 256 * 1024
const MAX_HTTP_BYTES = 2 * 1024 * 1024

type LoadedUserPlugin = {
  info: PluginInfo
  root: string
}

type PluginCall = {
  pluginId: string
  wsId: string
  method: PluginHostMethod
  params?: Record<string, unknown>
}

const METHOD_PERMISSION: Record<PluginHostMethod, PluginPermission> = {
  'workspace.getContext': 'workspace:read',
  'files.list': 'files:read',
  'files.read': 'files:read',
  'files.write': 'files:write',
  'git.status': 'git:read',
  'git.changes': 'git:read',
  'git.diff': 'git:read',
  'git.stageFile': 'git:write',
  'git.unstageFile': 'git:write',
  'git.stageHunk': 'git:write',
  'git.commit': 'git:write',
  'git.push': 'git:write',
  'git.pullRequestUrl': 'git:read',
  'browser.open': 'browser:open',
  'agent.prompt': 'agent:prompt',
  'storage.get': 'storage',
  'storage.set': 'storage',
  'network.fetch': 'network:fetch'
}

export class PluginManager {
  private userPlugins = new Map<string, LoadedUserPlugin>()
  private invalidPlugins: InvalidPluginInfo[] = []
  private revision = 0

  constructor(
    private settings: SettingsStore,
    private workspaces: WorkspaceManager,
    private agents: AgentController,
    private getSender: () => BrowserWindow | null
  ) {
    this.reload(false)
  }

  directory(): string {
    return join(app.getPath('userData'), 'plugins')
  }

  list(): PluginCatalogEntry[] {
    const builtins: PluginInfo[] = BUILTIN_PLUGINS.map((manifest) => ({
      ...manifest,
      source: 'builtin',
      enabled: this.isEnabled(manifest.id, 'builtin'),
      revision: 0
    }))
    const users = [...this.userPlugins.values()].map(({ info }) => ({
      ...info,
      enabled: this.isEnabled(info.id, 'user', info.permissions),
      permissionReviewRequired: this.permissionReviewRequired(info.id, info.permissions)
    }))
    return [...builtins, ...users, ...this.invalidPlugins].sort((a, b) =>
      a.name.localeCompare(b.name)
    )
  }

  setEnabled(id: string, enabled: boolean): PluginCatalogEntry[] {
    const exists = BUILTIN_PLUGINS.some((plugin) => plugin.id === id) || this.userPlugins.has(id)
    if (!exists) throw new Error('plugin not found')
    const current = this.settings.all().plugins
    const user = this.userPlugins.get(id)
    this.settings.update({
      plugins: {
        enabled: { ...current.enabled, [id]: enabled },
        grants:
          enabled && user
            ? { ...current.grants, [id]: [...(user.info.permissions ?? [])] }
            : current.grants
      }
    })
    this.emitChanged()
    return this.list()
  }

  reload(notify = true): PluginCatalogEntry[] {
    this.revision += 1
    const pluginsDir = this.directory()
    mkdirSync(pluginsDir, { recursive: true })
    const next = new Map<string, LoadedUserPlugin>()
    const invalid: InvalidPluginInfo[] = []

    for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const root = join(pluginsDir, entry.name)
      const manifestPath = join(root, 'mxwl.plugin.json')
      if (!existsSync(manifestPath)) continue
      try {
        const manifest = parsePluginManifest(JSON.parse(readFileSync(manifestPath, 'utf8')))
        if (next.has(manifest.id)) throw new Error(`duplicate plugin id: ${manifest.id}`)
        validateEntries(root, manifest)
        next.set(manifest.id, {
          root,
          info: {
            ...manifest,
            source: 'user',
            enabled: this.isEnabled(manifest.id, 'user', manifest.permissions),
            revision: this.revision,
            directory: root
          }
        })
      } catch (error) {
        invalid.push({
          apiVersion: MXWL_PLUGIN_API_VERSION,
          id: `invalid.${entry.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`,
          name: entry.name,
          version: '0.0.0',
          description: 'This plugin could not be loaded.',
          source: 'user',
          enabled: false,
          revision: this.revision,
          error: errorText(error),
          permissions: [],
          contributes: { workspaceTools: [] },
          directory: root
        })
      }
    }

    this.userPlugins = next
    this.invalidPlugins = invalid
    if (notify) this.emitChanged()
    return this.list()
  }

  async openDirectory(): Promise<void> {
    mkdirSync(this.directory(), { recursive: true })
    const error = await shell.openPath(this.directory())
    if (error) throw new Error(error)
  }

  resource(rawUrl: string): Response {
    try {
      const url = new URL(rawUrl)
      const pluginId = decodeURIComponent(url.hostname)
      const loaded = this.requireUserPlugin(pluginId)
      if (!this.isEnabled(pluginId, 'user', loaded.info.permissions)) {
        throw new Error('plugin is disabled')
      }
      const relative = url.pathname
        .split('/')
        .filter(Boolean)
        .map((part) => decodeURIComponent(part))
        .join('/')
      if (!relative) throw new Error('plugin resource not found')
      const file = safePluginFile(loaded.root, relative)
      const content = readFileSync(file)
      if (content.byteLength > MAX_RESOURCE_BYTES) throw new Error('plugin resource exceeds 2 MB')
      const headers: Record<string, string> = {
        'Content-Type': resourceContentType(file),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store'
      }
      const pluginOrigin = `${url.protocol}//${url.host}`
      headers['Content-Security-Policy'] =
        `default-src 'none'; script-src ${pluginOrigin}; style-src 'unsafe-inline' ${pluginOrigin}; img-src data: ${pluginOrigin}; font-src data: ${pluginOrigin}; connect-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'`
      return new Response(new Uint8Array(content), { status: 200, headers })
    } catch (error) {
      return new Response(errorText(error), {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
      })
    }
  }

  async call(input: PluginCall): Promise<unknown> {
    if (!PLUGIN_HOST_METHODS.includes(input.method)) throw new Error('unsupported plugin method')
    const loaded = this.requireUserPlugin(input.pluginId)
    if (!this.isEnabled(input.pluginId, 'user', loaded.info.permissions)) {
      throw new Error('plugin is disabled')
    }
    const permission = METHOD_PERMISSION[input.method]
    if (!loaded.info.permissions?.includes(permission)) {
      throw new Error(`plugin lacks ${permission} permission`)
    }
    const workspace = this.workspaces.get(input.wsId)?.state
    if (!workspace) throw new Error('workspace not found')
    const params = input.params ?? {}

    switch (input.method) {
      case 'workspace.getContext':
        return workspaceContext(workspace)
      case 'files.list':
        return this.workspaces
          .listFiles(input.wsId, optionalText(params.query, 200))
          .then((paths) => paths.map((path) => relativeWorkspacePath(workspace.remotePath, path)))
      case 'files.read':
        return this.workspaces.fsReadFile(
          input.wsId,
          workspacePath(workspace.remotePath, requiredText(params.path, 'path', 4_096))
        )
      case 'files.write':
        return this.workspaces.fsWriteFile(
          input.wsId,
          workspacePath(workspace.remotePath, requiredText(params.path, 'path', 4_096)),
          requiredText(params.content, 'content', 5 * 1024 * 1024, true)
        )
      case 'git.status':
        return this.workspaces.refreshGit(input.wsId)
      case 'git.changes':
        return this.workspaces.gitChanges(input.wsId)
      case 'git.diff':
        return this.workspaces.gitFileDiff(input.wsId, requiredText(params.path, 'path', 4_096))
      case 'git.stageFile':
        return this.workspaces.gitStageFile(input.wsId, requiredText(params.path, 'path', 4_096))
      case 'git.unstageFile':
        return this.workspaces.gitUnstageFile(input.wsId, requiredText(params.path, 'path', 4_096))
      case 'git.stageHunk':
        return this.workspaces.gitStageHunk(
          input.wsId,
          requiredText(params.path, 'path', 4_096),
          requiredText(params.hunkId, 'hunkId', 512)
        )
      case 'git.commit':
        return this.workspaces.gitCommit(input.wsId, requiredText(params.message, 'message', 500))
      case 'git.push':
        return this.workspaces.gitPush(input.wsId)
      case 'git.pullRequestUrl':
        return this.workspaces.gitPullRequestUrl(input.wsId)
      case 'browser.open': {
        const url = safeWebUrl(requiredText(params.url, 'url', 8_192))
        return this.workspaces.browserNewTab(input.wsId, url)
      }
      case 'agent.prompt':
        return this.agents.prompt(input.wsId, requiredText(params.text, 'text', 100_000))
      case 'storage.get':
        return this.storage(input.pluginId)[requiredText(params.key, 'key', 128)] ?? null
      case 'storage.set': {
        const key = requiredText(params.key, 'key', 128)
        const data = this.storage(input.pluginId)
        data[key] = params.value
        this.writeStorage(input.pluginId, data)
        return null
      }
      case 'network.fetch':
        return pluginFetch(params)
    }
  }

  private isEnabled(
    id: string,
    source: 'builtin' | 'user',
    permissions: readonly PluginPermission[] = []
  ): boolean {
    const settings = this.settings.all().plugins
    const requested = settings.enabled[id] ?? source === 'builtin'
    return source === 'builtin' ? requested : requested && samePermissions(settings.grants[id], permissions)
  }

  private permissionReviewRequired(
    id: string,
    permissions: readonly PluginPermission[] = []
  ): boolean {
    const settings = this.settings.all().plugins
    return settings.enabled[id] === true && !samePermissions(settings.grants[id], permissions)
  }

  private requireUserPlugin(id: string): LoadedUserPlugin {
    const loaded = this.userPlugins.get(id)
    if (!loaded) throw new Error('user plugin not found')
    return loaded
  }

  private storagePath(id: string): string {
    return join(app.getPath('userData'), 'plugin-data', `${id}.json`)
  }

  private storage(id: string): Record<string, unknown> {
    const file = this.storagePath(id)
    if (!existsSync(file)) return {}
    try {
      const value = JSON.parse(readFileSync(file, 'utf8'))
      return isRecord(value) ? value : {}
    } catch {
      return {}
    }
  }

  private writeStorage(id: string, data: Record<string, unknown>): void {
    const serialized = JSON.stringify(data, null, 2)
    if (Buffer.byteLength(serialized, 'utf8') > MAX_STORAGE_BYTES) {
      throw new Error('plugin storage exceeds 256 KB')
    }
    const file = this.storagePath(id)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, serialized, 'utf8')
  }

  private emitChanged(): void {
    this.getSender()?.webContents.send('plugins:changed', this.list())
  }
}

function validateEntries(root: string, manifest: PluginManifest): void {
  for (const contribution of manifest.contributes.workspaceTools) {
    if (!contribution.entry) throw new Error(`${contribution.id} is missing its entry`)
    const file = safePluginFile(root, contribution.entry)
    if (!existsSync(file)) throw new Error(`entry not found: ${contribution.entry}`)
  }
}

function safePluginFile(root: string, relative: string): string {
  const realRoot = realpathSync(root)
  const requested = resolve(realRoot, relative)
  if (!requested.startsWith(`${realRoot}${sep}`)) throw new Error('plugin entry escapes its directory')
  const realFile = realpathSync(requested)
  if (!realFile.startsWith(`${realRoot}${sep}`)) throw new Error('plugin entry symlink escapes its directory')
  return realFile
}

function resourceContentType(file: string): string {
  switch (extname(file).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.woff2':
      return 'font/woff2'
    default:
      return 'application/octet-stream'
  }
}

function workspaceContext(workspace: ReturnType<WorkspaceManager['list']>[number]) {
  return {
    id: workspace.id,
    title: workspace.title,
    remotePath: workspace.remotePath,
    hostId: workspace.hostId,
    status: workspace.status,
    issueKey: workspace.derived.issueKey,
    branch: workspace.derived.branch,
    dirty: workspace.derived.dirty
  }
}

function workspacePath(root: string, relative: string): string {
  const normalized = relative.replaceAll('\\', '/')
  if (normalized.startsWith('/') || normalized.split('/').some((part) => part === '..')) {
    throw new Error('plugin file paths must stay inside the workspace')
  }
  return `${root.replace(/\/$/, '')}/${normalized.replace(/^\.\//, '')}`
}

function relativeWorkspacePath(root: string, path: string): string {
  const prefix = `${root.replace(/\/$/, '')}/`
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}

function safeWebUrl(value: string): string {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('only http(s) URLs are allowed')
  return url.toString()
}

async function pluginFetch(params: Record<string, unknown>): Promise<unknown> {
  const url = safeWebUrl(requiredText(params.url, 'url', 8_192))
  const method = optionalText(params.method, 16).toUpperCase() || 'GET'
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    throw new Error('unsupported HTTP method')
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(url, {
      method,
      headers: stringRecord(params.headers),
      body: method === 'GET' ? undefined : optionalText(params.body, MAX_HTTP_BYTES),
      signal: controller.signal,
      redirect: 'follow'
    })
    const body = await response.text()
    if (Buffer.byteLength(body, 'utf8') > MAX_HTTP_BYTES) throw new Error('response exceeds 2 MB')
    return {
      status: response.status,
      ok: response.ok,
      headers: Object.fromEntries(
        [...response.headers.entries()].filter(([name]) => name.toLowerCase() !== 'set-cookie')
      ),
      body
    }
  } finally {
    clearTimeout(timer)
  }
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined
  const entries = Object.entries(value)
  if (entries.length > 50) throw new Error('too many HTTP headers')
  return Object.fromEntries(entries.map(([key, item]) => [key, String(item).slice(0, 8_192)]))
}

function requiredText(
  value: unknown,
  field: string,
  max: number,
  allowEmpty = false
): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) throw new Error(`${field} is required`)
  if (value.length > max) throw new Error(`${field} is too long`)
  return allowEmpty ? value : value.trim()
}

function optionalText(value: unknown, max: number): string {
  if (value == null) return ''
  if (typeof value !== 'string') throw new Error('expected text')
  if (value.length > max) throw new Error('text is too long')
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function samePermissions(
  granted: readonly PluginPermission[] | undefined,
  requested: readonly PluginPermission[]
): boolean {
  if (!granted || granted.length !== requested.length) return false
  const accepted = new Set(granted)
  return requested.every((permission) => accepted.has(permission))
}
