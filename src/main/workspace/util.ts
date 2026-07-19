export function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

export function joinRemote(base: string, name: string): string {
  return base.endsWith('/') ? base + name : base + '/' + name
}

export function basenameRemote(p: string): string {
  return p.replace(/\/+$/, '').split('/').pop() ?? p
}

export function normalizeRemote(p: string): string {
  if (p === '~') return '$HOME'
  if (p.startsWith('~/')) return '$HOME/' + p.slice(2)
  return p
}
