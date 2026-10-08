import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyProject } from '../../shared/projects'
import { parseProjectSettingsBundle } from '../../shared/projectTransfer'
import type { HostConfig } from '../../shared/types'
import { ProjectManager } from './ProjectManager'
import { ProjectTransfer } from './ProjectTransfer'

vi.mock('electron', () => ({
  app: { getPath: () => '/unused' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`encrypted:${value}`)
  }
}))
const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function setup(prefix = 'source') {
  const dir = mkdtempSync(join(tmpdir(), 'mxwl-sharing-'))
  dirs.push(dir)
  const local: HostConfig = {
    id: prefix + '-local',
    kind: 'local',
    label: 'My computer',
    host: 'localhost',
    port: 0,
    username: 'developer',
    auth: { kind: 'none' },
    addedAt: 1
  }
  const data = new Map([[local.id, local]])
  const hosts = {
    list: () => structuredClone([...data.values()]),
    ensureLocal: () => structuredClone(local),
    save: vi.fn((host: HostConfig) => {
      data.set(host.id, structuredClone(host))
      return host
    }),
    delete: (id: string) => {
      data.delete(id)
    }
  }
  const file = join(dir, 'projects.json')
  const projects = new ProjectManager((id) => data.has(id), file, hosts.ensureLocal)
  const transfer = new ProjectTransfer(projects, hosts)
  return { projects, hosts, transfer, local, file }
}
function seed(source: ReturnType<typeof setup>) {
  const remote: HostConfig = {
    id: 'remote-source',
    kind: 'ssh',
    label: 'Build server',
    host: 'dev.example.test',
    port: 2222,
    username: 'dev',
    auth: { kind: 'password', encryptedPassword: 'enc:private-password' },
    addedAt: 1
  }
  source.hosts.save(remote)
  const project = source.projects.save({
    ...emptyProject(),
    label: 'Checkout',
    browserProfiles: [
      {
        id: 'qa',
        label: 'QA account',
        url: 'https://qa.example.test',
        testLogin: {
          username: 'qa',
          password: 'private-login-password',
          usernameSelector: '#u',
          passwordSelector: '#p',
          submitSelector: '#submit'
        }
      }
    ],
    defaultBrowserProfileId: 'qa',
    services: [
      {
        id: 'web',
        label: 'Web',
        start: 'npm run dev',
        stop: '',
        restart: '',
        logs: '',
        cwd: 'apps/web'
      }
    ],
    plugins: { changes: true }
  })
  const localSlot = source.projects.listLocations()[0]
  source.projects.saveLocation({
    ...localSlot,
    checkoutPath: '/home/dev/checkout',
    workspacesRoot: '/home/dev/worktrees'
  })
  const location = source.projects.saveLocation({
    projectId: project.id,
    hostId: remote.id,
    label: 'Remote checkout',
    checkoutPath: '/srv/checkout',
    workspacesRoot: '/srv/worktrees',
    folderFilter: 'checkout-*',
    appSubdirectory: 'apps/web',
    browserProfileId: 'qa',
    overrides: { browserUrl: 'http://localhost:8080', terminalStartup: 'echo ready', services: [] }
  })
  return { project, remote, location }
}

