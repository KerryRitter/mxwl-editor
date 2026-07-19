import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

export interface SessionEntry {
  hostId: string
  remotePath: string
}

export interface SessionState {
  workspaces: SessionEntry[]
  activeKey?: string
}

export class SessionStore {
  private filePath: string

  constructor() {
    this.filePath = join(app.getPath('userData'), 'session.json')
  }

  load(): SessionState {
    if (!existsSync(this.filePath)) return { workspaces: [] }
    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as SessionState
      return { workspaces: raw.workspaces ?? [], activeKey: raw.activeKey }
    } catch {
      return { workspaces: [] }
    }
  }

  save(state: SessionState): void {
    const dir = join(this.filePath, '..')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(state, null, 2), 'utf8')
  }

  static keyFor(entry: SessionEntry): string {
    return `${entry.hostId}::${entry.remotePath}`
  }
}
