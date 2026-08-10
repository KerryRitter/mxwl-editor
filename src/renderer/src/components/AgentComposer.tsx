import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type KeyboardEvent
} from 'react'
import { ArrowUp, FileCode2, Square, Terminal } from 'lucide-react'
import type { AgentCommand } from '../../../shared/types'
import { matchCommands } from '../../../shared/agentCommands'

type Suggestion =
  | { kind: 'command'; cmd: AgentCommand }
  | { kind: 'file'; path: string }

type AgentComposerProps = {
  wsId: string
  commands: AgentCommand[]
  disabled: boolean
  running: boolean
  placeholder: string
  onSend: (text: string) => void
  onCancel: () => void
}

/** The token the caret sits in, when it's one we complete. */
type Trigger = { kind: '/' | '@'; query: string; start: number }

function triggerAt(text: string, caret: number): Trigger | null {
  const head = text.slice(0, caret)
  // A slash only means a command at the very start of the line — mid-sentence
  // paths like src/main would otherwise open the palette on every keystroke.
  const slash = /(^|\n)\/([^\s]*)$/.exec(head)
  if (slash) return { kind: '/', query: slash[2], start: caret - slash[2].length - 1 }
  const at = /(^|\s)@([^\s]*)$/.exec(head)
  if (at) return { kind: '@', query: at[2], start: caret - at[2].length - 1 }
  return null
}

export const AgentComposer: FC<AgentComposerProps> = ({
  wsId,
  commands,
  disabled,
  running,
  placeholder,
  onSend,
  onCancel
}) => {
  const [text, setText] = useState('')
  const [caret, setCaret] = useState(0)
  const [files, setFiles] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  const trigger = useMemo(() => (dismissed ? null : triggerAt(text, caret)), [text, caret, dismissed])

  useEffect(() => {
    if (trigger?.kind !== '@') {
      setFiles([])
      return
    }
    let live = true
    const id = setTimeout(() => {
      void window.api.workspace
        .listFiles(wsId, trigger.query)
        .then((res) => live && setFiles(res.slice(0, 20)))
        .catch(() => live && setFiles([]))
    }, 80)
    return () => {
      live = false
      clearTimeout(id)
    }
  }, [trigger?.kind, trigger?.query, wsId])

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!trigger) return []
    if (trigger.kind === '/') {
      return matchCommands(trigger.query, commands)
        .slice(0, 12)
        .map((cmd) => ({ kind: 'command' as const, cmd }))
    }
    return files.map((path) => ({ kind: 'file' as const, path }))
  }, [trigger, commands, files])

  useLayoutEffect(() => setIndex(0), [trigger?.kind, trigger?.query])

  const grow = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [])

  useLayoutEffect(grow, [text, grow])

  const accept = useCallback(
    (choice: Suggestion) => {
      if (!trigger) return
      const insert =
        choice.kind === 'command' ? `/${choice.cmd.name} ` : `@${choice.path} `
      const next = text.slice(0, trigger.start) + insert + text.slice(caret)
      const pos = trigger.start + insert.length
      setText(next)
      setCaret(pos)
      requestAnimationFrame(() => {
        ref.current?.focus()
        ref.current?.setSelectionRange(pos, pos)
      })
    },
    [trigger, text, caret]
  )

  // Typing during a turn is allowed — only sending is not — so the next message
  // can be written while the agent works, and Esc still reaches the textarea.
  const submit = useCallback(() => {
    const value = text.trim()
    if (!value || disabled || running) return
    onSend(value)
    setText('')
    setCaret(0)
  }, [text, disabled, running, onSend])

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setIndex((i) => (i + 1) % suggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setIndex((i) => (i - 1 + suggestions.length) % suggestions.length)
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        accept(suggestions[index])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setDismissed(true)
        return
      }
    }
    if (e.key === 'Escape' && running) {
      e.preventDefault()
      onCancel()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const sync = (el: HTMLTextAreaElement): void => {
    setText(el.value)
    setCaret(el.selectionStart)
    setDismissed(false)
  }

  return (
    <div className="relative border-t border-neutral-800 bg-neutral-950 px-2 py-1.5">
      {suggestions.length > 0 && (
        <div className="absolute bottom-full left-2 right-2 z-10 mb-1 max-h-60 overflow-auto rounded border border-neutral-800 bg-neutral-900 shadow-lg">
          {suggestions.map((s, i) => (
            <button
              key={s.kind === 'command' ? `c:${s.cmd.name}` : `f:${s.path}`}
              onMouseDown={(e) => {
                e.preventDefault()
                accept(s)
              }}
              onMouseEnter={() => setIndex(i)}
              className={`flex w-full items-center gap-2 px-2 py-1 text-left text-[11px] ${
                i === index ? 'bg-neutral-800' : ''
              }`}
            >
              {s.kind === 'command' ? (
                <>
                  {s.cmd.source === 'client' ? (
                    <Terminal size={11} className="shrink-0 text-sky-400" />
                  ) : (
                    <span className="w-[11px] shrink-0" />
                  )}
                  <span className="shrink-0 text-neutral-200">/{s.cmd.name}</span>
                  <span className="truncate text-neutral-500">{s.cmd.description}</span>
                  {/* The alias is the whole point of the translation layer: it's how
                      the user finds this agent's name for a thing they know by another. */}
                  {s.cmd.aliases.length > 0 && (
                    <span className="ml-auto shrink-0 pl-2 text-[10px] text-neutral-600">
                      {s.cmd.aliases.slice(0, 3).join(' · ')}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <FileCode2 size={11} className="shrink-0 text-neutral-600" />
                  <span className="truncate text-neutral-300">{s.path}</span>
                </>
              )}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-1.5">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => sync(e.currentTarget)}
          onKeyUp={(e) => setCaret(e.currentTarget.selectionStart)}
          onClick={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          className="max-h-[200px] flex-1 resize-none rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-[12px] text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-neutral-700 disabled:opacity-50"
        />
        {running ? (
          <button
            onClick={onCancel}
            title="Stop (Esc)"
            className="rounded bg-red-900/70 p-1.5 text-red-200 hover:bg-red-900"
          >
            <Square size={13} />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={disabled || !text.trim()}
            title="Send (Enter)"
            className="rounded bg-neutral-800 p-1.5 text-neutral-200 hover:bg-neutral-700 disabled:opacity-40"
          >
            <ArrowUp size={13} />
          </button>
        )}
      </div>
    </div>
  )
}
