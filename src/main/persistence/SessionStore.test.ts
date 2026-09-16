import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SessionStore } from './SessionStore'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const makeStore = (): { store: SessionStore; file: string } => {
  const dir = mkdtempSync(join(tmpdir(), 'mxwl-session-store-'))
  dirs.push(dir)
  const file = join(dir, 'session.json')
  return { store: new SessionStore(file), file }
}

describe('SessionStore', () => {
  it('round-trips renamed workspaces and terminal recovery checkpoints', () => {
    const { store, file } = makeStore()
    const state = {
      activeKey: 'local::/work/repo',
      workspaces: [
        {
          hostId: 'local',
          remotePath: '/work/repo',
          title: 'Release train',
          activeTerminalId: 'term-2',
          terminals: [
            { id: 'term-1', label: 'tests', cwd: '/work/repo', replay: 'passed\n' },
            { id: 'term-2', label: 'agent-qa', cwd: '/work/repo', aiTaskId: 'qa' }
          ]
        }
      ]
    }

    store.save(state)

    expect(store.load()).toEqual(state)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(state)
  })

  it('falls back safely when a crash leaves malformed data', () => {
    const { store, file } = makeStore()
    writeFileSync(file, '{broken', 'utf8')
    expect(store.load()).toEqual({ workspaces: [] })
  })
})
