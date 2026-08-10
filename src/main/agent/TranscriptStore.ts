import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { AgentTranscript, AgentTranscriptMeta } from '../../shared/types'

/** Conversations kept per folder. Old ones fall off the end rather than growing forever. */
const KEEP_PER_CWD = 100

/**
 * Agent conversations on disk, one JSON file per session under userData. They
 * outlive the process, so closing a workspace — or the app — is not the end of
 * what the agent said. Nothing here is loaded back into a live ACP session: a
 * new session has no memory of an old one, and pretending otherwise would be a
 * lie the transcript tells about the agent.
 */
export class TranscriptStore {
  private dir: string

  constructor(dir?: string) {
    this.dir = dir ?? join(app.getPath('userData'), 'agent-transcripts')
  }

  /** Newest first, for one folder or for everything. */
  list(cwd?: string): AgentTranscriptMeta[] {
    return this.readAll()
      .filter((t) => (cwd ? t.cwd === cwd : true))
      .map(toMeta)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  read(id: string): AgentTranscript | null {
    const file = this.fileFor(id)
    if (!existsSync(file)) return null
    return parse(readFileSync(file, 'utf8'))
  }

  /**
   * Writes through a temp file, because a save can land while the renderer is
   * reading the list and a half-written JSON file is worse than a stale one.
   */
  save(transcript: AgentTranscript): void {
    mkdirSync(this.dir, { recursive: true })
    const file = this.fileFor(transcript.id)
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify(transcript), 'utf8')
    renameSync(tmp, file)
    this.prune(transcript.cwd)
  }

  remove(id: string): void {
    rmSync(this.fileFor(id), { force: true })
  }

  private prune(cwd: string): void {
    const mine = this.list(cwd)
    for (const old of mine.slice(KEEP_PER_CWD)) this.remove(old.id)
  }

  private fileFor(id: string): string {
    // Ids are generated here, but a path separator arriving from IPC would write
    // outside the directory, so the name is rebuilt rather than trusted.
    return join(this.dir, `${id.replace(/[^\w-]/g, '')}.json`)
  }

  private readAll(): AgentTranscript[] {
    if (!existsSync(this.dir)) return []
    const out: AgentTranscript[] = []
    for (const name of readdirSync(this.dir)) {
      if (!name.endsWith('.json')) continue
      const t = parse(readFileSync(join(this.dir, name), 'utf8'))
      if (t) out.push(t)
    }
    return out
  }
}

function parse(raw: string): AgentTranscript | null {
  try {
    const t = JSON.parse(raw) as AgentTranscript
    return t && typeof t.id === 'string' && Array.isArray(t.messages) ? t : null
  } catch {
    // A file truncated by a crash is a lost conversation, not a broken list
    return null
  }
}

function toMeta(t: AgentTranscript): AgentTranscriptMeta {
  const { messages: _messages, ...meta } = t
  return meta
}
