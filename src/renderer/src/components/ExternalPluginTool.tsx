import { useEffect, useMemo, useRef, type FC } from 'react'
import {
  MXWL_PLUGIN_API_VERSION,
  PLUGIN_HOST_METHODS,
  type PluginBridgeHello,
  type PluginBridgeReady,
  type PluginBridgeRequest,
  type PluginBridgeResponse
} from '../../../shared/plugins'
import type { WorkspaceState } from '../../../shared/types'
import type { WorkspaceToolRegistration } from '../store/plugins'

export const ExternalPluginTool: FC<{
  tool: WorkspaceToolRegistration
  ws: WorkspaceState
  visible: boolean
}> = ({ tool, ws, visible }) => {
  const frame = useRef<HTMLIFrameElement>(null)
  const pluginOrigin = `mxwl-plugin://${tool.plugin.id}`
  const documentUrl = useMemo(
    () =>
      `mxwl-plugin://${tool.plugin.id}/${(tool.contribution.entry ?? '')
        .split('/')
        .map(encodeURIComponent)
        .join('/')}?revision=${tool.plugin.revision}`,
    [tool.contribution.entry, tool.plugin.id, tool.plugin.revision]
  )
  const context = useMemo(
    () => ({
      id: ws.id,
      title: ws.title,
      remotePath: ws.remotePath,
      hostId: ws.hostId,
      status: ws.status,
      issueKey: ws.derived.issueKey,
      branch: ws.derived.branch,
      dirty: ws.derived.dirty
    }),
    [
      ws.id,
      ws.title,
      ws.remotePath,
      ws.hostId,
      ws.status,
      ws.derived.issueKey,
      ws.derived.branch,
      ws.derived.dirty
    ]
  )

  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      if (event.source !== frame.current?.contentWindow || event.origin !== pluginOrigin) return
      if (isHello(event.data)) {
        sendContext(
          frame.current,
          pluginOrigin,
          tool.plugin.id,
          tool.contribution.id,
          context,
          'ready'
        )
        return
      }
      if (!isRequest(event.data)) return
      const request = event.data
      void window.api.plugins
        .call(tool.plugin.id, ws.id, request.method, request.params)
        .then((result) =>
          respond(frame.current, pluginOrigin, {
            source: 'mxwl-host',
            type: 'response',
            id: request.id,
            result
          })
        )
        .catch((reason) =>
          respond(frame.current, pluginOrigin, {
            source: 'mxwl-host',
            type: 'response',
            id: request.id,
            error: errorText(reason)
          })
        )
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [context, pluginOrigin, tool.contribution.id, tool.plugin.id, ws.id])

  useEffect(() => {
    sendContext(
      frame.current,
      pluginOrigin,
      tool.plugin.id,
      tool.contribution.id,
      context,
      'context'
    )
  }, [context, pluginOrigin, tool.contribution.id, tool.plugin.id])

  useEffect(() => {
    frame.current?.contentWindow?.postMessage(
      { source: 'mxwl-host', type: 'visibility', visible },
      pluginOrigin
    )
  }, [pluginOrigin, visible])

  return (
    <iframe
      ref={frame}
      title={`${tool.plugin.name}: ${tool.contribution.title}`}
      src={documentUrl}
      sandbox="allow-scripts allow-same-origin"
      className="h-full w-full border-0 bg-neutral-950"
      onLoad={() =>
        sendContext(
          frame.current,
          pluginOrigin,
          tool.plugin.id,
          tool.contribution.id,
          context,
          'ready'
        )
      }
    />
  )
}

function sendContext(
  frame: HTMLIFrameElement | null,
  targetOrigin: string,
  pluginId: string,
  contributionId: string,
  workspace: PluginBridgeReady['workspace'],
  type: PluginBridgeReady['type']
): void {
  const message: PluginBridgeReady = {
    source: 'mxwl-host',
    type,
    apiVersion: MXWL_PLUGIN_API_VERSION,
    pluginId,
    contributionId,
    workspace
  }
  frame?.contentWindow?.postMessage(message, targetOrigin)
}

function respond(
  frame: HTMLIFrameElement | null,
  targetOrigin: string,
  response: PluginBridgeResponse
): void {
  frame?.contentWindow?.postMessage(response, targetOrigin)
}

function isRequest(value: unknown): value is PluginBridgeRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<PluginBridgeRequest>
  return (
    request.source === 'mxwl-plugin' &&
    request.type === 'request' &&
    typeof request.id === 'string' &&
    typeof request.method === 'string' &&
    PLUGIN_HOST_METHODS.includes(request.method as PluginBridgeRequest['method'])
  )
}

function isHello(value: unknown): value is PluginBridgeHello {
  if (!value || typeof value !== 'object') return false
  const hello = value as Partial<PluginBridgeHello>
  return hello.source === 'mxwl-plugin' && hello.type === 'ready'
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
