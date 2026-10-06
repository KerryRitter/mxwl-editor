import { useEffect, useRef } from 'react'
import { Compartment, EditorState, type Text } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import {
  MergeView,
  getChunks,
  getOriginalDoc,
  unifiedMergeView
} from '@codemirror/merge'
import type { GitFileDiff } from '../../../shared/types'
import { editorExtensions, loadLanguage } from '../codemirror-setup'

export type DiffSelection = {
  side: 'before' | 'after'
  startLine: number
  endLine: number
  text: string
}

export function CodeDiff({
  file,
  layout,
  onSelection
}: {
  file: GitFileDiff
  layout: 'unified' | 'split'
  onSelection: (selection: DiffSelection | null) => void
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const onSelectionRef = useRef(onSelection)
  onSelectionRef.current = onSelection

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false
    const language = new Compartment()
    const extensions = (side: DiffSelection['side']) => [
      ...editorExtensions({
        label: `${side === 'before' ? 'Before' : 'After'} changes`,
        readOnly: true,
        fontSize: 12
      }),
      language.of([]),
      EditorView.updateListener.of((update) => {
        if (
          update.selectionSet ||
          (update.focusChanged && update.view.hasFocus)
        )
          onSelectionRef.current(selectedText(side, update.state))
      })
    ]
    const diffConfig = { scanLimit: 10_000, timeout: 250 }
    let merge: MergeView | undefined
    let unified: EditorView | undefined
    let removeDeletedSelection: (() => void) | undefined
    onSelectionRef.current(null)
    if (layout === 'split') {
      merge = new MergeView({
        parent: container,
        a: { doc: file.oldText ?? '', extensions: extensions('before') },
        b: { doc: file.newText ?? '', extensions: extensions('after') },
        highlightChanges: true,
        gutter: true,
        diffConfig
      })
    } else {
      unified = new EditorView({
        parent: container,
        doc: file.newText ?? '',
        extensions: [
          ...extensions('after'),
          unifiedMergeView({
            original: file.oldText ?? '',
            mergeControls: false,
            highlightChanges: true,
            gutter: true,
            diffConfig
          })
        ]
      })
      // Deleted lines are read-only DOM widgets in a unified merge view. Their
      // browser selection must be mapped back to the original document rather
      // than reported as positions in the modified document.
      const view = unified
      const handleDeletedSelection = (): void => {
        const native = document.getSelection()
        if (!native) return
        const anchor = deletedLine(native.anchorNode)
        const focus = deletedLine(native.focusNode)
        if (!anchor && !focus) return
        onSelectionRef.current(selectedDeletedText(view, native))
      }
      document.addEventListener('selectionchange', handleDeletedSelection)
      removeDeletedSelection = () =>
        document.removeEventListener('selectionchange', handleDeletedSelection)
    }
    const views = merge ? [merge.a, merge.b] : [unified!]
    void loadLanguage(file.path)
      .then((support) => {
        if (!cancelled && support)
          views.forEach((view) =>
            view.dispatch({ effects: language.reconfigure(support) })
          )
      })
      .catch((error) => console.error('diff language loading failed', error))

    return () => {
      cancelled = true
      removeDeletedSelection?.()
      merge?.destroy()
      unified?.destroy()
    }
  }, [file.path, file.oldText, file.newText, layout])

  return (
    <div
      ref={containerRef}
      className="mxwl-diff absolute inset-0"
      data-layout={layout}
      role="region"
      aria-label="Code changes"
    />
  )
}

function selectionFromRange(
  side: DiffSelection['side'],
  doc: Text,
  from: number,
  to: number
): DiffSelection | null {
  if (from === to) return null
  return {
    side,
    startLine: doc.lineAt(from).number,
    endLine: doc.lineAt(to - 1).number,
    text: doc.sliceString(from, to)
  }
}

function selectedText(
  side: DiffSelection['side'],
  state: EditorState
): DiffSelection | null {
  const { from, to } = state.selection.main
  return selectionFromRange(side, state.doc, from, to)
}

function deletedLine(node: Node | null): Element | null {
  return (
    (node instanceof Element ? node : node?.parentElement)?.closest(
      '.cm-deletedLine'
    ) ?? null
  )
}

function selectedDeletedText(
  view: EditorView,
  selection: Selection
): DiffSelection | null {
  if (selection.isCollapsed || !selection.anchorNode || !selection.focusNode)
    return null
  const anchorLine = deletedLine(selection.anchorNode)
  const focusLine = deletedLine(selection.focusNode)
  const block = anchorLine?.closest('.cm-deletedChunk')
  if (
    !block ||
    !view.dom.contains(block) ||
    focusLine?.closest('.cm-deletedChunk') !== block
  )
    return null
  const position = view.posAtDOM(block)
  const chunk = getChunks(view.state)?.chunks.find(
    (chunk) => chunk.fromB === position && chunk.endA > chunk.fromA
  )
  if (!chunk) return null
  const doc = getOriginalDoc(view.state)
  const firstLine = doc.lineAt(chunk.fromA).number
  const lines = [...block.querySelectorAll('.cm-deletedLine')]
  const offset = (line: Element, node: Node, nodeOffset: number): number => {
    const range = document.createRange()
    range.selectNodeContents(line)
    range.setEnd(node, nodeOffset)
    const documentLine = doc.line(
      Math.min(doc.lines, firstLine + lines.indexOf(line))
    )
    return Math.min(
      documentLine.to,
      documentLine.from + range.toString().length
    )
  }
  const a = offset(anchorLine!, selection.anchorNode, selection.anchorOffset)
  const b = offset(focusLine!, selection.focusNode, selection.focusOffset)
  return selectionFromRange('before', doc, Math.min(a, b), Math.max(a, b))
}
