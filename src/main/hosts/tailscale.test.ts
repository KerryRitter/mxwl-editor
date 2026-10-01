import { describe, expect, it, vi } from 'vitest'
import { discoverTailscale, parseTailscaleStatus } from './tailscale'

const peer = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  ID: 'dev', HostName: 'devbox', DNSName: 'devbox.tail.example.', OS: 'linux',
  TailscaleIPs: ['fd7a:115c:a1e0::1', '100.64.0.2'], Online: true,
  sshHostKeys: ['ssh-ed25519 AAAA'], Tags: ['tag:dev'], ...patch
})
const status = (Peer: Record<string, unknown>, patch: Record<string, unknown> = {}): string => JSON.stringify({
  BackendState: 'Running', CurrentTailnet: { Name: 'example.com' }, Self: { ID: 'self' }, Peer, ...patch
})

describe('Tailscale discovery', () => {
  it('reads SSH-advertised peers, strips DNS dot, and prefers a mesh IPv4 address', () => {
    const result = parseTailscaleStatus(status({ dev: peer() }), 'local-user')
    expect(result).toMatchObject({ state: 'ready', tailnet: 'example.com', suggestedUsername: 'local-user' })
    expect(result.devices).toEqual([{
      id: 'dev', name: 'devbox', dnsName: 'devbox.tail.example', os: 'linux',
      address: '100.64.0.2', ips: ['fd7a:115c:a1e0::1', '100.64.0.2'],
      online: true, sshAdvertised: true, tags: ['tag:dev']
    }])
  })

  it('does not infer SSH access from visibility or OS and sorts online devices first', () => {
    const result = parseTailscaleStatus(status({
      offline: peer({ ID: 'offline', HostName: 'aaa', Online: false }),
      ordinary: peer({ ID: 'ordinary', HostName: 'zzz', sshHostKeys: null, Tags: null })
    }), 'user')
    expect(result.devices.map((device) => [device.id, device.sshAdvertised])).toEqual([
      ['ordinary', false], ['offline', true]
    ])
  })

  it('omits expired, self, sharee-only, malformed and unaddressable peers', () => {
    expect(parseTailscaleStatus(status({
      self: peer({ ID: 'self' }), expired: peer({ Expired: true }),
      sharee: peer({ ShareeNode: true }), noIp: peer({ TailscaleIPs: ['invalid'] }),
      malformed: 'invalid', good: peer()
    }), 'user').devices).toHaveLength(1)
  })

  it('supports IPv6-only peers and absent optional fields', () => {
    expect(parseTailscaleStatus(status({ ipv6: { TailscaleIPs: ['fd7a:115c:a1e0::2'] } }), 'user').devices[0])
      .toMatchObject({ id: 'ipv6', address: 'fd7a:115c:a1e0::2', online: false, sshAdvertised: false })
    expect(parseTailscaleStatus(status({}, { Peer: null, CurrentTailnet: null }), 'user').devices).toEqual([])
  })

  it.each(['NeedsLogin', 'NeedsMachineAuth', 'NoState'])('explains %s without listing stale peers', (BackendState) => {
    expect(parseTailscaleStatus(status({ dev: peer() }, { BackendState }), 'user'))
      .toMatchObject({ state: 'logged-out', devices: [] })
  })

  it('explains a stopped daemon', () => {
    expect(parseTailscaleStatus(status({ dev: peer() }, { BackendState: 'Stopped' }), 'user'))
      .toMatchObject({ state: 'stopped', devices: [] })
  })

  it('tries known macOS executable locations only when the previous one is absent', async () => {
    const run = vi.fn().mockRejectedValueOnce(Object.assign(new Error('absent'), { code: 'ENOENT' }))
      .mockResolvedValueOnce(status({ dev: peer() }))
    expect((await discoverTailscale(run, 'darwin', 'user')).state).toBe('ready')
    expect(run.mock.calls).toEqual([['tailscale'], ['/Applications/Tailscale.app/Contents/MacOS/Tailscale']])
  })

  it('reports missing CLI without attempting installation', async () => {
    const run = vi.fn().mockRejectedValue(Object.assign(new Error('absent'), { code: 'ENOENT' }))
    expect(await discoverTailscale(run, 'win32', 'user')).toMatchObject({ state: 'missing', devices: [] })
    expect(run).toHaveBeenCalledTimes(2)
  })

  it.each(['not-json', '{}'])('reports invalid status output rather than a misleading empty list', async (output) => {
    expect((await discoverTailscale(async () => output, 'linux', 'user')).state).toBe('error')
  })

  it('reports a CLI timeout without retrying every location', async () => {
    const run = vi.fn().mockRejectedValue(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }))
    expect((await discoverTailscale(run, 'linux', 'user')).state).toBe('error')
    expect(run).toHaveBeenCalledTimes(1)
  })
})
