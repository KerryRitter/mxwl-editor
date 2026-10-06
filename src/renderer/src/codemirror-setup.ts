import { basicSetup } from 'codemirror'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import {
  HighlightStyle,
  LanguageDescription,
  indentUnit,
  syntaxHighlighting,
  type LanguageSupport
} from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { tags } from '@lezer/highlight'
import brand from '../../shared/brand.json'
import { basename, languageForPath } from './util'

const highlighting = HighlightStyle.define([
  { tag: tags.comment, color: brand.faint, fontStyle: 'italic' },
  {
    tag: [tags.keyword, tags.modifier, tags.operatorKeyword],
    color: brand.lavender
  },
  { tag: [tags.string, tags.regexp], color: brand.accent },
  { tag: [tags.number, tags.bool, tags.null], color: brand.peach },
  { tag: [tags.typeName, tags.className, tags.tagName], color: brand.sky },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    color: brand.sky
  },
  { tag: tags.definition(tags.variableName), color: brand.foreground },
  { tag: [tags.operator, tags.punctuation], color: brand.muted },
  { tag: tags.invalid, color: brand.error }
])

const theme = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: brand.background,
      color: brand.foreground
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      fontFamily: brand.fontMono,
      lineHeight: '1.6',
      overflow: 'auto'
    },
    '.cm-content': { padding: '8px 0', caretColor: brand.accent },
    '.cm-line': { padding: '0 8px' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: brand.accent },
    '.cm-gutters': {
      backgroundColor: brand.background,
      color: brand.faint,
      borderRight: `1px solid ${brand.line}`
    },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: brand.surface },
    '.cm-activeLineGutter': { color: brand.accent },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      {
        backgroundColor: '#baf57d26'
      },
    '.cm-selectionMatch': { backgroundColor: '#baf57d15' },
    '.cm-tooltip': {
      backgroundColor: brand.surface,
      border: `1px solid ${brand.line}`
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: brand.elevated,
      color: brand.accent
    },
    '.cm-panels': { backgroundColor: brand.surface, color: brand.foreground },
    '.cm-panels-top': { borderBottom: `1px solid ${brand.line}` },
    '.cm-panels-bottom': { borderTop: `1px solid ${brand.line}` },
    '.cm-textfield, .cm-button': {
      background: brand.background,
      color: brand.foreground,
      border: `1px solid ${brand.line}`,
      borderRadius: '2px'
    },
    '.cm-searchMatch': { backgroundColor: '#f2b68d26' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: '#baf57d40' },
    '&.cm-merge-a .cm-changedLine, .cm-deletedChunk': {
      backgroundColor: '#f38b910d'
    },
    '&.cm-merge-b .cm-changedLine': { backgroundColor: '#baf57d0d' },
    '&.cm-merge-a .cm-changedText, .cm-deletedChunk .cm-deletedText': {
      backgroundColor: '#f38b9124'
    },
    '&.cm-merge-b .cm-changedText, .cm-insertedLine .cm-changedText': {
      backgroundColor: '#baf57d24'
    },
    '.cm-deletedLine del': { textDecoration: 'none' },
    '.cm-changeGutter': { width: '4px' },
    '.cm-mergeSpacer': { backgroundColor: brand.surface },
    '.cm-collapsedLines': { backgroundColor: brand.surface, color: brand.muted }
  },
  { dark: true }
)

export function editorExtensions(options: {
  label: string
  readOnly?: boolean
  fontSize?: number
}): Extension[] {
  return [
    basicSetup,
    theme,
    syntaxHighlighting(highlighting),
    indentUnit.of('  '),
    EditorState.tabSize.of(2),
    ...(options.readOnly ? [EditorState.readOnly.of(true)] : []),
    EditorView.contentAttributes.of({
      'aria-label': options.label,
      spellcheck: 'false'
    }),
    EditorView.theme({ '&': { fontSize: `${options.fontSize ?? 13}px` } }),
    ...(options.readOnly
      ? [EditorView.lineWrapping]
      : [keymap.of([indentWithTab])])
  ]
}

export async function loadLanguage(
  path: string
): Promise<LanguageSupport | null> {
  const description =
    LanguageDescription.matchFilename(languages, basename(path)) ??
    LanguageDescription.matchLanguageName(languages, languageForPath(path))
  return description ? description.load() : null
}
