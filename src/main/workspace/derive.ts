import type { DeriveConfig, DerivedWorkspace } from '../../shared/types'
import {
  applyTemplate,
  applyTemplateStrict,
  varsFromFolder
} from '../../shared/derive'

export type DeriveOptions = {
  defaultBrowserUrl?: string
  derive: DeriveConfig
}

export function deriveFromFolder(folderName: string, opts: DeriveOptions): DerivedWorkspace {
  const { derive, defaultBrowserUrl = '' } = opts
  const vars = varsFromFolder(folderName, derive.folderPattern)

  const title =
    applyTemplate(derive.titleTemplate, vars).replace(/\s+/g, ' ').trim() || folderName
  const browserUrl =
    applyTemplateStrict(derive.browserUrlTemplate, vars)?.trim() || defaultBrowserUrl
  const issueKey = derive.issueKeyTemplate
    ? applyTemplateStrict(derive.issueKeyTemplate, vars)?.trim() || null
    : null

  return {
    title,
    issueKey,
    browserUrl,
    branch: null,
    dirty: false
  }
}

export function matchFolderFilter(name: string, filter?: string): boolean {
  if (!filter || !filter.trim()) return true
  const f = filter.trim()
  if (f.startsWith('/') && f.lastIndexOf('/') > 0) {
    const last = f.lastIndexOf('/')
    try {
      return new RegExp(f.slice(1, last), f.slice(last + 1)).test(name)
    } catch {
      return true
    }
  }
  const escaped = f.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  try {
    return new RegExp(`^${escaped}$`, 'i').test(name)
  } catch {
    return name.includes(f)
  }
}
