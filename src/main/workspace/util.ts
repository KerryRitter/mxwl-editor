export function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

export function joinRemote(base: string, name: string): string {
  return base.endsWith('/') ? base + name : base + '/' + name
}

export function basenameRemote(p: string): string {
  return p.replace(/\/+$/, '').split('/').pop() ?? p
}

/**
 * A login shell is not enough to find a version-managed binary: nvm's setup
 * lives in ~/.bashrc, and ~/.bashrc returns before it when the shell is not
 * interactive — so `bash -lc npx` reports "not found" on exactly the machines
 * where npx exists. Sourcing nvm directly beats `bash -ilc`, which does find it
 * but writes job-control warnings onto the process's stderr.
 */
export const USER_PATH_PREAMBLE = [
  'export PATH="$HOME/.local/bin:$HOME/.bun/bin:$HOME/.local/share/pnpm:$HOME/.volta/bin:$HOME/.opencode/bin:$PATH"',
  '[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1'
].join('; ')

export function normalizeRemote(p: string): string {
  if (p === '~') return '$HOME'
  if (p.startsWith('~/')) return '$HOME/' + p.slice(2)
  return p
}
