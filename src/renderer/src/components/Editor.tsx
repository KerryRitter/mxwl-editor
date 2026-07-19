import { useEffect, useRef, useState } from 'react'
import { Circle, Loader2, X } from 'lucide-react'
import { monaco } from '../monaco-setup'
import { useEditorStore } from '../store/editor'
import { basename, languageForPath } from '../util'

interface EditorProps {
  wsId: string
}

export function Editor({ wsId }: EditorProps): JSX.Element {
  const files = useEditorStore((s) => s.files)
  const activePath = useEditorStore((s) => s.activePath)
  const setActive = useEditorStore((s) => s.setActive)
  const close = useEditorStore((s) => s.close)
  const setDirty = useEditorStore((s) => s.setDirty)

  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const modelsRef = useRef<Map<string, monaco.editor.ITextModel>>(new Map())
  const fetchingRef = useRef<Set<string>>(new Set())
  const activePathRef = useRef<string | null>(activePath)
  const wsIdRef = useRef<string>(wsId)
  activePathRef.current = activePath
  wsIdRef.current = wsId

  const [binaryPaths, setBinaryPaths] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const e = monaco.editor.create(container, {
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
      if (p) setDirty(p, true)
    })
    e.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void saveActive())

    return () => {
      modelsRef.current.forEach((m) => m.dispose())
      modelsRef.current.clear()
      e.dispose()
      editorRef.current = null
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
      .then(() => setDirty(p, false))
      .catch((err) => console.error('save failed', err))
  }

  useEffect(() => {
    const e = editorRef.current
    if (!e) return
    if (!activePath || binaryPaths.has(activePath)) {
      e.setModel(null)
      return
    }
    if (modelsRef.current.has(activePath)) {
      e.setModel(modelsRef.current.get(activePath) ?? null)
      return
    }
    if (fetchingRef.current.has(activePath)) return
    fetchingRef.current.add(activePath)
    setLoading(true)
    window.api.fs
      .readFile(wsId, activePath)
      .then(({ content, encoding }) => {
        if (encoding === 'base64') {
          setBinaryPaths((s) => new Set(s).add(activePath))
          if (activePathRef.current === activePath) e.setModel(null)
          return
        }
        const model = monaco.editor.createModel(content, languageForPath(activePath))
        modelsRef.current.set(activePath, model)
        if (activePathRef.current === activePath) e.setModel(model)
      })
      .catch((err) => console.error('read failed', err))
      .finally(() => {
        fetchingRef.current.delete(activePath)
        setLoading(false)
      })
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
            onClick={() => setActive(f.path)}
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
                close(f.path)
              }}
              className="text-neutral-600 hover:text-red-400"
            >
              {f.dirty ? (
                <Circle size={8} className="fill-current text-neutral-500 hover:hidden" />
              ) : null}
              <X size={12} className={f.dirty ? 'hidden group-hover:block' : ''} />
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
