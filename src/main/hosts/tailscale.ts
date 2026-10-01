import { execFile } from 'node:child_process'
import { userInfo } from 'node:os'
import { isIP } from 'node:net'
import { z } from 'zod'
import type { TailscaleDiscovery } from '../../shared/tailscale'

const peerSchema = z.object({
  ID: z.string().optional(),
  HostName: z.string().optional(),
  DNSName: z.string().optional(),
  OS: z.string().optional(),
  TailscaleIPs: z.array(z.string()).nullish(),
  Online: z.boolean().optional(),
  Expired: z.boolean().optional(),
  ShareeNode: z.boolean().optional(),
  sshHostKeys: z.array(z.string()).nullish(),
  Tags: z.array(z.string()).nullish()
})

const statusSchema = z.object({
  BackendState: z.string(),
  CurrentTailnet: z.object({ Name: z.string().optional() }).nullish(),
  Self: z.object({ ID: z.string().optional() }).nullish(),
  Peer: z.record(z.unknown()).nullish()
})

export function parseTailscaleStatus(json: string, suggestedUsername: string): TailscaleDiscovery {
  const status = statusSchema.parse(JSON.parse(json))
  const result: TailscaleDiscovery = {
    state: 'ready',
    message: '',
    tailnet: status.CurrentTailnet?.Name ?? '',
    suggestedUsername,
    devices: []
  }
  if (status.BackendState !== 'Running') {
    const loggedOut = ['NeedsLogin', 'NeedsMachineAuth', 'NoState'].includes(status.BackendState)
    return {
      ...result,
      state: loggedOut ? 'logged-out' : 'stopped',
      message: loggedOut
        ? 'Sign in to Tailscale and approve this machine, then refresh.'
        : `Tailscale is ${status.BackendState}. Connect Tailscale, then refresh.`
    }
  }
  for (const [key, value] of Object.entries(status.Peer ?? {})) {
    const parsed = peerSchema.safeParse(value)
    if (!parsed.success) continue
    const peer = parsed.data
    if (peer.ShareeNode || peer.Expired || (peer.ID && peer.ID === status.Self?.ID)) continue
    const ips = (peer.TailscaleIPs ?? []).filter((ip) => isIP(ip) !== 0)
    const address = ips.find((ip) => isIP(ip) === 4) ?? ips[0]
    if (!address) continue
    const dnsName = (peer.DNSName ?? '').replace(/\.$/, '')
    result.devices.push({
      id: peer.ID ?? key,
      name: peer.HostName || dnsName || address,
      dnsName,
      address,
      ips,
      os: peer.OS ?? '',
      online: peer.Online === true,
      sshAdvertised: (peer.sshHostKeys ?? []).some((key) => key.trim().length > 0),
      tags: peer.Tags ?? []
    })
  }
  result.devices.sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name))
  return result
}

export type StatusRunner = (executable: string) => Promise<string>

const runStatus: StatusRunner = (executable) => new Promise((resolve, reject) => {
  execFile(executable, ['status', '--json'], { timeout: 8_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
    (error, stdout) => error ? reject(error) : resolve(stdout))
})

export async function discoverTailscale(
  run: StatusRunner = runStatus,
  platform: NodeJS.Platform = process.platform,
  suggestedUsername = userInfo().username
): Promise<TailscaleDiscovery> {
  const executables = platform === 'darwin'
    ? ['tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale', '/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale']
    : platform === 'win32'
      ? ['tailscale.exe', 'C:\\Program Files\\Tailscale\\tailscale.exe']
      : ['tailscale', '/usr/bin/tailscale', '/usr/local/bin/tailscale']
  for (const executable of executables) {
    try {
      return parseTailscaleStatus(await run(executable), suggestedUsername)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      return {
        state: 'error', tailnet: '', suggestedUsername, devices: [],
        message: 'Could not read Tailscale status. Check that the Tailscale service is running and your account can run tailscale status --json.'
      }
    }
  }
  return {
    state: 'missing', tailnet: '', suggestedUsername, devices: [],
    message: 'Tailscale was not found. Install Tailscale on this computer, sign in, then refresh.'
  }
}
