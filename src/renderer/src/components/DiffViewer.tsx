import { useEffect, useRef, useState, type FC } from 'react'
import {
  Binary,
  Bot,
  Check,
  Columns2,
  ExternalLink,
  FileCode2,
  GitCommitHorizontal,
  GitCompare,
  Loader2,
  RefreshCw,
  Rows2,
  Upload
} from 'lucide-react'
import type { GitChange, GitChangeKind, GitChangesSnapshot, GitFileDiff } from '../../../shared/types'
import { monaco } from '../monaco-setup'
import { basename, languageForPath } from '../util'

type DiffLayout = 'unified' | 'split'

type Props = {
  wsId: string
  storageKey: string
  visible: boolean
  onOpenCode?: (path: string) => void
  onAskAgent: (prompt: string) => void
  onOpenUrl: (url: string) => void
}

type DiffSelection = {
  side: 'before' | 'after'
  startLine: number
  endLine: number
  text: string
}

const KIND_LABEL: Record<GitChangeKind, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  untracked: 'U',
  conflicted: '!'
}

const KIND_COLOR: Record<GitChangeKind, string> = {
  modified: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
  added: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
  deleted: 'text-red-300 border-red-500/30 bg-red-500/10',
  renamed: 'text-sky-300 border-sky-500/30 bg-sky-500/10',
  copied: 'text-violet-300 border-violet-500/30 bg-violet-500/10',
  untracked: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
  conflicted: 'text-red-300 border-red-500/30 bg-red-500/10'
}

