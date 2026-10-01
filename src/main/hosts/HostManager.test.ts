import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ userData: '' }))
vi.mock('electron', () => ({ app: { getPath: () => fixture.userData } }))
import { HostStore } from './store'
import { HostManager } from './HostManager'

afterEach(() => {
  if (fixture.userData)
    rmSync(fixture.userData, { recursive: true, force: true })
})

describe('permanent local connection', () => {
  it('keeps the same local machine when other connections sort earlier or labels change, including after restart', () => {
    fixture.userData = mkdtempSync(join(tmpdir(), 'mxwl-local-test-'))
    const manager = new HostManager(new HostStore())
    const original = manager.ensureLocal()
    manager.save({
      ...original,
      id: 'another-local',
      label: 'AAA Build machine'
    })
    expect(manager.ensureLocal().id).toBe(original.id)
    manager.save({ ...original, label: 'ZZZ Laptop' })
    expect(new HostManager(new HostStore()).ensureLocal().id).toBe(original.id)
    expect(() => manager.save({ ...original, kind: 'ssh' })).toThrow(
      'cannot be converted'
    )
  })
})
