import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyProject } from '../../shared/projects'
import { ProjectManager } from './ProjectManager'

vi.mock('electron', () => ({
  app: { getPath: () => '/unused' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`encrypted:${value}`)
  }
}))
const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true })
})
function manager() {
  const dir = mkdtempSync(join(tmpdir(), 'mxwl-project-test-'))
  dirs.push(dir)
  const file = join(dir, 'projects.json')
  return {
    store: new ProjectManager((id) => ['local', 'remote'].includes(id), file),
    file
  }
}

describe('ProjectManager', () => {
  it('creates a permanent local host slot without guessing paths and keeps its identity on configuration/reload', () => {
    const { file } = manager()
    const local = () => ({ id: 'local' })
    const store = new ProjectManager(() => true, file, local)
    const project = store.save({ ...emptyProject(), label: 'App' })
    const pending = store.listLocations()[0]
    expect(pending).toMatchObject({
      projectId: project.id,
      hostId: 'local',
      builtinLocal: true,
      checkoutPath: ''
    })
    expect(() => store.resolve(pending.id)).toThrow('checkout path')
    expect(() => store.deleteLocation(pending.id)).toThrow('cannot be removed')
    const configured = store.saveLocation({
      ...pending,
      id: undefined,
      checkoutPath: '/repo'
    })
    expect(configured.id).toBe(pending.id)
    expect(configured.builtinLocal).toBe(true)
    expect(() =>
      store.saveLocation({ ...configured, hostId: 'remote' })
    ).toThrow('cannot be moved')
    const extra = store.saveLocation({
      ...configured,
      id: undefined,
      label: 'Staging',
      checkoutPath: '/staging'
    })
    expect(extra.builtinLocal).toBeUndefined()
    store.save({ ...emptyProject(), id: project.id, label: 'Renamed' })
    const reloaded = new ProjectManager(() => true, file, local)
    expect(reloaded.listLocations().filter((l) => l.builtinLocal)).toHaveLength(
      1
    )
    expect(reloaded.resolve(configured.id).location.checkoutPath).toBe('/repo')
    reloaded.deleteLocation(extra.id)
    expect(() => reloaded.deleteLocation(configured.id)).toThrow(
      'cannot be removed'
    )
    reloaded.delete(project.id)
    expect(reloaded.listLocations()).toHaveLength(0)
  })
  it('protects existing local checkouts without changing their paths or IDs, and adds missing local slots', () => {
    const { store, file } = manager()
    const a = store.save({ ...emptyProject(), label: 'A' })
    const b = store.save({ ...emptyProject(), label: 'B' })
    const original = store.saveLocation({
      projectId: a.id,
      hostId: 'local',
      label: 'Main',
      checkoutPath: '/existing',
      workspacesRoot: '/work',
      folderFilter: 'app-*',
      appSubdirectory: 'apps/web',
      browserProfileId: null,
      overrides: {}
    })
    const upgraded = new ProjectManager(
      () => true,
      file,
      () => ({ id: 'local' })
    )
    expect(upgraded.getLocation(original.id)).toEqual({
      ...original,
      builtinLocal: true
    })
    expect(
      upgraded.listLocations().find((l) => l.projectId === b.id)
    ).toMatchObject({ builtinLocal: true, checkoutPath: '' })
    expect(upgraded.listLocations()).toHaveLength(2)
  })
  it('persists independent projects with many-to-many host locations', () => {
    const { store, file } = manager()
    const a = store.save({ ...emptyProject(), label: 'Example App' }),
      b = store.save({ ...emptyProject(), label: 'Site' })
    for (const project of [a, b])
      for (const hostId of ['local', 'remote'])
        store.saveLocation({
          projectId: project.id,
          hostId,
          label: hostId,
          checkoutPath: `/work/${project.label}`,
          workspacesRoot: '/work',
          folderFilter: '',
          appSubdirectory: '',
          browserProfileId: null,
          overrides: {}
        })
    const loaded = new ProjectManager(() => true, file)
    expect(loaded.list()).toHaveLength(2)
    expect(loaded.listLocations()).toHaveLength(4)
    expect(loaded.resolve(loaded.listLocations()[0].id).project.label).toBe(
      'Example App'
    )
  })
  it('encrypts test passwords, preserves blank edits, and clears only explicitly', () => {
    const { store, file } = manager()
    const input = {
      ...emptyProject(),
      label: 'Example App',
      browserProfiles: [
        {
          id: 'qa',
          label: 'QA',
          url: 'https://qa.example.test',
          testLogin: {
            username: 'qa',
            password: 'secret-not-plaintext',
            usernameSelector: '#u',
            passwordSelector: '#p',
            submitSelector: '#submit'
          }
        }
      ],
      defaultBrowserProfileId: 'qa'
    }
    const saved = store.save(input)
    expect(readFileSync(file, 'utf8')).not.toContain('secret-not-plaintext')
    const edited = store.save({
      ...input,
      id: saved.id,
      browserProfiles: [
        {
          ...input.browserProfiles[0],
          testLogin: { ...input.browserProfiles[0].testLogin, password: '' }
        }
      ]
    })
    expect(edited.browserProfiles[0].testLogin?.passwordEnc).toBe(
      saved.browserProfiles[0].testLogin?.passwordEnc
    )
    const cleared = store.save({
      ...input,
      id: saved.id,
      browserProfiles: [{ ...input.browserProfiles[0], testLogin: null }]
    })
    expect(cleared.browserProfiles[0].testLogin).toBeUndefined()
  })
  it('rejects missing references, invalid profiles, and cross-host resolution', () => {
    const { store } = manager()
    const project = store.save({ ...emptyProject(), label: 'App' })
    const input = {
      projectId: project.id,
      hostId: 'local',
      label: 'Local',
      checkoutPath: '/repo',
      workspacesRoot: '/work',
      folderFilter: '',
      appSubdirectory: '',
      browserProfileId: null,
      overrides: {}
    }
    expect(() => store.saveLocation({ ...input, hostId: 'missing' })).toThrow(
      'not found'
    )
    expect(() =>
      store.saveLocation({ ...input, browserProfileId: 'missing' })
    ).toThrow('profile not found')
    const saved = store.saveLocation(input)
    expect(() => store.resolve(saved.id, 'remote')).toThrow('different host')
  })
  it('refuses malformed data without overwriting it', () => {
    const { store, file } = manager()
    writeFileSync(file, '{broken')
    expect(() => store.save({ ...emptyProject(), label: 'App' })).toThrow()
    expect(readFileSync(file, 'utf8')).toBe('{broken')
  })
  it('deleting a project removes its locations but leaves other projects intact', () => {
    const { store } = manager()
    const a = store.save({ ...emptyProject(), label: 'A' }),
      b = store.save({ ...emptyProject(), label: 'B' })
    store.saveLocation({
      projectId: a.id,
      hostId: 'local',
      label: 'Local',
      checkoutPath: '/repo',
      workspacesRoot: '/work',
      folderFilter: '',
      appSubdirectory: '',
      browserProfileId: null,
      overrides: {}
    })
    store.delete(a.id)
    expect(store.listLocations()).toHaveLength(0)
    expect(store.get(b.id)?.label).toBe('B')
  })
})
