import { describe, expect, it } from 'vitest'
import { workspacePersistenceKey } from './workspaceIdentity'
import { folderForTarget } from './aiPrompt'

describe('project-scoped workspace identity', () => {
  it('keeps UI preferences independent for monorepo apps and test accounts', () => {
    const base = { hostId: 'local', remotePath: '/repo', locationId: 'web', browserProfileId: 'qa' }
    expect(workspacePersistenceKey(base)).not.toBe(workspacePersistenceKey({ ...base, locationId: 'api' }))
    expect(workspacePersistenceKey(base)).not.toBe(workspacePersistenceKey({ ...base, browserProfileId: 'admin' }))
  })
  it('names branches with a project slug to avoid cross-app collisions', () => {
    const target = { key: 'PROJ-42', title: 'Fix checkout' }
    expect(folderForTarget(target, '${project}-${keyLower}', 'Myapp App')).toBe('myapp-app-proj-42')
    expect(folderForTarget(target, '${project}-${keyLower}', 'Marketing')).toBe('marketing-proj-42')
  })
})