export const DiffViewer: FC<Props> = ({
  wsId,
  storageKey,
  visible,
  onOpenCode,
  onAskAgent,
  onOpenUrl
}) => {
  const [snapshot, setSnapshot] = useState<GitChangesSnapshot | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [fileDiff, setFileDiff] = useState<GitFileDiff | null>(null)
  const [loading, setLoading] = useState(false)
  const [fileLoading, setFileLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [selection, setSelection] = useState<DiffSelection | null>(null)
  const [commitMessage, setCommitMessage] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [actionNote, setActionNote] = useState<string | null>(null)
  const [layout, setLayout] = useState<DiffLayout>(() =>
    localStorage.getItem(`${storageKey}.diffLayout`) === 'unified' ? 'unified' : 'split'
  )
  const loadSeq = useRef(0)
  const refreshInFlight = useRef(false)
  const snapshotSignature = useRef('')

  const refresh = async (quiet = false): Promise<void> => {
    // Let slow SSH requests finish before polling again. Superseding every slow
    // request could otherwise leave the initial loading state visible forever.
    if (refreshInFlight.current) return
    refreshInFlight.current = true
    const seq = ++loadSeq.current
    if (!quiet) setLoading(true)
    setError(null)
    try {
      const next = await window.api.workspace.changes(wsId)
      if (seq !== loadSeq.current) return
      const signature = JSON.stringify(next.files)
      setSnapshot(next)
      setSelectedPath((current) =>
        current && next.files.some((file) => file.path === current)
          ? current
          : (next.files[0]?.path ?? null)
      )
      if (!quiet || signature !== snapshotSignature.current) {
        snapshotSignature.current = signature
        setRevision((value) => value + 1)
      }
    } catch (err) {
      if (seq === loadSeq.current) setError(errorText(err))
    } finally {
      refreshInFlight.current = false
      if (seq === loadSeq.current) setLoading(false)
    }
  }

  useEffect(() => {
    if (!visible) return
    void refresh()
    const timer = setInterval(() => void refresh(true), 6000)
    return () => {
      clearInterval(timer)
      loadSeq.current += 1
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId, visible])

  useEffect(() => {
    if (!visible || !selectedPath) {
      setFileDiff(null)
      return
    }
    let cancelled = false
    setFileLoading(true)
    setError(null)
    void window.api.workspace
      .fileDiff(wsId, selectedPath)
      .then((next) => {
        if (!cancelled) {
          setFileDiff(next)
          setSnapshot((current) => {
            if (!current) return current
            const files = current.files.map((file) =>
              file.path === next.path
                ? { ...file, additions: next.additions, deletions: next.deletions }
                : file
            )
            return {
              ...current,
              files,
              additions: files.reduce((sum, file) => sum + (file.additions ?? 0), 0),
              deletions: files.reduce((sum, file) => sum + (file.deletions ?? 0), 0)
            }
          })
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setFileDiff(null)
          setError(errorText(err))
        }
      })
      .finally(() => {
        if (!cancelled) setFileLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [wsId, selectedPath, revision, visible])

  useEffect(() => setSelection(null), [selectedPath])

  const chooseLayout = (next: DiffLayout): void => {
    setLayout(next)
    localStorage.setItem(`${storageKey}.diffLayout`, next)
  }

  const trackedAdditions = snapshot?.additions ?? 0
  const trackedDeletions = snapshot?.deletions ?? 0

  const gitAction = async (action: () => Promise<string>, clearCommit = false): Promise<void> => {
    setActionBusy(true)
    setActionNote(null)
    try {
      const note = await action()
      if (clearCommit) setCommitMessage('')
      setActionNote(note.split('\n').slice(-2).join(' · '))
      await refresh()
      setRevision((value) => value + 1)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setActionBusy(false)
    }
  }

  const askAboutSelection = (intent: 'explain' | 'fix'): void => {
    if (!fileDiff || !selection) return
    const instruction =
      intent === 'fix'
        ? 'Fix the issue in these selected changed lines. Inspect surrounding code, make the edit, and run the relevant checks.'
        : 'Explain these selected changed lines, their behavior, and any correctness or maintainability concerns.'
    onAskAgent(
      `${instruction}\n\nFile: ${fileDiff.path}\nSide: ${selection.side}\nLines: ${selection.startLine}-${selection.endLine}\n\n\`\`\`\n${selection.text.slice(0, 12_000)}\n\`\`\``
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-950">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-neutral-800 px-2">
        <GitCompare size={13} className="text-violet-400" />
        <span className="text-[11px] font-medium text-neutral-200">Working tree</span>
        {snapshot?.branch && (
          <span className="max-w-[180px] truncate rounded bg-neutral-900 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">
            {snapshot.branch}
          </span>
        )}
        {snapshot && (
          <span className="text-[10px] text-neutral-600">
            {snapshot.files.length} {snapshot.files.length === 1 ? 'file' : 'files'}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <LayoutButton
            active={layout === 'unified'}
            title="Unified diff"
            onClick={() => chooseLayout('unified')}
          >
            <Rows2 size={12} /> Unified
          </LayoutButton>
          <LayoutButton
            active={layout === 'split'}
            title="Side-by-side diff"
            onClick={() => chooseLayout('split')}
          >
            <Columns2 size={12} /> Split
          </LayoutButton>
          <button
            onClick={() => void refresh()}
            title="Refresh changes"
            className="rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-neutral-800 px-2">
        <GitCommitHorizontal size={12} className="shrink-0 text-neutral-500" />
        <input
          value={commitMessage}
          onChange={(event) => setCommitMessage(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && commitMessage.trim() && !actionBusy) {
              void gitAction(() => window.api.workspace.gitCommit(wsId, commitMessage), true)
            }
          }}
          placeholder="Commit message…"
          className="min-w-24 flex-1 rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-200 outline-none focus:border-violet-500/60"
        />
        <ActionButton
          title="Commit staged changes"
          disabled={!commitMessage.trim() || actionBusy}
          onClick={() => void gitAction(() => window.api.workspace.gitCommit(wsId, commitMessage), true)}
        >
          <Check size={11} /> Commit
        </ActionButton>
        <ActionButton
          title="Push current branch"
          disabled={actionBusy}
          onClick={() => void gitAction(() => window.api.workspace.gitPush(wsId))}
        >
          <Upload size={11} /> Push
        </ActionButton>
        <ActionButton
          title="Open a pull request for the current branch"
          disabled={actionBusy}
          onClick={() => {
            setActionBusy(true)
            setError(null)
            void window.api.workspace
              .gitPullRequestUrl(wsId)
              .then(onOpenUrl)
              .catch((err) => setError(errorText(err)))
              .finally(() => setActionBusy(false))
          }}
        >
          <ExternalLink size={11} /> PR
        </ActionButton>
        {actionNote && <span className="max-w-44 truncate text-[10px] text-emerald-400">{actionNote}</span>}
      </div>

      {error && (
        <div className="shrink-0 border-b border-red-500/20 bg-red-950/30 px-3 py-1.5 text-[11px] text-red-300">
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[260px] min-w-[180px] max-w-[38%] shrink-0 flex-col border-r border-neutral-800">
          <div className="flex h-8 shrink-0 items-center gap-2 border-b border-neutral-800 px-2 text-[10px] uppercase tracking-wider text-neutral-500">
            Changed files
            {snapshot && (
              <span className="ml-auto normal-case tracking-normal">
                <span className="text-emerald-400">+{trackedAdditions}</span>{' '}
                <span className="text-red-400">−{trackedDeletions}</span>
              </span>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {loading && !snapshot && (
              <div className="flex items-center gap-2 px-3 py-3 text-[11px] text-neutral-500">
                <Loader2 size={12} className="animate-spin" /> Reading changes…
              </div>
            )}
            {snapshot && snapshot.files.length === 0 && (
              <div className="px-3 py-8 text-center text-[11px] text-neutral-600">
                Working tree is clean.
              </div>
            )}
            {snapshot?.files.map((file) => (
              <ChangeRow
                key={file.path}
                file={file}
                active={selectedPath === file.path}
                onClick={() => setSelectedPath(file.path)}
                onOpen={onOpenCode ? () => onOpenCode(file.path) : undefined}
              />
            ))}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          {fileDiff && (
            <div className="flex h-8 shrink-0 items-center gap-2 border-b border-neutral-800 px-2 text-[10px]">
              <FileCode2 size={11} className="shrink-0 text-neutral-500" />
              <span className="min-w-0 truncate font-mono text-neutral-300">
                {fileDiff.oldPath ? `${fileDiff.oldPath} → ${fileDiff.path}` : fileDiff.path}
              </span>
              {fileDiff.staged && (
                <span className="shrink-0 rounded bg-sky-500/10 px-1.5 py-0.5 text-sky-300">staged</span>
              )}
              {fileDiff.unstaged && (
                <span className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-300">working tree</span>
              )}
              <span className="ml-auto shrink-0 font-mono">
                {fileDiff.additions != null && <span className="text-emerald-400">+{fileDiff.additions}</span>}{' '}
                {fileDiff.deletions != null && <span className="text-red-400">−{fileDiff.deletions}</span>}
              </span>
              <ActionButton
                title="Ask the agent to explain the selected lines"
                disabled={!selection || actionBusy}
                onClick={() => askAboutSelection('explain')}
              >
                <Bot size={11} /> Explain
              </ActionButton>
              <ActionButton
                title="Ask the agent to fix the selected lines"
                disabled={!selection || actionBusy}
                onClick={() => askAboutSelection('fix')}
              >
                <Bot size={11} /> Fix
              </ActionButton>
              {fileDiff.unstaged && (
                <ActionButton
                  title="Stage this entire file"
                  disabled={actionBusy}
                  onClick={() =>
                    void gitAction(() => window.api.workspace.gitStageFile(wsId, fileDiff.path))
                  }
                >
                  Stage file
                </ActionButton>
              )}
              {fileDiff.staged && (
                <ActionButton
                  title="Move this file out of the index"
                  disabled={actionBusy}
                  onClick={() =>
                    void gitAction(() => window.api.workspace.gitUnstageFile(wsId, fileDiff.path))
                  }
                >
                  Unstage
                </ActionButton>
              )}
              {onOpenCode && !fileDiff.binary && fileDiff.kind !== 'deleted' && (
                <button
                  type="button"
                  onClick={() => onOpenCode(fileDiff.path)}
                  className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100"
                >
                  Open file
                </button>
              )}
            </div>
          )}
          {fileDiff && fileDiff.hunks.length > 0 && (
            <div className="flex min-h-8 shrink-0 items-center gap-1 overflow-x-auto border-b border-neutral-800 px-2 py-1">
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-neutral-600">Hunks</span>
              {fileDiff.hunks.map((hunk, index) => (
                <button
                  key={hunk.id}
                  type="button"
                  disabled={actionBusy}
                  onClick={() =>
                    void gitAction(() =>
                      window.api.workspace.gitStageHunk(wsId, fileDiff.path, hunk.id)
                    )
                  }
                  title={`${hunk.header}\nStage only this hunk`}
                  className="shrink-0 rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 font-mono text-[9px] text-neutral-400 hover:border-emerald-600/50 hover:text-emerald-300 disabled:opacity-40"
                >
                  Stage #{index + 1} <span className="text-emerald-400">+{hunk.additions}</span>{' '}
                  <span className="text-red-400">−{hunk.deletions}</span>
                </button>
              ))}
            </div>
          )}
          <div className="relative min-h-0 flex-1">
            {fileDiff && !fileDiff.binary && (
              <MonacoDiff
                key={`${wsId}:${fileDiff.path}`}
                wsId={wsId}
                file={fileDiff}
                layout={layout}
                onSelection={setSelection}
              />
            )}
            {fileDiff?.binary && (
              <Empty icon={<Binary size={28} />} text="Binary file changed — no text diff available." />
            )}
            {!fileDiff && !fileLoading && snapshot?.files.length === 0 && (
              <Empty icon={<GitCompare size={28} />} text="No uncommitted changes." />
            )}
            {!fileDiff && !fileLoading && snapshot && snapshot.files.length > 0 && !error && (
              <Empty icon={<FileCode2 size={28} />} text="Select a changed file." />
            )}
            {fileLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-neutral-950/70 text-xs text-neutral-400">
                <Loader2 size={14} className="animate-spin" /> Building diff…
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

const ChangeRow: FC<{
  file: GitChange
  active: boolean
  onClick: () => void
  onOpen?: () => void
}> = ({ file, active, onClick, onOpen }) => {
  const slash = file.path.lastIndexOf('/')
  const directory = slash >= 0 ? file.path.slice(0, slash) : ''
  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onOpen}
      title={`${file.oldPath ? `${file.oldPath} → ` : ''}${file.path}${onOpen ? '\nDouble-click to open in Code' : ''}`}
      className={`group flex w-full items-center gap-2 px-2 py-1.5 text-left ${
        active ? 'bg-violet-500/10 text-neutral-100' : 'text-neutral-400 hover:bg-neutral-900'
      }`}
    >
      <span
        className={`grid h-4 w-4 shrink-0 place-items-center rounded border font-mono text-[9px] font-semibold ${KIND_COLOR[file.kind]}`}
      >
        {KIND_LABEL[file.kind]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px]">{basename(file.path)}</span>
        {directory && <span className="block truncate text-[9px] text-neutral-600">{directory}</span>}
      </span>
      {(file.additions != null || file.deletions != null) && (
        <span className="shrink-0 font-mono text-[9px] opacity-80">
          <span className="text-emerald-400">+{file.additions ?? 0}</span>{' '}
          <span className="text-red-400">−{file.deletions ?? 0}</span>
        </span>
      )}
    </button>
  )
}

const MonacoDiff: FC<{
  wsId: string
  file: GitFileDiff
  layout: DiffLayout
  onSelection: (selection: DiffSelection | null) => void
}> = ({
  wsId,
  file,
  layout,
  onSelection
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)
  const onSelectionRef = useRef(onSelection)
  onSelectionRef.current = onSelection

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const editor = monaco.editor.createDiffEditor(container, {
      automaticLayout: true,
      theme: 'mxwl-dark',
      readOnly: true,
      originalEditable: false,
      renderSideBySide: layout === 'split',
      enableSplitViewResizing: true,
      renderOverviewRuler: true,
      minimap: { enabled: false },
      fontSize: 12,
      fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
      fontLigatures: true,
      scrollBeyondLastLine: false,
      renderIndicators: true,
      diffWordWrap: 'on',
      ignoreTrimWhitespace: false,
      renderMarginRevertIcon: false
    })
    editorRef.current = editor
    const disposables = [
      editor.getOriginalEditor().onDidChangeCursorSelection((event) =>
        emitSelection('before', editor.getOriginalEditor(), event.selection, onSelectionRef.current)
      ),
      editor.getModifiedEditor().onDidChangeCursorSelection((event) =>
        emitSelection('after', editor.getModifiedEditor(), event.selection, onSelectionRef.current)
      )
    ]
    return () => {
      disposables.forEach((disposable) => disposable.dispose())
      editor.dispose()
      editorRef.current = null
    }
  }, [])

  useEffect(() => {
    editorRef.current?.updateOptions({ renderSideBySide: layout === 'split' })
  }, [layout])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const language = languageForPath(file.path)
    const original = monaco.editor.createModel(
      file.oldText ?? '',
      language,
      monaco.Uri.from({
        scheme: 'mxwl-diff-before',
        authority: wsId,
        path: `/${file.oldPath ?? file.path}`
      })
    )
    const modified = monaco.editor.createModel(
      file.newText ?? '',
      language,
      monaco.Uri.from({ scheme: 'mxwl-diff-after', authority: wsId, path: `/${file.path}` })
    )
    editor.setModel({ original, modified })
    return () => {
      editor.setModel(null)
      original.dispose()
      modified.dispose()
    }
  }, [file])

  return <div ref={containerRef} className="absolute inset-0" />
}

function emitSelection(
  side: DiffSelection['side'],
  editor: monaco.editor.IStandaloneCodeEditor,
  selection: monaco.Selection,
  emit: (selection: DiffSelection | null) => void
): void {
  if (selection.isEmpty()) {
    emit(null)
    return
  }
  const model = editor.getModel()
  if (!model) return
  emit({
    side,
    startLine: selection.startLineNumber,
    endLine: selection.endLineNumber,
    text: model.getValueInRange(selection)
  })
}

const LayoutButton: FC<{
  active: boolean
  title: string
  onClick: () => void
  children: React.ReactNode
}> = ({ active, title, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${
      active ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-500 hover:text-neutral-200'
    }`}
  >
    {children}
  </button>
)

const ActionButton: FC<{
  title: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}> = ({ title, disabled, onClick, children }) => (
  <button
    type="button"
    title={title}
    disabled={disabled}
    onClick={onClick}
    className="flex shrink-0 items-center gap-1 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100 disabled:opacity-35"
  >
    {children}
  </button>
)

const Empty: FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[11px] text-neutral-600">
    <span className="text-neutral-700">{icon}</span>
    {text}
  </div>
)

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error))
