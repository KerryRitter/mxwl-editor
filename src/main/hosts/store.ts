import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import type { HostConfig } from '../../shared/types'

export class HostStore {
  private filePath: string
  private hosts: Map<string, HostConfig> = new Map()
  private loaded = false

  constructor() {
    this.filePath = join(app.getPath('userData'), 'hosts.json')
  }

  private ensureLoaded(): void {
    if (this.loaded) return
    this.loaded = true
    if (!existsSync(this.filePath)) return
    try {
      const raw = readFileSync(this.filePath, 'utf8')
      const arr: HostConfig[] = JSON.parse(raw)
      for (const h of arr) this.hosts.set(h.id, h)
    } catch {
      this.hosts.clear()
    }
  }

  private persist(): void {
    this.ensureLoaded()
    const dir = join(this.filePath, '..')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(this.filePath, JSON.stringify([...this.hosts.values()], null, 2), 'utf8')
  }

  all(): HostConfig[] {
    this.ensureLoaded()
    return [...this.hosts.values()].sort((a, b) => a.label.localeCompare(b.label))
  }

  get(id: string): HostConfig | undefined {
    this.ensureLoaded()
    return this.hosts.get(id)
  }

  upsert(host: HostConfig): HostConfig {
    this.ensureLoaded()
    this.hosts.set(host.id, host)
    this.persist()
    return host
  }

  delete(id: string): void {
    this.ensureLoaded()
    this.hosts.delete(id)
    this.persist()
  }
}
