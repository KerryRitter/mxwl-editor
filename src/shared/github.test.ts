import { describe, expect, it } from 'vitest'
import {
  githubHost,
  githubIssueNumber,
  githubRepository,
  githubRepositoryFromRemote
} from './github'

describe('GitHub repository and issue references', () => {
  const repo = { owner: 'acme', repo: 'checkout' }
  it.each([
    'git@github.com:acme/checkout.git',
    'https://github.com/acme/checkout.git',
    'ssh://git@github.com/acme/checkout.git'
  ])('reads the repository from %s', (remote) => {
    expect(githubRepositoryFromRemote(remote)).toEqual(repo)
  })
  it('keeps repository inference on the configured GitHub host', () => {
    expect(
      githubRepositoryFromRemote('git@gitlab.com:acme/checkout.git')
    ).toBeNull()
    expect(
      githubRepositoryFromRemote(
        'git@ghe.acme.test:acme/checkout.git',
        'ghe.acme.test'
      )
    ).toEqual(repo)
    expect(
      githubRepositoryFromRemote('https://github.com/acme/checkout/tree/main')
    ).toBeNull()
    expect(() => githubRepository('..', 'checkout')).toThrow()
  })
  it.each([
    '42',
    '#42',
    'GH-42',
    'gh-42',
    'acme/checkout#42',
    'ACME/Checkout#42',
    'https://github.com/acme/checkout/issues/42'
  ])('accepts issue reference %s', (key) => {
    expect(githubIssueNumber(key, repo)).toBe(42)
  })
  it.each([
    '#0',
    '-1',
    '0',
    '42oops',
    '#1.2',
    'other/checkout#42',
    'https://gitlab.com/acme/checkout/issues/42',
    'https://github.com/acme/checkout/pull/42',
    'https://github.com/acme/another/issues/42',
    '9007199254740992'
  ])('rejects an invalid or unrelated issue: %s', (key) => {
    expect(githubIssueNumber(key, repo)).toBeNull()
  })
  it('maps GitHub Enterprise web hosts to their API and accepts matching issue URLs', () => {
    expect(githubHost('https://ghe.acme.test/api/v3')).toEqual({
      host: 'ghe.acme.test',
      web: 'https://ghe.acme.test',
      api: 'https://ghe.acme.test/api/v3'
    })
    expect(githubHost('api.github.com').api).toBe('https://api.github.com')
    expect(
      githubIssueNumber(
        'https://ghe.acme.test/acme/checkout/issues/42',
        repo,
        'ghe.acme.test'
      )
    ).toBe(42)
  })
  it.each([
    'http://github.com',
    'https://token@github.com',
    'https://github.com/repos',
    'https://github.com/?token=secret'
  ])('rejects unsafe account hosts: %s', (host) => {
    expect(() => githubHost(host)).toThrow()
  })
})
