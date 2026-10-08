import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceManager } from '../workspace/WorkspaceManager'
import type { SettingsStore } from '../persistence/SettingsStore'

const server = vi.hoisted(() => ({
  start: vi.fn(async () => undefined), stop: vi.fn(async () => undefined),
  disableWorkspace: vi.fn(), listeningPort: 9223
}))
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
vi.mock('./WorkspaceMcpServer', () => ({ WorkspaceMcpServer: class {
  start = server.start
  stop = server.stop
  disableWorkspace = server.disableWorkspace
  listeningPort = server.listeningPort
} }))
import { McpController } from './index'

function setup() {
  const connections = new Map(['first', 'second'].map((id, index) => [id, {
    kind: 'ssh', startReverseTunnel: vi.fn(async () => 31000 + index),
    stopReverseTunnel: vi.fn(async () => undefined)
  }]))
  const workspaces = {
    getConnection: (id: string) => connections.get(id), setMcpEnabled: vi.fn(),
    onWorkspaceClosed: undefined, terminalEnvironment: undefined
  } as unknown as WorkspaceManager
  const settings = { all: () => ({ mcpAuthToken: 'test-token' }) } as unknown as SettingsStore
  return { controller: new McpController(workspaces, settings), connections, workspaces }
}

beforeEach(() => vi.clearAllMocks())

describe('workspace MCP connections', () => {
  it('gives each remote workspace its own tunnel and scoped connection', async () => {
    const { controller, connections } = setup()
    const [first, second] = await Promise.all([controller.enable('first'), controller.enable('second')])
    expect(server.start).toHaveBeenCalledTimes(1)
    expect(connections.get('first')!.startReverseTunnel).toHaveBeenCalledWith(0, 9223)
    expect(first.cdpUrl).toBe('http://127.0.0.1:31000/cdp/first')
    expect(second.cdpUrl).toBe('http://127.0.0.1:31001/cdp/second')
    await controller.disable('first')
    expect(server.disableWorkspace).toHaveBeenCalledWith('first')
    expect(connections.get('first')!.stopReverseTunnel).toHaveBeenCalledWith(31000)
    expect(controller.status('first').enabled).toBe(false)
    expect(controller.status('second').enabled).toBe(true)
    expect(server.stop).not.toHaveBeenCalled()
  })

  it('deduplicates overlapping activation and waits for shutdown before reopening', async () => {
    const { controller, connections } = setup()
    await Promise.all([controller.enable('first'), controller.enable('first')])
    expect(connections.get('first')!.startReverseTunnel).toHaveBeenCalledTimes(1)
    await Promise.all([controller.disable('first'), controller.enable('second')])
    expect(server.stop).toHaveBeenCalledTimes(1)
    expect(server.start).toHaveBeenCalledTimes(2)
    expect(controller.status('second').enabled).toBe(true)
    await Promise.all([controller.disable('second'), controller.enable('second')])
    expect(controller.status('second').enabled).toBe(true)
  })

  it('configures Playwright children and agents with the matching authenticated endpoint', async () => {
    const { controller } = setup()
    expect(await controller.environment('first')).toMatchObject({
      PLAYWRIGHT_MCP_CDP_ENDPOINT: 'http://127.0.0.1:31000/cdp/first',
      PLAYWRIGHT_MCP_CDP_HEADERS: 'Authorization: Bearer test-token'
    })
    const config = JSON.parse(controller.status('first').config!)
    expect(config.mcpServers.playwright.args).toContain('Authorization: Bearer test-token')
    expect(await controller.agentServers('first', true)).toEqual([{
      type: 'http', name: 'mxwl', url: 'http://127.0.0.1:31000/mcp/first',
      headers: [{ name: 'Authorization', value: 'Bearer test-token' }]
    }])
    const [stdio] = await controller.agentServers('first', false)
    expect(stdio).toMatchObject({ name: 'mxwl', command: 'node',
      env: [{ name: 'MXWL_MCP_TOKEN', value: 'test-token' }] })
  })
})
