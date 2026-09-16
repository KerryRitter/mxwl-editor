import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import type { AppSettings } from '../../shared/types'
import { DEFAULT_AI_SETTINGS } from '../../shared/aiCli'
import { DEFAULT_AGENT_SETTINGS } from '../../shared/acpAgents'
import { encryptSecret, decryptSecret } from '../hosts/secrets'
import { randomBytes } from 'node:crypto'

const DEFAULTS: AppSettings = {
  taskProvider: 'none',
  scmProvider: 'none',
  ai: { ...DEFAULT_AI_SETTINGS },
  agent: { ...DEFAULT_AGENT_SETTINGS },
  notifications: {
    delivery: 'in-app',
    delaySeconds: 1,
    sound: true,
    suppressActiveWorkspace: true,
    mutedAgents: []
  },
  control: {
    enabled: true,
    port: 9233,
    remoteAccess: false,
    authToken: ''
  },
  runtime: {
    keepAlive: true,
    launchAtLogin: false
  },
  jira: null,
  bitbucket: null,
  defaultBrowserUrl: '',
  cdpPort: 9222,
  mcpAuthToken: '',
  theme: 'dark',
  hideExtra: []
}

export class SettingsStore {
  private filePath: string
  private settings: AppSettings = structuredClone(DEFAULTS)
  private loaded = false
  private listeners = new Set<(settings: AppSettings) => void>()

  constructor() {
    this.filePath = join(app.getPath('userData'), 'settings.json')
  }

  private ensureLoaded(): void {
    if (this.loaded) return
    this.loaded = true
    if (existsSync(this.filePath)) {
      try {
        const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<AppSettings>
        // Nested settings need their own merges so newly added keys keep defaults.
        this.settings = {
          ...DEFAULTS,
          ...raw,
          ai: { ...DEFAULT_AI_SETTINGS, ...(raw.ai ?? {}) },
          agent: { ...DEFAULT_AGENT_SETTINGS, ...(raw.agent ?? {}) },
          notifications: { ...DEFAULTS.notifications, ...(raw.notifications ?? {}) },
          control: { ...DEFAULTS.control, ...(raw.control ?? {}) },
          runtime: { ...DEFAULTS.runtime, ...(raw.runtime ?? {}) }
        }
      } catch {
        this.settings = structuredClone(DEFAULTS)
      }
    }
    if (!this.settings.control.authToken) {
      this.settings.control.authToken = randomBytes(24).toString('base64url')
      this.persist()
    }
  }

  all(): AppSettings {
    this.ensureLoaded()
    return JSON.parse(JSON.stringify(this.settings)) as AppSettings
  }

  update(patch: Partial<AppSettings>): AppSettings {
    this.ensureLoaded()
    this.settings = {
      ...this.settings,
      ...patch,
      ai: patch.ai ? { ...this.settings.ai, ...patch.ai } : this.settings.ai,
      agent: patch.agent ? { ...this.settings.agent, ...patch.agent } : this.settings.agent,
      notifications: patch.notifications
        ? { ...this.settings.notifications, ...patch.notifications }
        : this.settings.notifications,
      control: patch.control ? { ...this.settings.control, ...patch.control } : this.settings.control,
      runtime: patch.runtime ? { ...this.settings.runtime, ...patch.runtime } : this.settings.runtime
    }
    this.persist()
    const snapshot = this.all()
    for (const listener of this.listeners) listener(snapshot)
    return snapshot
  }

  subscribe(listener: (settings: AppSettings) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private persist(): void {
    const dir = join(this.filePath, '..')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), 'utf8')
  }

  decryptJiraToken(): string {
    this.ensureLoaded()
    return this.settings.jira ? decryptSecret(this.settings.jira.apiTokenEnc) : ''
  }

  decryptBitbucketPassword(): string {
    this.ensureLoaded()
    return this.settings.bitbucket ? decryptSecret(this.settings.bitbucket.appPasswordEnc) : ''
  }
}

export { encryptSecret, decryptSecret }
