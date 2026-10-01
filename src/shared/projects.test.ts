import { describe, expect, it } from 'vitest'
import {
  assertRelativeDirectory,
  emptyProject,
  resolveProjectSettings
} from './projects'
import type { ProjectConfig, ProjectLocation } from './types'

const project: ProjectConfig = {
  ...emptyProject(),
  id: 'app',
  addedAt: 1,
  label: 'App',
  browserProfiles: [
    { id: 'qa', label: 'QA', url: 'https://qa.example.test' },
    { id: 'stage', label: 'Stage', url: 'https://stage.example.test' }
  ],
  defaultBrowserProfileId: 'qa',
  services: [
    {
      id: 'web',
      label: 'Web',
      start: 'npm run dev',
      stop: '',
      restart: '',
      logs: ''
    }
  ],
  terminalStartup: 'echo app'
}
const location: ProjectLocation = {
  id: 'here',
  projectId: 'app',
  hostId: 'local',
  label: 'Local',
  checkoutPath: '/repo',
  workspacesRoot: '/work',
  folderFilter: 'app-*',
  appSubdirectory: 'apps/web',
  browserProfileId: 'stage',
  overrides: {}
}

describe('per-workspace project resolution', () => {
  it('provides safe defaults for explicitly unassigned folders', () => {
    expect(resolveProjectSettings()).toMatchObject({
      services: [],
      terminalStartup: '',
      browserUrl: '',
      browserProfile: null,
      plugins: {}
    })
  })
  it('uses project defaults without a location override', () => {
    expect(resolveProjectSettings(project)).toMatchObject({
      browserUrl: 'https://qa.example.test',
      services: project.services
    })
  })
  it('uses location profile and app directory without mutating the project', () => {
    expect(resolveProjectSettings(project, location)).toMatchObject({
      browserUrl: 'https://stage.example.test',
      appSubdirectory: 'apps/web'
    })
    expect(project.defaultBrowserProfileId).toBe('qa')
  })
  it('keeps an explicitly selected workspace profile independent of location edits', () => {
    expect(
      resolveProjectSettings(project, location, 'qa').browserProfile?.id
    ).toBe('qa')
    expect(
      resolveProjectSettings(project, location, null).browserProfile
    ).toBeNull()
  })
  it('location overrides can replace or deliberately disable project services/startup', () => {
    const config = resolveProjectSettings(project, {
      ...location,
      overrides: {
        services: [],
        terminalStartup: '',
        browserUrl: 'http://localhost:4000'
      }
    })
    expect(config).toMatchObject({
      services: [],
      terminalStartup: '',
      browserUrl: 'http://localhost:4000',
      derive: { browserUrlTemplate: '' }
    })
    expect(project.services).toHaveLength(1)
  })
  it.each([
    '../secret',
    'a/../../secret',
    '/etc',
    '~/repo',
    'C:\\temp',
    'a\\..\\secret'
  ])('rejects escaping app/service directories: %s', (value) => {
    expect(() => assertRelativeDirectory(value)).toThrow('inside the workspace')
  })
  it.each(['', 'apps/web', 'packages/api'])(
    'accepts workspace-relative app directories: %s',
    (value) => expect(() => assertRelativeDirectory(value)).not.toThrow()
  )
})
