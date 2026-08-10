import type { TabGroup } from './types'

export const DEFAULT_GROUP_ID = 'g1'

/** Border colours, handed out in order as groups are created. */
export const GROUP_COLORS = [
  '#10b981',
  '#3b82f6',
  '#f59e0b',
  '#a855f7',
  '#ef4444',
  '#14b8a6',
  '#ec4899',
  '#84cc16'
]

export function groupColor(index: number): string {
  return GROUP_COLORS[index % GROUP_COLORS.length]
}

/**
 * The first group stays on the app's default session so logins made before tab
 * groups existed keep working; every later group gets its own cookie jar. The
 * partition is keyed on the workspace id and the sequential group id, both of
 * which are stable across restarts, so a group's cookies survive a relaunch.
 */
export function groupPartition(wsId: string, groupId: string): string {
  return groupId === DEFAULT_GROUP_ID ? '' : `persist:mxwl-${wsId}-${groupId}`
}

export function makeDefaultGroup(wsId: string): TabGroup {
  return {
    id: DEFAULT_GROUP_ID,
    label: 'Default',
    color: groupColor(0),
    partition: groupPartition(wsId, DEFAULT_GROUP_ID)
  }
}
