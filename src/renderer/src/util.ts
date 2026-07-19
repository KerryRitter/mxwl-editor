export function basename(p: string): string {
  return p.replace(/\/+$/, '').split('/').pop() ?? p
}

export function dirname(p: string): string {
  const trimmed = p.replace(/\/+$/, '')
  const idx = trimmed.lastIndexOf('/')
  return idx <= 0 ? '/' : trimmed.slice(0, idx)
}

const LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  jsonc: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  svg: 'xml',
  md: 'markdown',
  markdown: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  sql: 'sql',
  php: 'php',
  swift: 'swift',
  cs: 'csharp',
  toml: 'ini',
  ini: 'ini',
  env: 'shell'
}

export function languageForPath(path: string): string {
  const name = basename(path).toLowerCase()
  if (name === 'dockerfile' || name.startsWith('dockerfile.')) return 'dockerfile'
  if (name === '.env' || name.startsWith('.env.')) return 'shell'
  const ext = name.includes('.') ? (name.split('.').pop() as string) : ''
  return LANG[ext] ?? 'plaintext'
}
