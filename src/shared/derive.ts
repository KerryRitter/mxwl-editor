import type { DeriveConfig } from './types'

export type DeriveVars = Record<string, string>

/** Parse folder basename with named-group regex → template vars. */
export function varsFromFolder(folderName: string, folderPattern: string): DeriveVars {
  const vars: DeriveVars = { name: folderName }
  try {
    const match = folderName.match(new RegExp(folderPattern))
    if (!match) return vars
    const groups = match.groups ?? {}
    for (const [k, v] of Object.entries(groups)) {
      if (v) vars[k] = v
    }
    if (!vars.name) vars.name = folderName
    if (vars.ticket && !vars.ticketNum) {
      const digits = vars.ticket.match(/\d+/)
      if (digits) vars.ticketNum = digits[0]
    }
    if (!vars.ticketNum && vars.number) vars.ticketNum = vars.number
  } catch {
    // invalid pattern
  }
  return vars
}

export function applyTemplate(template: string, vars: DeriveVars): string {
  return template.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => vars[key] ?? '')
}

export function applyTemplateStrict(template: string, vars: DeriveVars): string | null {
  if (!template.trim()) return ''
  const keys = [...template.matchAll(/\$\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1])
  for (const k of keys) {
    if (!vars[k]) return null
  }
  return applyTemplate(template, vars)
}

export function previewDerive(
  folderName: string,
  derive: DeriveConfig
): { vars: DeriveVars; title: string; browserUrl: string; issueKey: string | null; ok: boolean } {
  const vars = varsFromFolder(folderName, derive.folderPattern)
  let ok = true
  try {
    ok = new RegExp(derive.folderPattern).test(folderName)
  } catch {
    ok = false
  }
  const title =
    applyTemplate(derive.titleTemplate, vars).replace(/\s+/g, ' ').trim() || folderName
  const browserUrl = applyTemplateStrict(derive.browserUrlTemplate, vars)?.trim() || ''
  const issueKey = derive.issueKeyTemplate
    ? applyTemplateStrict(derive.issueKeyTemplate, vars)?.trim() || null
    : null
  return { vars, title, browserUrl, issueKey, ok }
}
