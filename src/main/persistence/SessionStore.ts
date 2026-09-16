import { app } from 'electron'
import { dirname, join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs'

export interface TerminalSessionEntry {
  id: string
  label: string
  cwd: string
  aiTaskId?: string
  tmuxName?: string
  /** A bounded screen/output checkpoint. The restored PTY itself is a fresh shell. */
  replay?: string
}

export interface SessionEntry {
  hostId: string
  remotePath: string
  title?: string
  terminals?: TerminalSessionEntry[]
  activeTerminalId?: string
}

export interface SessionState {
  workspaces: SessionEntry[]
  activeKey?: string
}

export class SessionStore {
  private filePath: string

  constructor(filePath?: string) {
    this.filePath = filePath ?? join(app.getPath('userData'), 'session.json')
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
    const dir = dirname(this.filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const tmp = `${this.filePath}.tmp`
    writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8')
    renameSync(tmp, this.filePath)
  }

  static keyFor(entry: SessionEntry): string {
    return `${entry.hostId}::${entry.remotePath}`
  }
}
