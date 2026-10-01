import type { WorkspaceState } from './types'

/** Stable UI/recovery identity; a runtime workspace ID changes on restart. */
export function workspacePersistenceKey(
  ws: Pick<
    WorkspaceState,
    'hostId' | 'locationId' | 'browserProfileId' | 'remotePath'
  >
): string {
  return `mxwl.workspace.${ws.hostId}::${ws.locationId ?? ''}::${ws.browserProfileId ?? ''}::${ws.remotePath}`
}
