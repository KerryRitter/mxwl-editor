import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import type { AppSettings } from '../../shared/types'
import { encryptSecret, decryptSecret } from '../hosts/secrets'

const DEFAULTS: AppSettings = {
  taskProvider: 'none',
  scmProvider: 'none',
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
  private settings: AppSettings = { ...DEFAULTS }
  private loaded = false

  constructor() {
    this.filePath = join(app.getPath('userData'), 'settings.json')
  }

  private ensureLoaded(): void {
    if (this.loaded) return
    this.loaded = true
    if (!existsSync(this.filePath)) return
    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<AppSettings>
      this.settings = { ...DEFAULTS, ...raw }
    } catch {
      this.settings = { ...DEFAULTS }
    }
  }

  all(): AppSettings {
    this.ensureLoaded()
    return JSON.parse(JSON.stringify(this.settings)) as AppSettings
  }

  update(patch: Partial<AppSettings>): AppSettings {
    this.ensureLoaded()
    this.settings = { ...this.settings, ...patch }
    this.persist()
    return this.all()
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
