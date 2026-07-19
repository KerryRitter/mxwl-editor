import { describe, expect, it } from 'vitest'
import { applyTemplate, previewDerive, varsFromFolder } from './derive'

describe('varsFromFolder', () => {
  it('extracts named ticket groups and ticketNum digits', () => {
    const vars = varsFromFolder(
      'myapp-PROJ-42',
      '^myapp-(?<ticket>[A-Z][A-Z0-9]*-\\d+)$'
    )
    expect(vars.ticket).toBe('PROJ-42')
    expect(vars.ticketNum).toBe('42')
    expect(vars.name).toBe('myapp-PROJ-42')
  })

  it('falls back to basename when pattern misses', () => {
    const vars = varsFromFolder('other', '^(?<ticket>TICKET-\\d+)$')
    expect(vars.name).toBe('other')
    expect(vars.ticket).toBeUndefined()
  })

  it('survives invalid regex', () => {
    const vars = varsFromFolder('x', '(?<')
    expect(vars.name).toBe('x')
  })
})

describe('previewDerive', () => {
  it('builds title and url from templates', () => {
    const out = previewDerive('acme-ABC-7', {
      folderPattern: 'acme-(?<ticket>[A-Z]+-\\d+)',
      titleTemplate: '${ticket}',
      browserUrlTemplate: 'https://preview.example.com/${ticketNum}',
      issueKeyTemplate: '${ticket}'
    })
    expect(out.ok).toBe(true)
    expect(out.title).toBe('ABC-7')
    expect(out.browserUrl).toBe('https://preview.example.com/7')
    expect(out.issueKey).toBe('ABC-7')
  })

  it('skips url when a template var is missing', () => {
    const out = previewDerive('plain', {
      folderPattern: '(?<name>.+)',
      titleTemplate: '${name}',
      browserUrlTemplate: 'https://x/${ticketNum}'
    })
    expect(out.browserUrl).toBe('')
  })
})

describe('applyTemplate', () => {
  it('substitutes known keys and blanks missing', () => {
    expect(applyTemplate('a=${ticket}-b', { ticket: 'T-1' })).toBe('a=T-1-b')
    expect(applyTemplate('${missing}', {})).toBe('')
  })
})
