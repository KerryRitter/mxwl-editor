import { useEffect, useRef, useState } from 'react'
import { Circle, Loader2, X } from 'lucide-react'
import {
  Compartment,
  EditorState,
  type Text,
  type Extension
} from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { editorExtensions, loadLanguage } from '../codemirror-setup'
import { useEditorStore } from '../store/editor'
import { basename } from '../util'

type FileSession = {
  state: EditorState
  savedDoc: Text
  lineSeparator: string
  scroll: ReturnType<EditorView['scrollSnapshot']> | null
}

interface EditorProps {
  wsId: string
  storageKey?: string
}

export function Editor({ wsId, storageKey }: EditorProps): JSX.Element {
  const files = useEditorStore((s) => s.byWs[wsId]?.files ?? [])
  const activePath = useEditorStore((s) => s.byWs[wsId]?.activePath ?? null)
  const setActive = useEditorStore((s) => s.setActive)
  const close = useEditorStore((s) => s.close)
  const setDirty = useEditorStore((s) => s.setDirty)
  const restore = useEditorStore((s) => s.restore)

  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<EditorView | null>(null)
  const sessionsRef = useRef<Map<string, FileSession>>(new Map())
  const displayedPathRef = useRef<string | null>(null)
  const extensionsRef = useRef<Extension[]>([])
  const languageRef = useRef(new Compartment())
  const activePathRef = useRef<string | null>(activePath)
  const wsIdRef = useRef<string>(wsId)
  activePathRef.current = activePath
  wsIdRef.current = wsId

  const [binaryPaths, setBinaryPaths] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [saveError, setSaveError] = useState<{
    path: string
    message: string
  } | null>(null)

  useEffect(() => {
    if (!storageKey) return
    try {
      const saved = JSON.parse(
        localStorage.getItem(`${storageKey}.editorTabs`) ?? 'null'
      ) as {
        paths?: string[]
        activePath?: string | null
      } | null
      if (saved?.paths) restore(wsId, saved.paths, saved.activePath ?? null)
    } catch {
      // A bad UI checkpoint should never keep the editor from opening.
    }
  }, [restore, storageKey, wsId])

  useEffect(() => {
    if (!storageKey) return
    localStorage.setItem(
      `${storageKey}.editorTabs`,
      JSON.stringify({ paths: files.map((file) => file.path), activePath })
    )
  }, [files, activePath, storageKey])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    extensionsRef.current = [
      ...editorExtensions({ label: 'Code editor' }),
      languageRef.current.of([]),
      EditorView.updateListener.of((update) => {
        const path = displayedPathRef.current
        const session = path ? sessionsRef.current.get(path) : null
        if (!path || !session) return
        session.state = update.state
        if (update.docChanged)
          setDirty(
            wsIdRef.current,
            path,
            !update.state.doc.eq(session.savedDoc)
          )
      })
    ]
    const e = new EditorView({
      parent: container,
      state: EditorState.create({
        extensions: [...extensionsRef.current, EditorState.readOnly.of(true)]
      })
    })
    editorRef.current = e

    // Save belongs to the whole code pane, including find/replace, file tabs,
    // and the file tree. Capture it before individual controls handle the key.
    const pane =
      container.closest<HTMLElement>('[data-code-editor-pane]') ??
      container.parentElement?.parentElement ??
      container
    const onSaveKey = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        event.shiftKey ||
        event.isComposing ||
        event.key.toLowerCase() !== 's'
      )
        return
      event.preventDefault()
      event.stopPropagation()
      if (!event.repeat) saveActive()
    }
    pane.addEventListener('keydown', onSaveKey, true)

    return () => {
      pane.removeEventListener('keydown', onSaveKey, true)
      editorRef.current = null
      displayedPathRef.current = null
      e.destroy()
      sessionsRef.current.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function saveActive(): void {
    const p = displayedPathRef.current
    const e = editorRef.current
    const session = p ? sessionsRef.current.get(p) : null
    if (!p || p !== activePathRef.current || !e || !session) return
    const doc = e.state.doc
    const workspaceId = wsIdRef.current
    setSaveError(null)
    window.api.fs
      .writeFile(
        workspaceId,
        p,
        doc.sliceString(0, doc.length, session.lineSeparator)
      )
      .then(() => {
        // A save can finish after more typing, a tab close, or a workspace switch.
        if (sessionsRef.current.get(p) !== session) return
        session.savedDoc = doc
        setDirty(workspaceId, p, !session.state.doc.eq(doc))
      })
      .catch((err) => {
        if (sessionsRef.current.get(p) === session)
          setSaveError({
            path: p,
            message: err instanceof Error ? err.message : String(err)
          })
      })
  }

  useEffect(() => {
    const e = editorRef.current
    if (!e) return
    const previous = displayedPathRef.current
    const previousSession = previous ? sessionsRef.current.get(previous) : null
    if (previousSession) {
      previousSession.state = e.state
      previousSession.scroll = e.scrollSnapshot()
    }
    const display = (path: string | null, session?: FileSession): void => {
      displayedPathRef.current = path
      e.setState(
        session?.state ??
          EditorState.create({
            extensions: [
              ...extensionsRef.current,
              EditorState.readOnly.of(true)
            ]
          })
      )
      e.dispatch({
        effects:
          session?.scroll ??
          EditorView.scrollIntoView(0, { y: 'start', x: 'start' })
      })
      // CodeMirror restores its DOM selection when focused through the view.
      // Focusing only contentDOM can let Chromium choose a visible DOM position
      // instead of the cached cursor in a virtualized document.
      if (session) e.focus()
    }
    setLoading(false)
    if (!activePath || binaryPaths.has(activePath)) {
      display(null)
      return
    }
    const cached = sessionsRef.current.get(activePath)
    if (cached) {
      display(activePath, cached)
      return
    }
    display(null)
    let cancelled = false
    setLoading(true)
    window.api.fs
      .readFile(wsId, activePath)
      .then(({ content, encoding }) => {
        // A read may complete after the file was closed or its editor unmounted.
        if (
          cancelled ||
          editorRef.current !== e ||
          !useEditorStore
            .getState()
            .byWs[wsId]?.files.some((file) => file.path === activePath)
        )
          return
        if (encoding === 'base64') {
          setBinaryPaths((s) => new Set(s).add(activePath))
          if (activePathRef.current === activePath) display(null)
          return
        }
        const state = EditorState.create({
          doc: content,
          extensions: extensionsRef.current
        })
        const session: FileSession = {
          state,
          savedDoc: state.doc,
          lineSeparator: content.match(/\r\n?|\n/)?.[0] ?? '\n',
          scroll: null
        }
        sessionsRef.current.set(activePath, session)
        if (activePathRef.current === activePath) display(activePath, session)
        void loadLanguage(activePath)
          .then((language) => {
            if (!language || sessionsRef.current.get(activePath) !== session)
              return
            const transaction = session.state.update({
              effects: languageRef.current.reconfigure(language)
            })
            if (
              editorRef.current === e &&
              displayedPathRef.current === activePath
            )
              e.dispatch(transaction)
            else session.state = transaction.state
          })
          .catch((err) => console.error('language loading failed', err))
      })
      .catch((err) => {
        if (!cancelled && editorRef.current === e)
          console.error('read failed', err)
      })
      .finally(() => {
        if (!cancelled && editorRef.current === e) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activePath, wsId, binaryPaths])

  useEffect(() => {
    const open = new Set(files.map((f) => f.path))
    for (const [path] of sessionsRef.current) {
      if (!open.has(path)) {
        sessionsRef.current.delete(path)
      }
    }
    setBinaryPaths((current) => {
      const retained = new Set([...current].filter((path) => open.has(path)))
      return retained.size === current.size ? current : retained
    })
  }, [files])

  return (
    <div className="flex h-full flex-col bg-neutral-950">
      <div className="flex h-8 items-stretch overflow-x-auto border-b border-neutral-800 bg-neutral-950">
        {files.map((f) => (
          <div
            key={f.path}
            onClick={() => setActive(wsId, f.path)}
            className={`flex cursor-pointer items-center gap-1.5 border-r border-neutral-800 px-3 text-xs ${
              activePath === f.path
                ? 'bg-neutral-900 text-neutral-100'
                : 'text-neutral-500 hover:bg-neutral-900/60'
            }`}
          >
            <span className="max-w-[150px] truncate">{basename(f.path)}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                close(wsId, f.path)
              }}
              className="text-neutral-600 hover:text-red-400"
            >
              {f.dirty ? (
                <Circle
                  size={8}
                  className="fill-current text-neutral-500 hover:hidden"
                />
              ) : null}
              <X
                size={12}
                className={f.dirty ? 'hidden group-hover:block' : ''}
              />
            </button>
          </div>
        ))}
        <button
          onClick={saveActive}
          disabled={!activePath || loading || binaryPaths.has(activePath)}
          className="ml-auto self-center px-3 text-[11px] text-neutral-500 hover:text-neutral-200 disabled:opacity-40"
          title="Save (Ctrl+S / ⌘S)"
          aria-keyshortcuts="Control+S Meta+S"
        >
          Save
        </button>
      </div>

      {saveError && saveError.path === activePath && (
        <div
          role="alert"
          className="break-words border-b border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300"
        >
          Save failed: {saveError.message}
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-neutral-950/70 text-xs text-neutral-400">
            <Loader2 size={14} className="animate-spin" /> loading…
          </div>
        )}
        {!activePath && !loading && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-neutral-600">
            Open a file from the tree
          </div>
        )}
        {activePath && binaryPaths.has(activePath) && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-neutral-600">
            Binary file — not editable
          </div>
        )}
      </div>
    </div>
  )
}
