import { z } from 'zod'
import { DEFAULT_DERIVE, DEFAULT_HIDE } from './hostDefaults'
import type {
  ProjectConfig,
  ProjectInput,
  ProjectLocation,
  WorkspaceProjectSettings
} from './types'

const text = z.string().max(4096)
const id = z.string().min(1).max(120)
const service = z.object({
  id,
  label: z.string().min(1).max(120),
  start: text,
  stop: text,
  restart: text,
  logs: text,
  cwd: text.optional()
})
const login = z.object({
  username: text,
  password: text.optional(),
  usernameSelector: text,
  passwordSelector: text,
  submitSelector: text
})
export const projectInputSchema = z.object({
  id: id.optional(),
  label: z.string().trim().min(1).max(120),
  repositoryUrl: text,
  derive: z.object({
    folderPattern: text,
    titleTemplate: text,
    browserUrlTemplate: text,
    issueKeyTemplate: text.optional()
  }),
  services: z.array(service).max(100),
  hide: z.array(text).max(100),
  terminalStartup: text,
  browserProfiles: z
    .array(
      z.object({
        id,
        label: z.string().trim().min(1).max(120),
        url: text,
        testLogin: login.nullable().optional()
      })
    )
    .max(50),
  defaultBrowserProfileId: id.nullable(),
  integrations: z.object({
    taskProvider: z.enum(['jira', 'linear', 'github-issues', 'none']),
    scmProvider: z.enum(['bitbucket', 'github', 'gitlab', 'none']),
    taskProject: text,
    repositoryWorkspace: text,
    repositorySlug: text
  }),
  ai: z.object({ workspaceFolderTemplate: text, initBranchCommand: text }),
  plugins: z.record(z.boolean())
})
export const locationInputSchema = z.object({
  id: id.optional(),
  projectId: id,
  hostId: id,
  label: z.string().trim().min(1).max(120),
  checkoutPath: z.string().trim().min(1).max(4096),
  workspacesRoot: z.string().trim().min(1).max(4096),
  folderFilter: text,
  appSubdirectory: text,
  browserProfileId: id.nullable(),
  overrides: z.object({
    browserUrl: text.optional(),
    terminalStartup: text.optional(),
    services: z.array(service).max(100).optional()
  })
})

export function emptyProject(): ProjectInput {
  return {
    label: '',
    repositoryUrl: '',
    derive: { ...DEFAULT_DERIVE },
    services: [],
    hide: [...DEFAULT_HIDE],
    terminalStartup: '',
    browserProfiles: [],
    defaultBrowserProfileId: null,
    integrations: {
      taskProvider: 'none',
      scmProvider: 'none',
      taskProject: '',
      repositoryWorkspace: '',
      repositorySlug: ''
    },
    ai: {
      workspaceFolderTemplate: '${project}-${keyLower}',
      initBranchCommand: ''
    },
    plugins: {}
  }
}

export function assertRelativeDirectory(value: string): void {
  if (
    value &&
    (value.startsWith('/') ||
      value.startsWith('~') ||
      /^[A-Za-z]:/.test(value) ||
      value.split(/[/\\]/).includes('..'))
  ) {
    throw new Error(
      'App and service directories must stay inside the workspace'
    )
  }
}

export function resolveProjectSettings(
  project?: ProjectConfig,
  location?: ProjectLocation,
  profileId?: string | null
): WorkspaceProjectSettings {
  const selectedId =
    profileId === undefined
      ? (location?.browserProfileId ?? project?.defaultBrowserProfileId)
      : profileId
  const browserProfile =
    project?.browserProfiles.find((p) => p.id === selectedId) ?? null
  return {
    derive:
      location?.overrides.browserUrl !== undefined
        ? { ...(project?.derive ?? DEFAULT_DERIVE), browserUrlTemplate: '' }
        : (project?.derive ?? { ...DEFAULT_DERIVE }),
    services: location?.overrides.services ?? project?.services ?? [],
    hide: project?.hide ?? [...DEFAULT_HIDE],
    terminalStartup:
      location?.overrides.terminalStartup ?? project?.terminalStartup ?? '',
    browserUrl: location?.overrides.browserUrl ?? browserProfile?.url ?? '',
    browserProfile,
    appSubdirectory: location?.appSubdirectory ?? '',
    plugins: project?.plugins ?? {}
  }
}
