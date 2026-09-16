import { existsSync, readFileSync } from 'node:fs'
import { request } from 'node:http'
import { join } from 'node:path'
import type { AppSettings, FleetAgent } from '../../shared/types'

export function isControlCli(argv = process.argv): boolean {
  return argv.slice(1).includes('agent')
}

export async function runControlCli(userData: string, argv = process.argv): Promise<number> {
  const marker = argv.slice(1).indexOf('agent')
  const args = marker >= 0 ? argv.slice(marker + 2) : []
  const command = args[0] ?? 'help'
  const settings = readControlSettings(userData)
  if (!settings) {
    process.stderr.write('mxwl has not been configured yet. Launch the desktop app once.\n')
    return 1
  }
  const base = `http://127.0.0.1:${settings.port}`
  const json = args.includes('--json')

  try {
    if (command === 'list') {
      const agents = await call<FleetAgent[]>(base, settings.authToken, 'GET', '/api/agents')
      printAgents(agents, json)
      return 0
    }
    if (command === 'get') {
      const target = required(args[1], 'agent target')
      const agents = await call<FleetAgent[]>(base, settings.authToken, 'GET', '/api/agents')
      const agent = resolveAgent(agents, target)
      process.stdout.write(`${JSON.stringify(agent, null, json ? 2 : 0)}\n`)
      return 0
    }
    if (command === 'focus') {
      const target = required(args[1], 'agent target')
      await call(base, settings.authToken, 'POST', `/api/agents/${encodeURIComponent(target)}/focus`)
      process.stdout.write(`Focused ${target}\n`)
      return 0
    }
    if (command === 'prompt') {
      const target = required(args[1], 'agent target')
      const wait = args.includes('--wait')
      const text = args.slice(2).filter((arg) => arg !== '--wait' && arg !== '--json').join(' ').trim()
      required(text, 'prompt text')
      await call(base, settings.authToken, 'POST', `/api/agents/${encodeURIComponent(target)}/prompt`, {
        text,
        wait
      })
      process.stdout.write(wait ? `${target} finished\n` : `Prompt sent to ${target}\n`)
      return 0
    }
    if (command === 'wait') {
      const target = required(args[1], 'agent target')
      const until = flag(args, '--until') ?? 'idle,attention,error'
      const timeoutSeconds = Number(flag(args, '--timeout') ?? 300)
      const agent = await call<FleetAgent>(
        base,
        settings.authToken,
        'GET',
        `/api/agents/${encodeURIComponent(target)}/wait?until=${encodeURIComponent(until)}&timeout=${Math.max(0, timeoutSeconds) * 1000}`
      )
      if (json) process.stdout.write(`${JSON.stringify(agent, null, 2)}\n`)
      else process.stdout.write(`${agent.workspaceTitle}\t${agent.activity.state}\t${agent.activity.summary}\n`)
      return 0
    }
    printHelp()
    return command === 'help' || command === '--help' || command === '-h' ? 0 : 1
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }
}

function readControlSettings(userData: string): AppSettings['control'] | null {
  const file = join(userData, 'settings.json')
  if (!existsSync(file)) return null
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<AppSettings>
    if (!parsed.control?.authToken) return null
    return {
      enabled: parsed.control.enabled !== false,
      port: parsed.control.port || 9233,
      remoteAccess: Boolean(parsed.control.remoteAccess),
      authToken: parsed.control.authToken
    }
  } catch {
    return null
  }
}

function call<T = unknown>(
  base: string,
  token: string,
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const url = new URL(path, base)
  const encoded = body ? JSON.stringify(body) : undefined
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(encoded
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(encoded) }
            : {})
        }
      },
      (response) => {
        let raw = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => (raw += chunk))
        response.on('end', () => {
          if ((response.statusCode ?? 500) >= 400) {
            let message = raw
            try {
              message = (JSON.parse(raw) as { error?: string }).error ?? raw
            } catch {
              void raw
            }
            reject(new Error(`mxwl runtime: ${message || response.statusCode}`))
            return
          }
          try {
            resolve((raw ? JSON.parse(raw) : null) as T)
          } catch (error) {
            reject(error)
          }
        })
      }
    )
    req.on('error', () => reject(new Error('mxwl runtime is not running; launch mxwl first')))
    if (encoded) req.write(encoded)
    req.end()
  })
}

function resolveAgent(agents: FleetAgent[], target: string): FleetAgent {
  const wanted = target.toLowerCase()
  const matches = agents.filter(
    (agent) =>
      agent.wsId === target ||
      agent.workspaceTitle.toLowerCase() === wanted ||
      agent.issueKey?.toLowerCase() === wanted ||
      agent.agentLabel.toLowerCase() === wanted
  )
  if (matches.length !== 1) {
    throw new Error(matches.length ? `Agent target is ambiguous: ${target}` : `Agent not found: ${target}`)
  }
  return matches[0]
}

function printAgents(agents: FleetAgent[], json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(agents, null, 2)}\n`)
    return
  }
  if (agents.length === 0) {
    process.stdout.write('No live agents\n')
    return
  }
  process.stdout.write('WORKSPACE\tHOST\tAGENT\tSTATE\tSUMMARY\n')
  for (const agent of agents) {
    process.stdout.write(
      `${agent.workspaceTitle}\t${agent.hostLabel}\t${agent.agentLabel}\t${agent.activity.state}\t${agent.activity.summary}\n`
    )
  }
}

function flag(args: string[], name: string): string | null {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] ?? null : null
}

function required(value: string | undefined, label: string): string {
  if (!value) throw new Error(`Missing ${label}`)
  return value
}

function printHelp(): void {
  process.stdout.write(`mxwl agent — control the background agent runtime

Usage:
  mxwl agent list [--json]
  mxwl agent get <workspace|issue|agent|id> [--json]
  mxwl agent focus <target>
  mxwl agent prompt <target> <text> [--wait]
  mxwl agent wait <target> [--until idle,attention,error] [--timeout seconds] [--json]
`)
}
