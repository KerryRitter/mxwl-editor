import { describe, expect, it } from 'vitest'
import { parsePluginManifest } from './plugins'

const manifest = {
  apiVersion: 1,
  id: 'dev.mxwl.tasks',
  name: 'Tasks',
  version: '1.0.0',
  permissions: ['workspace:read', 'agent:prompt'],
  contributes: {
    workspaceTools: [{ id: 'tasks', title: 'Tasks', icon: 'tasks', entry: 'index.html' }]
  }
}

describe('parsePluginManifest', () => {
  it('accepts a permission-scoped workspace tool', () => {
    expect(parsePluginManifest(manifest)).toMatchObject({
      id: 'dev.mxwl.tasks',
      permissions: ['workspace:read', 'agent:prompt']
    })
  })

  it('rejects reserved ids and escaping entries', () => {
    expect(() => parsePluginManifest({ ...manifest, id: 'mxwl.fake' })).toThrow('reserved')
    expect(() =>
      parsePluginManifest({
        ...manifest,
        contributes: { workspaceTools: [{ ...manifest.contributes.workspaceTools[0], entry: '../x.html' }] }
      })
    ).toThrow('relative')
  })

  it('rejects unknown permissions', () => {
    expect(() => parsePluginManifest({ ...manifest, permissions: ['electron:raw'] })).toThrow(
      'unsupported permission'
    )
  })
})