describe('project and host sharing', () => {
  it('exports selected projects and their connections without stored credentials or private fields', () => {
    const source = setup()
    const { project, remote } = seed(source)
    source.projects.save({ ...emptyProject(), label: 'Unrelated' })
    source.hosts.save({
      ...remote,
      id: 'unrelated',
      label: 'Unattached machine',
      host: 'unused.example.test'
    })
    const bundle = source.transfer.export([project.id])
    expect(bundle.projects).toHaveLength(1)
    expect(bundle.hosts).toHaveLength(2)
    expect(bundle.locations).toHaveLength(2)
    const json = JSON.stringify(bundle)
    expect(json).not.toContain('private-password')
    expect(json).not.toContain('private-login-password')
    expect(json).not.toContain('passwordEnc')
    expect(json).not.toContain('encryptedPassword')
    expect(json).not.toContain('addedAt')
    expect(bundle.projects[0].browserProfiles[0].testLogin?.username).toBe('qa')
    expect(bundle.hosts.find((h) => h.id === source.local.id)?.builtinLocal).toBe(true)
  })
  it('retains the SSH key path and authentication method while excluding key passphrases', () => {
    const source = setup()
    const { project, remote } = seed(source)
    source.hosts.save({
      ...remote,
      auth: { kind: 'key', keyPath: '~/.ssh/id_ed25519', encryptedPassphrase: 'private-passphrase' }
    })
    const bundle = source.transfer.export([project.id])
    expect(bundle.hosts.find((h) => h.id === remote.id)?.auth).toEqual({
      kind: 'key',
      keyPath: '~/.ssh/id_ed25519'
    })
    expect(JSON.stringify(bundle)).not.toContain('private-passphrase')
  })
  it('round trips into another installation with new IDs, profile references, and that machine’s local connection', () => {
    const source = setup()
    const { project } = seed(source)
    const bundle = source.transfer.export([project.id])
    const destination = setup('destination')
    const result = destination.transfer.import(bundle, [project.id])
    expect(result).toMatchObject({
      projectsAdded: 1,
      hostsAdded: 1,
      hostsReused: 1,
      locationsAdded: 2
    })
    const copy = destination.projects.get(result.projectIds[0])!
    expect(copy.id).not.toBe(project.id)
    expect(copy.services).toEqual(project.services)
    expect(copy.plugins).toEqual(project.plugins)
    expect(copy.browserProfiles[0].id).not.toBe('qa')
    expect(copy.defaultBrowserProfileId).toBe(copy.browserProfiles[0].id)
    expect(copy.browserProfiles[0].testLogin?.passwordEnc).toBe('')
    const locations = destination.projects.listLocations()
    expect(locations).toHaveLength(2)
    expect(locations.find((l) => l.builtinLocal)).toMatchObject({
      hostId: destination.local.id,
      checkoutPath: '/home/dev/checkout'
    })
    expect(locations.find((l) => !l.builtinLocal)).toMatchObject({
      browserProfileId: copy.defaultBrowserProfileId,
      appSubdirectory: 'apps/web',
      overrides: { terminalStartup: 'echo ready' }
    })
    expect(destination.hosts.list().find((h) => h.kind === 'ssh')?.auth).toEqual({
      kind: 'password',
      encryptedPassword: ''
    })
    expect(new ProjectManager(() => true, destination.file).list()).toEqual(
      destination.projects.list()
    )
  })
  it('preserves existing projects and credentials when importing copies with a matching machine connection', () => {
    const source = setup()
    const { project, remote } = seed(source)
    const before = readFileSync(source.file, 'utf8')
    const bundle = source.transfer.export([project.id])
    const result = source.transfer.import(bundle, [project.id])
    expect(result).toMatchObject({ projectsAdded: 1, hostsAdded: 0, hostsReused: 2 })
    expect(source.projects.get(project.id)).toEqual(project)
    expect(source.projects.get(result.projectIds[0])?.label).toBe('Checkout (imported)')
    expect(source.hosts.list().find((h) => h.id === remote.id)?.auth).toEqual(remote.auth)
    const again = source.transfer.import(bundle, [project.id])
    expect(source.projects.get(again.projectIds[0])?.label).toBe('Checkout (imported 2)')
    expect(readFileSync(source.file, 'utf8')).not.toBe(before)
  })
  it('shares a single imported connection across projects and preserves an unconfigured permanent local slot', () => {
    const source = setup()
    const { project, remote, location } = seed(source)
    const second = source.projects.save({ ...emptyProject(), label: 'Billing' })
    source.projects.saveLocation({
      ...location,
      id: undefined,
      projectId: second.id,
      browserProfileId: null
    })
    const destination = setup('destination')
    const bundle = source.transfer.export([project.id, second.id])
    const result = destination.transfer.import(bundle, [project.id, second.id])
    expect(result.hostsAdded).toBe(1)
    const remotes = destination.projects.listLocations().filter((l) => !l.builtinLocal)
    expect(remotes[0].hostId).toBe(remotes[1].hostId)
    expect(remotes[0].hostId).not.toBe(remote.id)
    const pending = destination.projects
      .listLocations()
      .find((l) => l.projectId === result.projectIds[1] && l.builtinLocal)!
    expect(pending.checkoutPath).toBe('')
    expect(pending.hostId).toBe(destination.local.id)
  })
  it('imports only selected projects and ignores unrelated host connections', () => {
    const source = setup()
    const { project } = seed(source)
    const second = source.projects.save({ ...emptyProject(), label: 'Billing' })
    const bundle = source.transfer.export([project.id, second.id])
    const destination = setup('destination')
    expect(destination.transfer.import(bundle, [second.id])).toMatchObject({
      projectsAdded: 1,
      hostsAdded: 0
    })
    expect(destination.projects.list()[0].label).toBe('Billing')
  })
  it.each(['reference', 'regex', 'cwd', 'profile', 'duplicate', 'version'] as const)(
    'rejects a broken %s before changing any stored settings',
    (kind) => {
      const source = setup()
      const { project } = seed(source)
      const bundle = source.transfer.export([project.id])
      if (kind === 'reference') bundle.locations[0].hostId = 'missing'
      if (kind === 'regex') bundle.projects[0].derive.folderPattern = '['
      if (kind === 'cwd') bundle.projects[0].services[0].cwd = '../../escape'
      if (kind === 'profile') bundle.projects[0].defaultBrowserProfileId = 'missing'
      if (kind === 'duplicate') bundle.projects.push(bundle.projects[0])
      if (kind === 'version') (bundle as { version: number }).version = 99
      const before = readFileSync(source.file, 'utf8')
      const hosts = source.hosts.list()
      expect(() => source.transfer.import(bundle, [project.id])).toThrow()
      expect(readFileSync(source.file, 'utf8')).toBe(before)
      expect(source.hosts.list()).toEqual(hosts)
    }
  )
  it('strips supplied secret fields from imported JSON, including plaintext test credentials', () => {
    const source = setup()
    const { project } = seed(source)
    const raw = JSON.parse(JSON.stringify(source.transfer.export([project.id])))
    raw.hosts[0].auth.encryptedPassword = 'injected-secret'
    raw.projects[0].browserProfiles[0].testLogin.password = 'injected-password'
    raw.projects[0].browserProfiles[0].testLogin.passwordEnc = 'injected-blob'
    expect(JSON.stringify(parseProjectSettingsBundle(raw))).not.toContain('injected-')
  })
  it('rolls back newly added connections if the project-store write fails', () => {
    const source = setup()
    const { project } = seed(source)
    const destination = setup('destination')
    const before = destination.hosts.list()
    vi.spyOn(destination.projects, 'addImported').mockImplementation(() => {
      throw new Error('Disk write failed')
    })
    expect(() =>
      destination.transfer.import(source.transfer.export([project.id]), [project.id])
    ).toThrow('Disk write failed')
    expect(destination.hosts.list()).toEqual(before)
    expect(destination.projects.list()).toHaveLength(0)
  })
})
