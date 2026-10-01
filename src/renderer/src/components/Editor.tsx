import { useEffect, useRef, useState } from 'react'
import { Circle, Loader2, X } from 'lucide-react'
import { monaco, createCodeEditor, disposeEditor } from '../monaco-setup'
import { useEditorStore } from '../store/editor'
import { basename, languageForPath } from '../util'

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
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const modelsRef = useRef<Map<string, monaco.editor.ITextModel>>(new Map())
  const activePathRef = useRef<string | null>(activePath)
  const wsIdRef = useRef<string>(wsId)
  activePathRef.current = activePath
  wsIdRef.current = wsId

  const [binaryPaths, setBinaryPaths] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

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
    const e = createCodeEditor(container, {
      automaticLayout: true,
      theme: 'mxwl-dark',
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
      fontLigatures: true,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      tabSize: 2,
      renderWhitespace: 'selection',
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      fixedOverflowWidgets: true
    })
    editorRef.current = e
    e.onDidChangeModelContent(() => {
      const p = activePathRef.current
      if (p) setDirty(wsIdRef.current, p, true)
    })
    e.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => void saveActive()
    )

    return () => {
      editorRef.current = null
      disposeEditor(e)
      modelsRef.current.forEach((m) => m.dispose())
      modelsRef.current.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function saveActive(): void {
    const p = activePathRef.current
    const e = editorRef.current
    if (!p || !e) return
    const model = e.getModel()
    if (!model) return
    window.api.fs
      .writeFile(wsIdRef.current, p, model.getValue())
      .then(() => setDirty(wsIdRef.current, p, false))
      .catch((err) => console.error('save failed', err))
  }

  useEffect(() => {
    const e = editorRef.current
    if (!e) return
    setLoading(false)
    if (!activePath || binaryPaths.has(activePath)) {
      e.setModel(null)
      return
    }
    if (modelsRef.current.has(activePath)) {
      e.setModel(modelsRef.current.get(activePath) ?? null)
      return
    }
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
          if (activePathRef.current === activePath) e.setModel(null)
          return
        }
        const model = monaco.editor.createModel(
          content,
          languageForPath(activePath)
        )
        modelsRef.current.set(activePath, model)
        if (activePathRef.current === activePath) e.setModel(model)
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
    for (const [path, model] of modelsRef.current) {
      if (!open.has(path)) {
        model.dispose()
        modelsRef.current.delete(path)
      }
    }
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
          className="ml-auto self-center px-3 text-[11px] text-neutral-500 hover:text-neutral-200"
          title="Save (⌘S)"
        >
          Save
        </button>
      </div>

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
