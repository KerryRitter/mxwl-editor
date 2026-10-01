export type TailscaleDevice = {
  id: string
  name: string
  dnsName: string
  address: string
  ips: string[]
  os: string
  online: boolean
  sshAdvertised: boolean
  tags: string[]
}

export type TailscaleDiscovery = {
  state: 'ready' | 'missing' | 'stopped' | 'logged-out' | 'error'
  message: string
  tailnet: string
  suggestedUsername: string
  devices: TailscaleDevice[]
}
