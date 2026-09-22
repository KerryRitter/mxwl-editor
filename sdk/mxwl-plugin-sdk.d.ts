export type MxwlWorkspaceContext = {
  id: string
  title: string
  remotePath: string
  hostId: string
  status: string
  issueKey?: string | null
  branch?: string | null
  dirty?: boolean
}

export type MxwlPluginContext = {
  apiVersion: 1
  pluginId: string
  contributionId: string
  workspace: MxwlWorkspaceContext
}

export interface MxwlPluginClient {
  readonly apiVersion: 1
  call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>
  getContext(): MxwlPluginContext | null
  isVisible(): boolean
  onContext(listener: (context: MxwlPluginContext) => void): () => void
  onVisibility(listener: (visible: boolean) => void): () => void
}

declare global {
  interface Window {
    mxwl: MxwlPluginClient
  }
}

export {}
