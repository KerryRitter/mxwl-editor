export const MCP_PORT = 9223

export function workspaceBridgeUrls(workspaceId: string, port = MCP_PORT) {
  const base = `http://127.0.0.1:${port}`
  return { mcpUrl: `${base}/mcp/${workspaceId}`, cdpUrl: `${base}/cdp/${workspaceId}` }
}

export function workspaceBridgeConfig(workspaceId: string, token = '', port = MCP_PORT) {
  const { mcpUrl, cdpUrl } = workspaceBridgeUrls(workspaceId, port)
  return {
    mcpServers: {
      mxwl: { type: 'http', url: mcpUrl, ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) },
      playwright: {
        command: 'npx',
        args: ['-y', '@playwright/mcp@latest', '--cdp-endpoint', cdpUrl,
          ...(token ? ['--cdp-header', `Authorization: Bearer ${token}`] : [])]
      }
    }
  }
}
